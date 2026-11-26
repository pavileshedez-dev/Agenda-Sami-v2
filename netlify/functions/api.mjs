import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import { getStore, getDeployStore } from '@netlify/blobs';

import {
  openDatabase,
  closeDatabase,
  initDatabase,
  checkDatabaseHealth,
  createVerifiedVacuumBackup,
  db,
} from '../../server/db.js';
import { handleCalendarioRoutes } from '../../server/routes/calendario.js';
import { handleTrabajoRoutes } from '../../server/routes/trabajo.js';
import { handleSemanaRoutes } from '../../server/routes/semana.js';
import { handleIaRoutes } from '../../server/routes/ia.js';
import { handleBackupRoutes } from '../../server/routes/backup.js';

const BLOB_KEY = 'agenda_sami.sqlite';
const DB_PATH = path.join(os.tmpdir(), 'agenda_sami_netlify.sqlite');
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const DIRECT_CSRF_TOKEN = 'agenda-sami-direct-session';

let loadedEtag = null;
let dbReady = false;
let requestQueue = Promise.resolve();

function serialize(fn) {
  const run = requestQueue.then(fn, fn);
  requestQueue = run.catch(() => {});
  return run;
}

function getBlobStore(context) {
  if (context && context.__mockStore) return context.__mockStore;
  try {
    const deployCtx = context?.deploy?.context;
    if (deployCtx === 'production' || !deployCtx) {
      return getStore({ name: 'agenda-sami-sqlite-prod', consistency: 'strong' });
    }
    return getDeployStore('agenda-sami-sqlite-preview');
  } catch (err) {
    console.warn('[NETLIFY-API] Blobs no disponible en este entorno:', err.message);
    return null;
  }
}

function cleanupWalFiles(dbPath) {
  for (const suffix of ['-wal', '-shm']) {
    const p = `${dbPath}${suffix}`;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
}

async function persistDatabase(store) {
  if (!store) return;
  const snapPath = path.join(
    os.tmpdir(),
    `agenda_sami_snap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.sqlite`
  );
  try {
    createVerifiedVacuumBackup(snapPath);
    const bytes = fs.readFileSync(snapPath);
    const res = await store.set(BLOB_KEY, bytes, {
      metadata: { updatedAt: new Date().toISOString() },
    });
    if (res && res.etag) {
      loadedEtag = res.etag;
    }
  } finally {
    try {
      if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
    } catch { /* ignore */ }
  }
}

async function ensureDatabaseReady(store) {
  if (store) {
    const meta = await store.getMetadata(BLOB_KEY);
    if (meta === null) {
      if (!dbReady || !fs.existsSync(DB_PATH)) {
        closeDatabase();
        cleanupWalFiles(DB_PATH);
        openDatabase(DB_PATH);
        initDatabase();
        dbReady = true;
      }
      await persistDatabase(store);
      return;
    }

    if (!dbReady || !fs.existsSync(DB_PATH) || meta.etag !== loadedEtag) {
      const remoteBuf = await store.get(BLOB_KEY, {
        type: 'arrayBuffer',
        consistency: 'strong',
      });
      if (remoteBuf) {
        closeDatabase();
        cleanupWalFiles(DB_PATH);
        fs.writeFileSync(DB_PATH, Buffer.from(remoteBuf));
        openDatabase(DB_PATH);
        initDatabase();
        loadedEtag = meta.etag;
        dbReady = true;
        return;
      }
    }
  }

  if (!dbReady || !fs.existsSync(DB_PATH)) {
    openDatabase(DB_PATH);
    initDatabase();
    dbReady = true;
  }
}

function getOwnerUser() {
  const row = db
    .prepare('SELECT id, username, nombre FROM usuarios ORDER BY id ASC LIMIT 1')
    .get();
  if (row) return row;
  return { id: 1, username: 'sami', nombre: 'Sami' };
}

function normalizePathname(rawPathname) {
  if (rawPathname.startsWith('/.netlify/functions/api')) {
    const rest = rawPathname.slice('/.netlify/functions/api'.length);
    return rest ? `/api${rest.startsWith('/') ? rest : '/' + rest}` : '/api';
  }
  return rawPathname;
}

function isKnownApiRoute(pathname) {
  return (
    pathname === '/api/health' ||
    pathname === '/api/auth' || pathname.startsWith('/api/auth/') ||
    pathname === '/api/calendario' || pathname.startsWith('/api/calendario/') ||
    pathname === '/api/trabajo' || pathname.startsWith('/api/trabajo/') ||
    pathname === '/api/semana' || pathname.startsWith('/api/semana/') ||
    pathname === '/api/ia' || pathname.startsWith('/api/ia/') ||
    pathname === '/api/backup' || pathname.startsWith('/api/backup/')
  );
}

class ResponseCollector extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this._headers = new Map();
    this._chunks = [];
    this.headersSent = false;
    this.done = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.on('finish', () => this._resolve());
    this.on('error', (err) => this._reject(err));
  }

  setHeader(name, value) {
    this._headers.set(String(name).toLowerCase(), value);
  }

  getHeader(name) {
    return this._headers.get(String(name).toLowerCase());
  }

  removeHeader(name) {
    this._headers.delete(String(name).toLowerCase());
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    this.headersSent = true;
    for (const [k, v] of Object.entries(headers)) {
      this.setHeader(k, v);
    }
    return this;
  }

  _write(chunk, encoding, callback) {
    this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  toWebResponse() {
    const headers = new Headers();
    for (const [k, v] of this._headers.entries()) {
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, String(item));
      } else if (v !== undefined && v !== null) {
        headers.set(k, String(v));
      }
    }
    if (!headers.has('cache-control')) {
      headers.set('cache-control', 'no-store, private');
    }
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'DENY');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');

    const body = this._chunks.length > 0 ? Buffer.concat(this._chunks) : null;
    return new Response(body, { status: this.statusCode, headers });
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

export default async function handler(req, context) {
  return serialize(async () => {
    const store = getBlobStore(context);
    try {
      await ensureDatabaseReady(store);
    } catch (err) {
      console.error('[NETLIFY-API] Error inicializando SQLite:', err?.message || err);
      return jsonResponse(
        { code: 'DATABASE_UNAVAILABLE', error: 'No se pudo inicializar la base de datos SQLite.' },
        503
      );
    }

    const incomingUrl = new URL(req.url);
    const pathname = normalizePathname(incomingUrl.pathname);
    const normalizedUrl = new URL(pathname + incomingUrl.search, incomingUrl.origin);
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (pathname === '/api/health' && method === 'GET') {
      const health = checkDatabaseHealth();
      return jsonResponse(
        {
          status: health.ok ? 'ok' : 'degraded',
          database: health.database,
          schemaOk: health.schemaOk,
          schemaVersion: health.schemaVersion,
          expectedSchemaVersion: health.expectedSchemaVersion,
          runtime: 'netlify-functions',
          persistence: store ? 'netlify-blobs-sqlite' : 'tmp-sqlite',
        },
        health.ok ? 200 : 503
      );
    }

    if (!isKnownApiRoute(pathname)) {
      return jsonResponse(
        { code: 'NOT_FOUND', error: `Endpoint API no encontrado: ${pathname}` },
        404
      );
    }

    const owner = getOwnerUser();

    // Acceso directo sin pasarela de registro/login
    if (pathname === '/api/auth/session' && method === 'GET') {
      return jsonResponse({
        authenticated: true,
        directAccess: true,
        user: { id: owner.id, username: owner.username, nombre: owner.nombre },
        csrfToken: DIRECT_CSRF_TOKEN,
      });
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      return jsonResponse({
        authenticated: true,
        directAccess: true,
        user: { id: owner.id, username: owner.username, nombre: owner.nombre },
        csrfToken: DIRECT_CSRF_TOKEN,
        message: 'Acceso directo activo.',
      });
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return jsonResponse({
        authenticated: true,
        directAccess: true,
        user: { id: owner.id, username: owner.username, nombre: owner.nombre },
        csrfToken: DIRECT_CSRF_TOKEN,
        message: 'Acceso directo activo.',
      });
    }

    // Parseo JSON para mutaciones
    let body = {};
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      const rawText = await req.text();
      if (rawText.trim()) {
        try {
          body = JSON.parse(rawText);
        } catch {
          return jsonResponse(
            { code: 'INVALID_JSON', error: 'Cuerpo de solicitud JSON inválido.' },
            400
          );
        }
      }
    }

    const headersObj = {};
    req.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    const nodeReq = {
      method,
      url: pathname + incomingUrl.search,
      headers: headersObj,
      socket: { remoteAddress: '127.0.0.1', encrypted: incomingUrl.protocol === 'https:' },
    };

    const nodeRes = new ResponseCollector();

    try {
      if (pathname === '/api/calendario' || pathname.startsWith('/api/calendario/')) {
        await handleCalendarioRoutes(nodeReq, nodeRes, normalizedUrl, body, owner.id);
      } else if (pathname === '/api/trabajo' || pathname.startsWith('/api/trabajo/')) {
        await handleTrabajoRoutes(nodeReq, nodeRes, normalizedUrl, body, owner.id);
      } else if (pathname === '/api/semana' || pathname.startsWith('/api/semana/')) {
        await handleSemanaRoutes(nodeReq, nodeRes, normalizedUrl, body, owner.id, owner.username);
      } else if (pathname === '/api/ia' || pathname.startsWith('/api/ia/')) {
        await handleIaRoutes(nodeReq, nodeRes, normalizedUrl, body, owner.id);
      } else if (pathname === '/api/backup' || pathname.startsWith('/api/backup/')) {
        await handleBackupRoutes(nodeReq, nodeRes, normalizedUrl, body, owner.id);
      } else {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        nodeRes.end(JSON.stringify({ code: 'NOT_FOUND', error: 'Endpoint API no encontrado.' }));
      }

      await nodeRes.done;

      if (MUTATION_METHODS.has(method) && nodeRes.statusCode < 400) {
        await persistDatabase(store);
      }

      return nodeRes.toWebResponse();
    } catch (err) {
      console.error('[NETLIFY-API] Error procesando ruta:', pathname, err?.message || err);
      return jsonResponse(
        { code: 'INTERNAL_ERROR', error: 'Error interno del servidor.' },
        500
      );
    }
  });
}
