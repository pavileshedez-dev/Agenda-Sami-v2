import { db } from '../db.js';
import { getEnvInt } from '../env.js';
import { verifyPasswordTimingSafe } from '../auth-crypto.js';
import { MemoryRateLimiter } from '../rate-limit.js';
import {
  SESSION_COOKIE_NAME,
  authenticateRequest,
  createSession,
  revokeSessionByHash,
  buildSessionCookie,
  buildClearSessionCookie,
  getClientIp,
  isLocalAutologinAllowed,
} from '../auth.js';

let loginLimiter = null;
let loginIpLimiter = null;

function getLoginLimiters() {
  const maxRequests = getEnvInt('LOGIN_RATE_LIMIT_MAX', 10, { min: 1, max: 1000 });
  const ipMaxRequests = getEnvInt('LOGIN_RATE_LIMIT_IP_MAX', Math.max(maxRequests * 3, 25), { min: 1, max: 5000 });
  const windowMs = getEnvInt('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000, max: 24 * 3600 * 1000 });
  if (!loginLimiter || loginLimiter.maxRequests !== maxRequests || loginLimiter.windowMs !== windowMs) {
    loginLimiter = new MemoryRateLimiter({ windowMs, maxRequests, name: 'login' });
  }
  if (!loginIpLimiter || loginIpLimiter.maxRequests !== ipMaxRequests || loginIpLimiter.windowMs !== windowMs) {
    loginIpLimiter = new MemoryRateLimiter({ windowMs, maxRequests: ipMaxRequests, name: 'login_ip' });
  }
  return { loginLimiter, loginIpLimiter };
}

export function resetLoginRateLimiter() {
  if (loginLimiter) loginLimiter.clearAll();
  if (loginIpLimiter) loginIpLimiter.clearAll();
}

export function handleAuthRoutes(req, res, url, body, session = null) {
  const pathname = url.pathname.replace(/^\/api\/auth/, '') || '/';
  const method = req.method;

  // ── GET /api/auth/session ──
  // Nunca devuelve csrfToken ni datos personales a usuarios anónimos,
  // salvo en modo local explícito (AGENDA_LOCAL_AUTOLOGIN=true en loopback directo sin proxy).
  if (pathname === '/session' && method === 'GET') {
    const active = session || authenticateRequest(req);
    if (!active) {
      if (isLocalAutologinAllowed(req)) {
        const owner = db.prepare('SELECT id, username, nombre FROM usuarios ORDER BY id ASC LIMIT 1').get();
        if (owner) {
          const created = createSession({ userId: owner.id, req });
          const cookie = buildSessionCookie(created.rawToken, req, created.maxAgeSeconds);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': cookie,
          });
          return res.end(JSON.stringify({
            authenticated: true,
            localAutoLogin: true,
            user: {
              id: owner.id,
              username: owner.username,
              nombre: owner.nombre,
            },
            csrfToken: created.csrfToken,
            expiresAt: created.expiresAt,
          }));
        }
      }
      const headers = { 'Content-Type': 'application/json; charset=utf-8' };
      // Si el cliente envió una cookie caducada o inválida, limpiarla
      if (req.headers.cookie && req.headers.cookie.includes(`${SESSION_COOKIE_NAME}=`)) {
        headers['Set-Cookie'] = buildClearSessionCookie(req);
      }
      res.writeHead(200, headers);
      return res.end(JSON.stringify({
        authenticated: false,
        user: null,
        csrfToken: null,
      }));
    }

    return sendJson(res, 200, {
      authenticated: true,
      user: {
        id: active.userId,
        username: active.username,
        nombre: active.nombre,
      },
      csrfToken: active.csrfToken,
      expiresAt: active.expiresAt,
    });
  }

  // ── POST /api/auth/login ──
  if (pathname === '/login' && method === 'POST') {
    const { loginLimiter: limiter, loginIpLimiter: ipLimiter } = getLoginLimiters();
    const clientIp = getClientIp(req);
    const usernameRaw = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const rateKey = `${clientIp}:${usernameRaw || 'anon'}`;
    const ipRate = ipLimiter.consume(clientIp);
    const rate = limiter.consume(rateKey);
    if (!rate.allowed || !ipRate.allowed) {
      const retryAfterSeconds = Math.max(rate.retryAfterSeconds || 0, ipRate.retryAfterSeconds || 0, 1);
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retryAfterSeconds),
      });
      return res.end(JSON.stringify({
        code: 'RATE_LIMITED',
        error: 'Demasiados intentos de inicio de sesión. Espera unos minutos antes de reintentar.',
        retryAfterSeconds,
      }));
    }

    if (!usernameRaw || !password) {
      return sendJson(res, 400, {
        code: 'INVALID_CREDENTIALS',
        error: 'Debes indicar usuario y contraseña.',
      });
    }

    const user = db.prepare(`
      SELECT id, username, nombre, password_hash
      FROM usuarios
      WHERE LOWER(username) = ?
    `).get(usernameRaw);

    const valid = verifyPasswordTimingSafe(password, user ? user.password_hash : null);
    if (!user || !user.password_hash || !valid) {
      return sendJson(res, 401, {
        code: 'INVALID_CREDENTIALS',
        error: 'Credenciales inválidas.',
      });
    }

    // Login correcto: reiniciar contador de fallos para esta clave y crear sesión persistente
    limiter.reset(rateKey);
    const created = createSession({ userId: user.id, req });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildSessionCookie(created.rawToken, req, created.maxAgeSeconds),
    });
    return res.end(JSON.stringify({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
      },
      csrfToken: created.csrfToken,
      expiresAt: created.expiresAt,
      message: 'Sesión iniciada con éxito.',
    }));
  }

  // ── POST /api/auth/logout ──
  // Protegida por autenticación y CSRF en el middleware central; revoca la sesión real en SQLite.
  if (pathname === '/logout' && method === 'POST') {
    const active = session || authenticateRequest(req);
    if (active) {
      revokeSessionByHash(active.tokenHash);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildClearSessionCookie(req),
    });
    return res.end(JSON.stringify({
      authenticated: false,
      message: 'Sesión cerrada y revocada correctamente.',
    }));
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada en /api/auth' });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
