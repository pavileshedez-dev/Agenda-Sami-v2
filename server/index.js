import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv, getEnvInt } from './env.js';
import { initDatabase, closeDatabase, checkDatabaseHealth } from './db.js';
import { authenticateRequest, isSecureRequest } from './auth.js';
import { constantTimeEqual } from './auth-crypto.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleCalendarioRoutes } from './routes/calendario.js';
import { handleTrabajoRoutes } from './routes/trabajo.js';
import { handleSemanaRoutes } from './routes/semana.js';
import { handleIaRoutes } from './routes/ia.js';
import { handleBackupRoutes } from './routes/backup.js';

const MODULE_FILE = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(MODULE_FILE);
const PROJECT_ROOT = path.join(MODULE_DIR, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

// Carga determinista de .env si existe (sin sobrescribir variables ya presentes en process.env)
loadEnv({ cwd: PROJECT_ROOT });

// Seguridad de red inmutable: enlace exclusivo a 127.0.0.1 (ignora y neutraliza HOST)
export const HOST = '127.0.0.1';
if (process.env.HOST && process.env.HOST !== '127.0.0.1') {
  console.warn(`[SEGURIDAD] Intento de sobrescritura de HOST ('${process.env.HOST}') bloqueado. El servidor se enlaza exclusivamente a ${HOST}.`);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

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

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

class PayloadTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Payload exceeds limit (${limitBytes} bytes)`);
    this.name = 'PayloadTooLargeError';
    this.statusCode = 413;
  }
}

class InvalidJsonError extends Error {
  constructor() {
    super('Invalid JSON payload');
    this.name = 'InvalidJsonError';
    this.statusCode = 400;
  }
}

function sanitizeServerLogError(err) {
  const raw = String(err?.message || err || 'Unknown error');
  return raw
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function resolveAllowedOrigins(req) {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length > 0) {
    return new Set(configured);
  }

  // En producción sin ALLOWED_ORIGINS no se permite ningún origen cruzado (mismo origen no necesita CORS)
  if (process.env.NODE_ENV === 'production') {
    return new Set();
  }

  // En desarrollo local sin ALLOWED_ORIGINS explícito: permitir Vite dev y loopback actual
  const port = getEnvInt('PORT', 3001, { min: 1, max: 65535 });
  const devOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);
  if (req?.headers?.host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host)) {
    devOrigins.add(`http://${req.headers.host}`);
  }
  return devOrigins;
}

function handleCors(req, res) {
  const rawOrigin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (!rawOrigin) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return { handled: true };
    }
    return { handled: false };
  }

  const normalizedOrigin = String(rawOrigin).trim().replace(/\/+$/, '');
  const allowed = resolveAllowedOrigins(req);

  if (allowed.has(normalizedOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return { handled: true };
    }
    return { handled: false };
  }

  // Origen no autorizado: nunca reflejar ni conceder credenciales
  if (req.method === 'OPTIONS') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 'CORS_FORBIDDEN', error: 'Origen no autorizado por política CORS.' }));
    return { handled: true };
  }
  return { handled: false };
}

function getMaxBodyBytes(pathname) {
  if (pathname === '/api/backup/import') {
    const mb = getEnvInt('BACKUP_MAX_BODY_MB', 25, { min: 1, max: 100 });
    return mb * 1024 * 1024;
  }
  return getEnvInt('API_MAX_BODY_BYTES', 1 * 1024 * 1024, { min: 1024, max: 50 * 1024 * 1024 });
}

function parseBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        fail(new PayloadTooLargeError(maxBytes));
        req.pause();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (totalBytes === 0) return resolve({});
      const raw = Buffer.concat(chunks, totalBytes).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new InvalidJsonError());
      }
    });

    req.on('error', (err) => fail(err));
  });
}

function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
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

export function createAgendaServer() {
  return http.createServer(async (req, res) => {
    try {
      applySecurityHeaders(req, res);

      const corsResult = handleCors(req, res);
      if (corsResult.handled) return;

      const port = getEnvInt('PORT', 3001, { min: 1, max: 65535 });
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:' + port}`);
      const pathname = url.pathname;

      // ── 1. Manejo exclusivo de /api y /api/* (NUNCA cae a dist/index.html) ──
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, private');

        // 1a. Health endpoint público (sin exponer rutas internas, secretos ni datos personales)
        if (pathname === '/api/health' && req.method === 'GET') {
          const health = checkDatabaseHealth();
          return sendJson(res, health.ok ? 200 : 503, {
            status: health.ok ? 'ok' : 'degraded',
            database: health.database,
            schemaOk: health.schemaOk,
            schemaVersion: health.schemaVersion,
            expectedSchemaVersion: health.expectedSchemaVersion,
            uptimeSeconds: Math.floor(process.uptime()),
          });
        }

        // 1b. Ruta desconocida bajo /api/* -> siempre 404 JSON
        if (!isKnownApiRoute(pathname)) {
          return sendJson(res, 404, {
            code: 'NOT_FOUND',
            error: `Endpoint API no encontrado: ${pathname}`,
          });
        }

        // 1c. Autenticación obligatoria y validación CSRF por sesión para rutas privadas
        const isPublic = isPublicApiEndpoint(req.method, pathname);
        let session = null;

        if (!isPublic) {
          session = authenticateRequest(req);
          if (!session) {
            return sendJson(res, 401, {
              code: 'UNAUTHORIZED',
              error: 'Autenticación requerida.',
            });
          }

          if (MUTATION_METHODS.has(req.method)) {
            const sentCsrf = req.headers['x-csrf-token'];
            if (!sentCsrf || !constantTimeEqual(String(sentCsrf), String(session.csrfToken))) {
              return sendJson(res, 403, {
                code: 'CSRF_INVALID',
                error: 'Token CSRF ausente o inválido.',
              });
            }
          }
        }

        // 1d. Parseo seguro de cuerpo JSON con conteo estricto de bytes
        let body = {};
        if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
          try {
            body = await parseBody(req, getMaxBodyBytes(pathname));
          } catch (err) {
            if (err instanceof PayloadTooLargeError) {
              return sendJson(res, 413, {
                code: 'PAYLOAD_TOO_LARGE',
                error: 'El cuerpo de la solicitud supera el tamaño máximo permitido.',
              });
            }
            return sendJson(res, 400, {
              code: 'INVALID_JSON',
              error: 'Cuerpo de solicitud JSON inválido.',
            });
          }
        }

        // 1e. Enrutamiento a handlers de dominio
        if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
          return await handleAuthRoutes(req, res, url, body, session);
        }
        if (pathname === '/api/calendario' || pathname.startsWith('/api/calendario/')) {
          return await handleCalendarioRoutes(req, res, url, body, session.userId);
        }
        if (pathname === '/api/trabajo' || pathname.startsWith('/api/trabajo/')) {
          return await handleTrabajoRoutes(req, res, url, body, session.userId);
        }
        if (pathname === '/api/semana' || pathname.startsWith('/api/semana/')) {
          return await handleSemanaRoutes(req, res, url, body, session.userId, session.username);
        }
        if (pathname === '/api/ia' || pathname.startsWith('/api/ia/')) {
          return await handleIaRoutes(req, res, url, body, session.userId);
        }
        if (pathname === '/api/backup' || pathname.startsWith('/api/backup/')) {
          return await handleBackupRoutes(req, res, url, body, session.userId);
        }

        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Endpoint API no encontrado.' });
      }

      // ── 2. Servir frontend compilado en producción (dist/) ──
      if (fs.existsSync(DIST_DIR)) {
        const resolvedDist = path.resolve(DIST_DIR);
        let decodedPath;
        try {
          decodedPath = decodeURIComponent(pathname);
        } catch {
          return sendJson(res, 400, { code: 'BAD_REQUEST', error: 'Ruta inválida.' });
        }

        const relPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
        let filePath = path.resolve(resolvedDist, relPath);

        // Protección contra path traversal
        if (filePath !== resolvedDist && !filePath.startsWith(resolvedDist + path.sep)) {
          return sendJson(res, 403, { code: 'FORBIDDEN', error: 'Acceso denegado.' });
        }

        let isSpaFallback = false;
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // Si parece un fichero estático inexistente con extensión (.js, .css, .png, etc.), devolver 404 real
          const extReq = path.extname(relPath).toLowerCase();
          if (extReq && extReq !== '.html') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Not Found');
          }
          filePath = path.join(resolvedDist, 'index.html');
          isSpaFallback = true;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const baseName = path.basename(filePath);

        const headers = { 'Content-Type': mime };
        if (isSpaFallback || baseName === 'index.html' || baseName === 'sw.js' || baseName === 'registerSW.js' || baseName === 'manifest.webmanifest') {
          headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        } else {
          headers['Cache-Control'] = 'public, max-age=3600';
        }

        const stream = fs.createReadStream(filePath);
        stream.on('error', (streamErr) => {
          console.error('[STATIC] Error leyendo archivo estático:', sanitizeServerLogError(streamErr));
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error');
          } else {
            res.destroy();
          }
        });
        res.writeHead(200, headers);
        stream.pipe(res);
        return;
      }

      return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada.' });
    } catch (err) {
      const msg = sanitizeServerLogError(err);
      console.error('[SERVER] Error no controlado en solicitud:', msg);
      const isDbError = /SQLITE|database|not open|busy|locked|corrupt/i.test(String(err?.message || ''));
      if (!res.headersSent) {
        return sendJson(res, isDbError ? 503 : 500, {
          code: isDbError ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
          error: isDbError
            ? 'Base de datos temporalmente no disponible. Reintenta en unos segundos.'
            : 'Error interno del servidor.',
        });
      }
      res.destroy();
    }
  });
}

export function attachGracefulShutdown(serverInstance) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SERVER] Señal ${signal} recibida. Cerrando HTTP y base de datos SQLite de forma segura...`);

    const forceTimer = setTimeout(() => {
      try { closeDatabase(); } catch { /* ignore */ }
      process.exit(1);
    }, 8000);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    serverInstance.close(() => {
      try {
        closeDatabase();
      } catch (err) {
        console.error('[SERVER] Error cerrando SQLite:', sanitizeServerLogError(err));
      }
      console.log('[SERVER] Apagado limpio completado.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Solo arrancar automáticamente cuando este módulo es el entrypoint directo
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(MODULE_FILE)) {
  process.on('unhandledRejection', (reason) => {
    console.error('[SERVER] UnhandledRejection:', sanitizeServerLogError(reason));
  });
  process.on('uncaughtException', (err) => {
    console.error('[SERVER] UncaughtException:', sanitizeServerLogError(err));
    try { closeDatabase(); } catch { /* ignore */ }
    process.exit(1);
  });

  initDatabase();
  const port = getEnvInt('PORT', 3001, { min: 1, max: 65535 });
  const server = createAgendaServer();
  attachGracefulShutdown(server);

  server.listen(port, HOST, () => {
    console.log(`Servidor backend de Agenda Sami activo en http://${HOST}:${port}`);
    console.log(`Seguridad de red: Escuchando exclusivamente en la interfaz local (${HOST}).`);
    console.log('Base de datos SQLite persistente conectada.');
  });
}
