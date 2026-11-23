import { db } from './db.js';
import { getEnvInt, getEnvBool } from './env.js';
import {
  generateOpaqueToken,
  generateCsrfToken,
  hashSessionToken,
  parseCookies,
} from './auth-crypto.js';

export const SESSION_COOKIE_NAME = 'agenda_sami_sid';

export function getSessionTtlMs() {
  const hours = getEnvInt('SESSION_TTL_HOURS', 168, { min: 1, max: 24 * 90 });
  return hours * 3600 * 1000;
}

/**
 * Determina si el proxy inverso conectado a este socket es confiable.
 * Solo confía en cabeceras X-Forwarded-* si TRUST_PROXY está activo Y la conexión entra por loopback.
 */
export function isTrustedProxy(req) {
  const trustProxy = getEnvBool('TRUST_PROXY', false);
  if (!trustProxy) return false;
  const remote = req?.socket?.remoteAddress || '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

/**
 * Permite inicio de sesión automático únicamente en uso local directo (127.0.0.1 / ::1),
 * cuando se habilita explícitamente AGENDA_LOCAL_AUTOLOGIN=true y la petición NO llega
 * a través de ningún proxy inverso ni cabecera de reenvío externo.
 */
export function isLocalAutologinAllowed(req) {
  if (!getEnvBool('AGENDA_LOCAL_AUTOLOGIN', false)) return false;
  if (getEnvBool('TRUST_PROXY', false)) return false;
  if (req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || req?.headers?.['cf-connecting-ip']) {
    return false;
  }
  const remote = req?.socket?.remoteAddress || '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

/**
 * Determina si la solicitud original del usuario llegó por HTTPS.
 */
export function isSecureRequest(req) {
  if (req?.socket?.encrypted) return true;
  if (isTrustedProxy(req)) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    return proto === 'https';
  }
  return false;
}

/**
 * Obtiene la IP cliente de forma segura (solo acepta X-Real-IP / último salto de X-Forwarded-For desde proxy loopback confiable).
 */
export function getClientIp(req) {
  if (isTrustedProxy(req)) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }
    if (req.headers['x-forwarded-for']) {
      const hops = String(req.headers['x-forwarded-for'])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // El último salto es el añadido por nuestro proxy inverso local confiable (inmune a spoofing en el primer salto)
      if (hops.length > 0) return hops[hops.length - 1];
    }
  }
  return req?.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Construye cabecera Set-Cookie endurecida (HttpOnly, SameSite=Lax, Secure en HTTPS/producción).
 */
export function buildSessionCookie(rawToken, req, maxAgeSeconds) {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = isSecureRequest(req) || isProd;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = isSecureRequest(req) || isProd;
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Elimina únicamente sesiones caducadas sin afectar sesiones activas.
 */
export function purgeExpiredSessions(nowIso = new Date().toISOString()) {
  const res = db.prepare('DELETE FROM sesiones WHERE expires_at <= ?').run(nowIso);
  return res.changes || 0;
}

/**
 * Crea una sesión persistente en SQLite almacenando únicamente el hash SHA-256 del token.
 */
export function createSession({ userId, req = null, ttlMs = null }) {
  const now = new Date();
  const effectiveTtl = ttlMs ?? getSessionTtlMs();
  const expires = new Date(now.getTime() + effectiveTtl);

  purgeExpiredSessions(now.toISOString());

  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = generateCsrfToken();
  const ua = req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 250) : null;
  const ip = req ? getClientIp(req) : null;

  db.prepare(`
    INSERT INTO sesiones (token, user_id, csrf_token, created_at, expires_at, last_seen_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, csrfToken, now.toISOString(), expires.toISOString(), now.toISOString(), ua, ip);

  return {
    rawToken,
    tokenHash,
    csrfToken,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    maxAgeSeconds: Math.floor(effectiveTtl / 1000),
  };
}

/**
 * Autentica una petición HTTP a partir de su cookie de sesión HttpOnly.
 * Devuelve null si no hay cookie, es inválida o ha caducado.
 */
export function authenticateRequest(req) {
  const cookies = parseCookies(req?.headers?.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash) return null;

  const row = db.prepare(`
    SELECT s.token, s.user_id, s.csrf_token, s.created_at, s.expires_at,
           u.username, u.nombre
    FROM sesiones s
    INNER JOIN usuarios u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(tokenHash);

  if (!row) return null;

  const nowIso = new Date().toISOString();
  if (row.expires_at <= nowIso) {
    // Eliminar la sesión caducada
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(tokenHash);
    return null;
  }

  // Actualizar última actividad de forma ligera
  try {
    db.prepare('UPDATE sesiones SET last_seen_at = ? WHERE token = ?').run(nowIso, tokenHash);
  } catch { /* no bloquear si last_seen_at no existiera */ }

  return {
    tokenHash: row.token,
    userId: row.user_id,
    username: row.username,
    nombre: row.nombre,
    csrfToken: row.csrf_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Revoca una sesión concreta de SQLite.
 */
export function revokeSessionByHash(tokenHash) {
  if (!tokenHash) return 0;
  const res = db.prepare('DELETE FROM sesiones WHERE token = ?').run(tokenHash);
  return res.changes || 0;
}

/**
 * Revoca todas las sesiones de un usuario (ej. al cambiar contraseña).
 */
export function revokeAllUserSessions(userId) {
  const res = db.prepare('DELETE FROM sesiones WHERE user_id = ?').run(userId);
  return res.changes || 0;
}
