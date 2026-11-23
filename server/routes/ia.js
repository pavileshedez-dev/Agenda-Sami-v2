import crypto from 'node:crypto';
import { db } from '../db.js';
import { processChat, getApiKey } from '../ai.js';
import { getEnvInt } from '../env.js';
import { MemoryRateLimiter } from '../rate-limit.js';
import { getClientIp } from '../auth.js';
import { getMadridDateString, getMadridDateTime } from '../timezone.js';

let iaLimiter = null;

function getIaLimiter() {
  const maxRequests = getEnvInt('IA_RATE_LIMIT_MAX', 30, { min: 1, max: 5000 });
  const windowMs = getEnvInt('IA_RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000, { min: 1000, max: 24 * 3600 * 1000 });
  if (!iaLimiter || iaLimiter.maxRequests !== maxRequests || iaLimiter.windowMs !== windowMs) {
    iaLimiter = new MemoryRateLimiter({ windowMs, maxRequests, name: 'ia_chat' });
  }
  return iaLimiter;
}

export function resetIaRateLimiter() {
  if (iaLimiter) iaLimiter.clearAll();
}

export async function handleIaRoutes(req, res, url, body, userId) {
  if (!userId) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' });
  }

  const pathname = url.pathname.replace(/^\/api\/ia/, '') || '/';
  const method = req.method;

  // ── /chat ──
  if (pathname === '/chat' && method === 'POST') {
    const limiter = getIaLimiter();
    const rate = limiter.consume(`user:${userId}:${getClientIp(req)}`);
    if (!rate.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(rate.retryAfterSeconds),
      });
      return res.end(JSON.stringify({
        code: 'RATE_LIMITED',
        error: 'Límite temporal de consultas de IA alcanzado. Espera unos minutos.',
        retryAfterSeconds: rate.retryAfterSeconds,
      }));
    }

    const { assistant = 'pibble', message = '', history = [] } = body;
    if (typeof message !== 'string' || !message.trim()) {
      return sendJson(res, 400, { error: 'El mensaje no puede estar vacío.' });
    }

    try {
      const result = await processChat({
        assistant,
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        userId,
      });

      return sendJson(res, 200, { data: result });
    } catch (err) {
      console.error('[IA] Error en /api/ia/chat:', err.message);
      return sendJson(res, 500, { error: 'Error procesando la conversación.' });
    }
  }

  // ── /proposal/confirm ── (Ejecución bajo consentimiento explícito)
  if (pathname === '/proposal/confirm' && method === 'POST') {
    const { proposalId } = body;
    if (!proposalId) {
      return sendJson(res, 400, { error: 'Falta proposalId.' });
    }

    const prop = db.prepare('SELECT * FROM propuestas_acciones WHERE id = ? AND user_id = ?').get(proposalId, userId);
    if (!prop) {
      return sendJson(res, 404, { error: 'Propuesta no encontrada.' });
    }
    if (prop.estado !== 'pendiente') {
      return sendJson(res, 400, { error: `La propuesta ya fue ${prop.estado}.` });
    }

    let payload = {};
    try {
      payload = JSON.parse(prop.payload);
    } catch {
      payload = {};
    }

    const hoyMadrid = getMadridDateString();
    const ahoraMadridIso = getMadridDateTime().isoLocal;

    try {
      if (prop.tipo === 'crear_turno') {
        const id = 'turno_' + crypto.randomUUID().slice(0, 8);
        const hIni = payload.hora_inicio || '09:00';
        const hFin = payload.hora_fin || '17:00';
        const [h1, m1] = hIni.split(':').map(Number);
        const [h2, m2] = hFin.split(':').map(Number);
        let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
        if (diff < 0) diff += 24;

        db.prepare(`
          INSERT INTO turnos_previstos (id, user_id, fecha, hora_inicio, hora_fin, horas_previstas, tipo_turno, notas, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          id,
          userId,
          payload.fecha || hoyMadrid,
          hIni,
          hFin,
          parseFloat(diff.toFixed(2)),
          payload.tipo_turno || 'ordinario',
          payload.notas || `Añadido con confirmación de Sami (${prop.asistente})`
        );
      } else if (prop.tipo === 'crear_tarea') {
        const id = 'tar_' + crypto.randomUUID().slice(0, 8);
        db.prepare(`
          INSERT INTO tareas (id, user_id, titulo, descripcion, asignatura, fecha, fecha_entrega, prioridad, estado, tipo, ambito, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, datetime('now'))
        `).run(
          id,
          userId,
          payload.titulo || prop.resumen,
          payload.descripcion || '',
          payload.asignatura || null,
          payload.fecha || payload.fecha_entrega || hoyMadrid,
          payload.fecha_entrega || null,
          payload.prioridad || 'media',
          payload.tipo || 'tarea',
          payload.ambito || (prop.asistente === 'pibble' ? 'trabajo' : 'academico')
        );
      } else if (prop.tipo === 'crear_evento') {
        const id = 'evt_' + crypto.randomUUID().slice(0, 8);
        db.prepare(`
          INSERT INTO eventos (id, user_id, titulo, descripcion, inicio, fin, categoria, color, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          id,
          userId,
          payload.titulo || prop.resumen,
          payload.descripcion || '',
          payload.inicio || ahoraMadridIso,
          payload.fin || null,
          payload.categoria || (prop.asistente === 'pibble' ? 'trabajo' : 'academico'),
          payload.color || '#4c6ef5'
        );
      }

      db.prepare(`
        UPDATE propuestas_acciones
        SET estado = 'confirmada', resuelto_en = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(proposalId, userId);

      return sendJson(res, 200, {
        data: {
          success: true,
          mensaje: '¡Acción confirmada y registrada en tu agenda!',
          proposalId,
          tipo: prop.tipo,
        },
      });
    } catch (execErr) {
      console.error('[IA] Error ejecutando propuesta:', execErr.message);
      return sendJson(res, 500, { error: 'Error al persistir la acción confirmada.' });
    }
  }

  // ── /proposal/reject ──
  if (pathname === '/proposal/reject' && method === 'POST') {
    const { proposalId } = body;
    if (!proposalId) {
      return sendJson(res, 400, { error: 'Falta proposalId.' });
    }

    const resUpd = db.prepare(`
      UPDATE propuestas_acciones
      SET estado = 'rechazada', resuelto_en = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(proposalId, userId);

    if (!resUpd.changes) {
      return sendJson(res, 404, { error: 'Propuesta no encontrada.' });
    }

    return sendJson(res, 200, {
      data: {
        success: true,
        mensaje: 'Propuesta descartada.',
        proposalId,
      },
    });
  }

  // ── /memorias ──
  if (pathname === '/memorias') {
    if (method === 'GET') {
      const rows = db.prepare(`
        SELECT * FROM memorias_asistentes
        WHERE user_id = ?
        ORDER BY creado_en DESC
      `).all(userId);
      return sendJson(res, 200, { data: rows });
    }

    if (method === 'POST') {
      const id = 'mem_' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO memorias_asistentes (id, user_id, asistente, categoria, clave, valor, compartida, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        userId,
        body.asistente || 'compartida',
        body.categoria || 'preferencias',
        body.clave || 'Dato',
        body.valor || '',
        body.compartida === undefined ? 1 : (body.compartida ? 1 : 0)
      );

      const nueva = db.prepare('SELECT * FROM memorias_asistentes WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, { data: nueva });
    }

    if (method === 'DELETE') {
      db.prepare('DELETE FROM memorias_asistentes WHERE user_id = ?').run(userId);
      return sendJson(res, 200, { data: { cleared: true } });
    }
  }

  if (pathname.startsWith('/memorias/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'DELETE') {
      const del = db.prepare('DELETE FROM memorias_asistentes WHERE id = ? AND user_id = ?').run(id, userId);
      if (!del.changes) {
        return sendJson(res, 404, { error: 'Recuerdo no encontrado.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /config ── (Ajustes de IA y Memoria — API keys exclusivamente por variables de entorno)
  if (pathname === '/config') {
    if (method === 'GET') {
      const deepseekKey = getApiKey('deepseek');
      const geminiKey = getApiKey('gemini');
      const compartirMemoria = db.prepare('SELECT valor FROM ajustes_usuario WHERE clave = ?').get('compartir_memoria');
      const ubicacion = db.prepare('SELECT valor FROM ajustes_usuario WHERE clave = ?').get('ubicacion_laboral');
      const uni = db.prepare('SELECT valor FROM ajustes_usuario WHERE clave = ?').get('universidad');

      return sendJson(res, 200, {
        data: {
          deepseekConfigured: Boolean(deepseekKey),
          geminiConfigured: Boolean(geminiKey),
          keysManagedByEnv: true,
          compartirMemoria: !compartirMemoria || compartirMemoria.valor === '1',
          ubicacionLaboral: ubicacion ? ubicacion.valor : 'Guadalajara, Castilla-La Mancha',
          universidad: uni ? uni.valor : 'Universidad Complutense de Madrid (UCM)',
        },
      });
    }

    if (method === 'POST') {
      // Prohibido almacenar API keys en SQLite desde HTTP
      if (body.deepseekApiKey !== undefined || body.geminiApiKey !== undefined) {
        return sendJson(res, 400, {
          code: 'API_KEYS_ENV_ONLY',
          error: 'Las claves API de DeepSeek y Gemini deben configurarse exclusivamente mediante variables de entorno del servidor (DEEPSEEK_API_KEY / GEMINI_API_KEY), nunca en la base de datos.',
        });
      }

      if (body.compartirMemoria !== undefined) {
        db.prepare('INSERT OR REPLACE INTO ajustes_usuario (clave, valor) VALUES (?, ?)').run('compartir_memoria', body.compartirMemoria ? '1' : '0');
      }
      if (body.ubicacionLaboral !== undefined) {
        db.prepare('INSERT OR REPLACE INTO ajustes_usuario (clave, valor) VALUES (?, ?)').run('ubicacion_laboral', String(body.ubicacionLaboral).trim());
      }
      if (body.universidad !== undefined) {
        db.prepare('INSERT OR REPLACE INTO ajustes_usuario (clave, valor) VALUES (?, ?)').run('universidad', String(body.universidad).trim());
      }

      return sendJson(res, 200, {
        data: { success: true, message: 'Ajustes guardados correctamente.' },
      });
    }
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada en /api/ia' });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
