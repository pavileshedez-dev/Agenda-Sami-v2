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
} from '../../server/db.js';
import { authenticateRequest } from '../../server/auth.js';
import { constantTimeEqual } from '../../server/auth-crypto.js';
import { getEnvInt } from '../../server/env.js';
import { handleAuthRoutes } from '../../server/routes/auth.js';
import { handleCalendarioRoutes } from '../../server/routes/calendario.js';
import { handleTrabajoRoutes } from '../../server/routes/trabajo.js';
import { handleSemanaRoutes } from '../../server/routes/semana.js';
import { handleIaRoutes } from '../../server/routes/ia.js';
import { handleBackupRoutes } from '../../server/routes/backup.js';

const BLOB_KEY = 'agenda_sami.sqlite';
const DB_PATH = path.join(os.tmpdir(), 'agenda_sami_netlify.sqlite');
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

let loadedEtag = null;
let dbReady = false;
let requestQueue = Promise.resolve();

function serialize(fn) {
  const run = requestQueue.then(fn, fn);
  requestQueue = run.catch(() => {});
  return run;
}

export function resetAdapterStateForTest() {
  closeDatabase();
  loadedEtag = null;
  dbReady = false;
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

/**
 * Persiste una instantánea atómica verificada (VACUUM INTO + integrity_check + FK check)
 * usando control de concurrencia optimista (onlyIfMatch) para evitar sobrescrituras silenciosas
 * si otra instancia concurrente actualizó el blob.
 */
async function persistDatabase(store, { initialCreate = false } = {}) {
  if (!store) return { persisted: false, conflict: false };
  const snapPath = path.join(
    os.tmpdir(),
    `agenda_sami_snap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.sqlite`
  );
  try {
    createVerifiedVacuumBackup(snapPath);
    const bytes = fs.readFileSync(snapPath);
    const writeOpts = {
      metadata: { updatedAt: new Date().toISOString() },
    };
    if (initialCreate && !loadedEtag) {
      writeOpts.onlyIfNew = true;
    } else if (loadedEtag) {
      writeOpts.onlyIfMatch = loadedEtag;
    }
    const res = await store.set(BLOB_KEY, bytes, writeOpts);
    if (res && res.modified === false) {
      // Otra instancia escribió un estado más reciente: invalidar caché local y señalar conflicto.
      loadedEtag = null;
      dbReady = false;
      closeDatabase();
      return { persisted: false, conflict: true };
    }
    if (res && res.etag) {
      loadedEtag = res.etag;
    }
    return { persisted: true, conflict: false, etag: loadedEtag };
  } finally {
    try {
      if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
    } catch { /* ignore */ }
  }
}

async function ensureDatabaseReady(store, customDbPath = DB_PATH) {
  if (store) {
    const meta = await store.getMetadata(BLOB_KEY);
    if (meta === null) {
      if (!dbReady || !fs.existsSync(customDbPath)) {
        closeDatabase();
        cleanupWalFiles(customDbPath);
        openDatabase(customDbPath);
        initDatabase();
        dbReady = true;
      }
      await persistDatabase(store, { initialCreate: true });
      return;
    }

    if (!dbReady || !fs.existsSync(customDbPath) || meta.etag !== loadedEtag) {
      const remoteBuf = await store.get(BLOB_KEY, {
        type: 'arrayBuffer',
        consistency: 'strong',
      });
      if (remoteBuf) {
        closeDatabase();
        cleanupWalFiles(customDbPath);
        fs.writeFileSync(customDbPath, Buffer.from(remoteBuf));
        openDatabase(customDbPath);
        initDatabase();
        loadedEtag = meta.etag;
        dbReady = true;
        return;
      }
    }
  }

  if (!dbReady || !fs.existsSync(customDbPath)) {
    openDatabase(customDbPath);
    initDatabase();
    dbReady = true;
  }
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

function isPublicApiEndpoint(method, pathname) {
  if (method === 'GET' && pathname === '/api/health') return true;
  if (method === 'GET' && pathname === '/api/auth/session') return true;
  if (method === 'POST' && pathname === '/api/auth/login') return true;
  return false;
}

function getMaxBodyBytes(pathname) {
  if (pathname === '/api/backup/import') {
    const mb = getEnvInt('BACKUP_MAX_BODY_MB', 25, { min: 1, max: 100 });
    return mb * 1024 * 1024;
  }
  return getEnvInt('API_MAX_BODY_BYTES', 1 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 });
}

class ResponseCollector extends Writable {
  constructor(isHttps = true) {
    super();
    this.isHttps = isHttps;
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
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('content-security-policy', CSP_HEADER);
    if (this.isHttps) {
      headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }

    const body = this._chunks.length > 0 ? Buffer.concat(this._chunks) : null;
    return new Response(body, { status: this.statusCode, headers });
  }
}

function jsonResponse(obj, status = 200, isHttps = true) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': CSP_HEADER,
  };
  if (isHttps) {
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  }
  return new Response(JSON.stringify(obj), { status, headers });
}

export default async function handler(req, context) {
  return serialize(async () => {
    const incomingUrl = new URL(req.url);
    const isHttps = incomingUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    const store = getBlobStore(context);
    const dbFile = context?.__dbPath || DB_PATH;

    try {
      await ensureDatabaseReady(store, dbFile);
    } catch (err) {
      console.error('[NETLIFY-API] Error inicializando SQLite:', err?.message || err);
      return jsonResponse(
        { code: 'DATABASE_UNAVAILABLE', error: 'No se pudo inicializar la base de datos SQLite.' },
        503,
        isHttps
      );
    }

    const pathname = normalizePathname(incomingUrl.pathname);
    const normalizedUrl = new URL(pathname + incomingUrl.search, incomingUrl.origin);
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // 1a. Health endpoint público (sin exponer rutas internas, secretos ni datos personales)
    if (pathname === '/api/health' && method === 'GET') {
      const health = checkDatabaseHealth();
      return jsonResponse(
        {
          status: health.ok ? 'ok' : 'degraded',
          database: health.database,
          schemaOk: health.schemaOk,
          schemaVersion: health.schemaVersion,
          expectedSchemaVersion: health.expectedSchemaVersion,
          uptimeSeconds: Math.floor(process.uptime()),
        },
        health.ok ? 200 : 503,
        isHttps
      );
    }

    // 1b. Ruta desconocida bajo /api/* -> siempre 404 JSON
    if (!isKnownApiRoute(pathname)) {
      return jsonResponse(
        { code: 'NOT_FOUND', error: `Endpoint API no encontrado: ${pathname}` },
        404,
        isHttps
      );
    }

    const headersObj = {};
    req.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });
    if (isHttps && !headersObj['x-forwarded-proto']) {
      headersObj['x-forwarded-proto'] = 'https';
    }

    const nodeReq = {
      method,
      url: pathname + incomingUrl.search,
      headers: headersObj,
      socket: { remoteAddress: '127.0.0.1', encrypted: isHttps },
    };

    // 1c. Autenticación obligatoria y validación CSRF por sesión (idéntica a server/index.js)
    const isPublic = isPublicApiEndpoint(method, pathname);
    let session = null;

    if (!isPublic) {
      session = authenticateRequest(nodeReq);
      if (!session) {
        return jsonResponse(
          { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' },
          401,
          isHttps
        );
      }

      if (MUTATION_METHODS.has(method)) {
        const sentCsrf = headersObj['x-csrf-token'];
        if (!sentCsrf || !constantTimeEqual(String(sentCsrf), String(session.csrfToken))) {
          return jsonResponse(
            { code: 'CSRF_INVALID', error: 'Token CSRF ausente o inválido.' },
            403,
            isHttps
          );
        }
      }
    }

    // 1d. Parseo seguro de cuerpo JSON con límite de tamaño
    let body = {};
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      const maxBytes = getMaxBodyBytes(pathname);
      const rawBuf = Buffer.from(await req.arrayBuffer());
      if (rawBuf.length > maxBytes) {
        return jsonResponse(
          { code: 'PAYLOAD_TOO_LARGE', error: 'El cuerpo de la solicitud supera el tamaño máximo permitido.' },
          413,
          isHttps
        );
      }
      const rawText = rawBuf.toString('utf8');
      if (rawText.trim()) {
        try {
          body = JSON.parse(rawText);
        } catch {
          return jsonResponse(
            { code: 'INVALID_JSON', error: 'Cuerpo de solicitud JSON inválido.' },
            400,
            isHttps
          );
        }
      }
    }

    const nodeRes = new ResponseCollector(isHttps);

    try {
      if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
        await handleAuthRoutes(nodeReq, nodeRes, normalizedUrl, body, session);
      } else if (pathname === '/api/calendario' || pathname.startsWith('/api/calendario/')) {
        await handleCalendarioRoutes(nodeReq, nodeRes, normalizedUrl, body, session.userId);
      } else if (pathname === '/api/trabajo' || pathname.startsWith('/api/trabajo/')) {
        await handleTrabajoRoutes(nodeReq, nodeRes, normalizedUrl, body, session.userId);
      } else if (pathname === '/api/semana' || pathname.startsWith('/api/semana/')) {
        await handleSemanaRoutes(nodeReq, nodeRes, normalizedUrl, body, session.userId, session.username);
      } else if (pathname === '/api/ia' || pathname.startsWith('/api/ia/')) {
        await handleIaRoutes(nodeReq, nodeRes, normalizedUrl, body, session.userId);
      } else if (pathname === '/api/backup' || pathname.startsWith('/api/backup/')) {
        await handleBackupRoutes(nodeReq, nodeRes, normalizedUrl, body, session.userId);
      } else {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        nodeRes.end(JSON.stringify({ code: 'NOT_FOUND', error: 'Endpoint API no encontrado.' }));
      }

      await nodeRes.done;

      if (MUTATION_METHODS.has(method) && nodeRes.statusCode < 400) {
        const persistRes = await persistDatabase(store);
        if (persistRes.conflict) {
          return jsonResponse(
            {
              code: 'CONCURRENT_WRITE_CONFLICT',
              error: 'Conflicto de escritura simultánea detectado en almacenamiento remoto. Reintenta la operación.',
            },
            409,
            isHttps
          );
        }
      }

      return nodeRes.toWebResponse();
    } catch (err) {
      console.error('[NETLIFY-API] Error procesando ruta:', pathname, err?.message || err);
      return jsonResponse(
        { code: 'INTERNAL_ERROR', error: 'Error interno del servidor.' },
        500,
        isHttps
      );
    }
  });
}
