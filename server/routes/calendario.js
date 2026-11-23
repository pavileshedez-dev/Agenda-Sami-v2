import crypto from 'node:crypto';
import { db } from '../db.js';
import { calculateDailyAvailability } from '../availability.js';
import {
  getMadridDateString,
  getMadridDateTime,
  addDaysMadrid,
  getMadridDayOfWeek,
} from '../timezone.js';

function formatMinutesHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function findFirstFreeSlot(mergedBusyIntervals, durationMinutes = 90, windowStart = 9 * 60, windowEnd = 21 * 60) {
  const sorted = (mergedBusyIntervals || [])
    .filter((i) => i.end > windowStart && i.start < windowEnd)
    .sort((a, b) => a.start - b.start);

  let cursor = windowStart;
  for (const interval of sorted) {
    const start = Math.max(windowStart, interval.start);
    const end = Math.min(windowEnd, interval.end);
    if (start - cursor >= durationMinutes) {
      return { start: cursor, end: cursor + durationMinutes };
    }
    if (end > cursor) {
      cursor = end;
    }
  }
  if (windowEnd - cursor >= durationMinutes) {
    return { start: cursor, end: cursor + durationMinutes };
  }
  return null;
}

export function handleCalendarioRoutes(req, res, url, body, userId) {
  if (!userId) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' });
  }

  const pathname = url.pathname.replace(/^\/api\/calendario/, '') || '/';
  const method = req.method;

  // ── /asignaturas ──
  if (pathname === '/asignaturas') {
    if (method === 'GET') {
      const rows = db.prepare('SELECT * FROM asignaturas WHERE user_id = ? ORDER BY nombre ASC').all(userId);
      return sendJson(res, 200, { data: rows });
    }
    if (method === 'POST') {
      const id = body.id || 'asig_' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO asignaturas (id, user_id, nombre, abreviatura, codigo, creditos, curso, cuatrimestre, color, curso_academico, activa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        body.nombre || 'Nueva Asignatura',
        body.abreviatura || '',
        body.codigo || '',
        body.creditos || 6,
        body.curso || 1,
        body.cuatrimestre || 1,
        body.color || '#2563eb',
        body.curso_academico || body.cursoAcademico || '2024-2025',
        body.activa === undefined ? 1 : (body.activa ? 1 : 0)
      );
      const row = db.prepare('SELECT * FROM asignaturas WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, { data: row });
    }
  }

  if (pathname.startsWith('/asignaturas/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM asignaturas WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Asignatura no encontrada.' });
      }
      const fields = [];
      const values = [];
      const allowed = ['nombre', 'abreviatura', 'codigo', 'creditos', 'curso', 'cuatrimestre', 'color', 'curso_academico', 'activa'];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(key === 'activa' ? (body[key] ? 1 : 0) : body[key]);
        }
      }
      if (body.cursoAcademico !== undefined && body.curso_academico === undefined) {
        fields.push('curso_academico = ?');
        values.push(body.cursoAcademico);
      }
      if (fields.length > 0) {
        values.push(id, userId);
        db.prepare(`UPDATE asignaturas SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
      const updated = db.prepare('SELECT * FROM asignaturas WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 200, { data: updated });
    }
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM asignaturas WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Asignatura no encontrada.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /horarios/excepciones ──
  if (pathname === '/horarios/excepciones') {
    if (method === 'GET') {
      const fecha = url.searchParams.get('fecha');
      const desde = url.searchParams.get('desde');
      const hasta = url.searchParams.get('hasta');
      let rows;
      if (fecha) {
        rows = db.prepare('SELECT * FROM horario_excepciones WHERE user_id = ? AND fecha = ?').all(userId, fecha);
      } else if (desde && hasta) {
        rows = db.prepare(`
          SELECT * FROM horario_excepciones
          WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
          ORDER BY fecha ASC
        `).all(userId, desde, hasta);
      } else {
        rows = db.prepare('SELECT * FROM horario_excepciones WHERE user_id = ? ORDER BY fecha DESC LIMIT 50').all(userId);
      }
      return sendJson(res, 200, { data: rows });
    }

    if (method === 'POST') {
      const id = body.id || 'exc_' + crypto.randomUUID().slice(0, 8);
      const horarioId = body.horario_id || body.horarioId;
      const fecha = body.fecha;
      if (!horarioId || !fecha) {
        return sendJson(res, 400, { error: 'Faltan horario_id y fecha para registrar la excepción.' });
      }

      const ownedHorario = db.prepare('SELECT id FROM horarios WHERE id = ? AND user_id = ?').get(horarioId, userId);
      if (!ownedHorario) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Horario no encontrado.' });
      }

      db.prepare(`
        INSERT INTO horario_excepciones (id, user_id, horario_id, fecha, cancelada, aula_alternativa, hora_inicio_alt, hora_fin_alt, motivo, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(horario_id, fecha) DO UPDATE SET
          cancelada = excluded.cancelada,
          aula_alternativa = excluded.aula_alternativa,
          hora_inicio_alt = excluded.hora_inicio_alt,
          hora_fin_alt = excluded.hora_fin_alt,
          motivo = excluded.motivo
      `).run(
        id,
        userId,
        horarioId,
        fecha,
        body.cancelada ? 1 : 0,
        body.aula_alternativa || body.aulaAlternativa || null,
        body.hora_inicio_alt || body.horaInicioAlt || null,
        body.hora_fin_alt || body.horaFinAlt || null,
        body.motivo || ''
      );

      const row = db.prepare('SELECT * FROM horario_excepciones WHERE horario_id = ? AND fecha = ? AND user_id = ?').get(horarioId, fecha, userId);
      return sendJson(res, 201, { data: row });
    }
  }

  if (pathname.startsWith('/horarios/excepciones/')) {
    const id = decodeURIComponent(pathname.split('/')[3]);
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM horario_excepciones WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Excepción horaria no encontrada.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /horarios ──
  if (pathname === '/horarios') {
    if (method === 'GET') {
      const fecha = url.searchParams.get('fecha') || url.searchParams.get('vigente_en');
      const historico = url.searchParams.get('historico') === 'true' || url.searchParams.get('historico') === '1';

      let sql = `
        SELECT h.*, a.nombre as asignatura_nombre, a.color as asignatura_color
        FROM horarios h
        LEFT JOIN asignaturas a ON (h.asignatura = a.id OR h.asignatura = a.nombre) AND a.user_id = h.user_id
        WHERE h.user_id = ?
      `;
      const params = [userId];

      if (fecha) {
        sql += ` AND (h.fecha_inicio IS NULL OR date(?) >= date(h.fecha_inicio)) AND (h.fecha_fin IS NULL OR date(?) <= date(h.fecha_fin))`;
        params.push(fecha, fecha);
      } else if (!historico) {
        const hoy = getMadridDateString();
        sql += ` AND (h.fecha_inicio IS NULL OR date(?) >= date(h.fecha_inicio)) AND (h.fecha_fin IS NULL OR date(?) <= date(h.fecha_fin))`;
        params.push(hoy, hoy);
      }

      sql += ` ORDER BY h.dia ASC, h.hora_inicio ASC`;
      const rows = db.prepare(sql).all(...params);

      const mapped = rows.map(r => ({
        ...r,
        dia_semana: r.dia,
        diaSemana: r.dia,
        horaInicio: r.hora_inicio,
        horaFin: r.hora_fin,
        asignatura_id: r.asignatura,
        asignaturaId: r.asignatura,
        nombre: r.asignatura_nombre || r.asignatura,
        color: r.color || r.asignatura_color || '#2563eb',
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
      }));
      return sendJson(res, 200, { data: mapped });
    }

    if (method === 'POST') {
      const id = body.id || 'hor_' + crypto.randomUUID().slice(0, 8);
      const hInicio = body.horaInicio || body.hora_inicio || '09:00';
      const hFin = body.horaFin || body.hora_fin || '11:00';
      const asig = body.asignatura || body.asignaturaId || body.asignatura_id || 'Clase';
      const dia = Number(body.dia || body.dia_semana || body.diaSemana || 1);
      const fInicio = body.fecha_inicio || body.fechaInicio || null;
      const fFin = body.fecha_fin || body.fechaFin || null;

      db.prepare(`
        INSERT INTO horarios (id, user_id, dia, hora_inicio, hora_fin, asignatura, aula, tipo, color, fecha_inicio, fecha_fin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        dia,
        hInicio,
        hFin,
        asig,
        body.aula || '',
        body.tipo || 'teoria',
        body.color || '#2563eb',
        fInicio,
        fFin
      );
      const row = db.prepare('SELECT * FROM horarios WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, {
        data: {
          ...row,
          dia_semana: row.dia,
          diaSemana: row.dia,
          horaInicio: row.hora_inicio,
          horaFin: row.hora_fin,
          asignatura_id: row.asignatura,
          asignaturaId: row.asignatura,
          fechaInicio: row.fecha_inicio,
          fechaFin: row.fecha_fin,
        }
      });
    }
  }

  if (pathname.startsWith('/horarios/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM horarios WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Horario no encontrado.' });
      }

      const fechaEfectiva = body.fecha_efectiva || body.fecha_inicio || body.fechaInicio || getMadridDateString();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEfectiva)) {
        return sendJson(res, 400, { error: 'Formato de fecha_efectiva inválido. Debe ser YYYY-MM-DD.' });
      }

      if (existing.fecha_inicio && fechaEfectiva < existing.fecha_inicio) {
        return sendJson(res, 400, {
          code: 'MODIFICACION_RETROACTIVA_INVALIDA',
          error: `No es posible aplicar una modificación con fecha efectiva (${fechaEfectiva}) anterior a la fecha de inicio del horario existente (${existing.fecha_inicio}) para preservar la coherencia del historial. Cancele o cree un nuevo horario si es necesario.`,
        });
      }

      if (existing.fecha_fin && fechaEfectiva > existing.fecha_fin) {
        return sendJson(res, 400, {
          code: 'FECHA_EFECTIVA_FUERA_DE_RANGO',
          error: `El horario existente ya cerró su vigencia el ${existing.fecha_fin}. No se puede versionar con fecha efectiva posterior (${fechaEfectiva}).`,
        });
      }

      if (existing.fecha_inicio && fechaEfectiva === existing.fecha_inicio) {
        db.exec('BEGIN TRANSACTION');
        try {
          const newDia = body.dia !== undefined ? Number(body.dia) : (body.dia_semana !== undefined ? Number(body.dia_semana) : existing.dia);
          const newHInicio = body.horaInicio || body.hora_inicio || existing.hora_inicio;
          const newHFin = body.horaFin || body.hora_fin || existing.hora_fin;
          const newAsig = body.asignatura || body.asignaturaId || body.asignatura_id || existing.asignatura;
          const newAula = body.aula !== undefined ? body.aula : (existing.aula || '');
          const newTipo = body.tipo !== undefined ? body.tipo : (existing.tipo || 'teoria');
          const newColor = body.color !== undefined ? body.color : (existing.color || '#2563eb');
          const newFechaFin = body.fecha_fin !== undefined ? body.fecha_fin : (body.fechaFin !== undefined ? body.fechaFin : existing.fecha_fin);

          db.prepare(`
            UPDATE horarios
            SET dia = ?, hora_inicio = ?, hora_fin = ?, asignatura = ?, aula = ?, tipo = ?, color = ?, fecha_fin = ?
            WHERE id = ? AND user_id = ?
          `).run(newDia, newHInicio, newHFin, newAsig, newAula, newTipo, newColor, newFechaFin, id, userId);

          db.exec('COMMIT');

          const row = db.prepare('SELECT * FROM horarios WHERE id = ? AND user_id = ?').get(id, userId);
          return sendJson(res, 200, {
            data: {
              ...row,
              id: row.id,
              id_anterior: null,
              dia_semana: row.dia,
              diaSemana: row.dia,
              horaInicio: row.hora_inicio,
              horaFin: row.hora_fin,
              asignatura_id: row.asignatura,
              asignaturaId: row.asignatura,
              fechaInicio: row.fecha_inicio,
              fechaFin: row.fecha_fin,
            },
            mensaje: 'Horario actualizado en su fecha de inicio sin duplicar ni solapar vigencias.'
          });
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch (_err) { void _err; }
          console.error('[CALENDARIO] Error actualizando horario:', err.message);
          return sendJson(res, 500, { error: 'Error al actualizar el horario.' });
        }
      }

      const cierreFecha = addDaysMadrid(fechaEfectiva, -1);

      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare('UPDATE horarios SET fecha_fin = ? WHERE id = ? AND user_id = ?').run(cierreFecha, id, userId);

        const newId = 'hor_' + crypto.randomUUID().slice(0, 8);
        const newDia = body.dia !== undefined ? Number(body.dia) : (body.dia_semana !== undefined ? Number(body.dia_semana) : existing.dia);
        const newHInicio = body.horaInicio || body.hora_inicio || existing.hora_inicio;
        const newHFin = body.horaFin || body.hora_fin || existing.hora_fin;
        const newAsig = body.asignatura || body.asignaturaId || body.asignatura_id || existing.asignatura;
        const newAula = body.aula !== undefined ? body.aula : (existing.aula || '');
        const newTipo = body.tipo !== undefined ? body.tipo : (existing.tipo || 'teoria');
        const newColor = body.color !== undefined ? body.color : (existing.color || '#2563eb');
        const newFechaFin = body.fecha_fin !== undefined ? body.fecha_fin : (body.fechaFin !== undefined ? body.fechaFin : existing.fecha_fin);

        db.prepare(`
          INSERT INTO horarios (id, user_id, dia, hora_inicio, hora_fin, asignatura, aula, tipo, color, fecha_inicio, fecha_fin)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newId, userId, newDia, newHInicio, newHFin, newAsig, newAula, newTipo, newColor, fechaEfectiva, newFechaFin);

        db.prepare(`
          UPDATE horario_excepciones
          SET horario_id = ?
          WHERE user_id = ? AND horario_id = ? AND date(fecha) >= date(?)
        `).run(newId, userId, id, fechaEfectiva);

        db.exec('COMMIT');

        const row = db.prepare('SELECT * FROM horarios WHERE id = ? AND user_id = ?').get(newId, userId);
        return sendJson(res, 200, {
          data: {
            ...row,
            id: row.id,
            id_anterior: id,
            dia_semana: row.dia,
            diaSemana: row.dia,
            horaInicio: row.hora_inicio,
            horaFin: row.hora_fin,
            asignatura_id: row.asignatura,
            asignaturaId: row.asignatura,
            fechaInicio: row.fecha_inicio,
            fechaFin: row.fecha_fin,
          },
          mensaje: 'Horario versionado con éxito: vigencia previa cerrada y nueva versión creada.'
        });
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_err) { void _err; }
        console.error('[CALENDARIO] Error versionando horario:', err.message);
        return sendJson(res, 500, { error: 'Error al versionar el horario.' });
      }
    }

    if (method === 'DELETE') {
      const existing = db.prepare('SELECT * FROM horarios WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Horario no encontrado.' });
      }

      const hoy = getMadridDateString();
      const esFuturo = Boolean(existing.fecha_inicio && existing.fecha_inicio > hoy);

      db.exec('BEGIN TRANSACTION');
      try {
        if (esFuturo) {
          const diaPrevioStr = addDaysMadrid(existing.fecha_inicio, -1);

          const horarioPrevio = db.prepare(`
            SELECT * FROM horarios
            WHERE user_id = ? AND id != ? AND (asignatura = ? OR dia = ?) AND fecha_fin = ?
            ORDER BY fecha_inicio DESC LIMIT 1
          `).get(userId, id, existing.asignatura, existing.dia, diaPrevioStr);

          let previoRestaurado = null;
          if (horarioPrevio) {
            db.prepare('UPDATE horarios SET fecha_fin = ? WHERE id = ? AND user_id = ?').run(existing.fecha_fin || null, horarioPrevio.id, userId);
            previoRestaurado = horarioPrevio.id;

            db.prepare(`
              UPDATE horario_excepciones
              SET horario_id = ?
              WHERE user_id = ? AND horario_id = ?
            `).run(horarioPrevio.id, userId, id);
          } else {
            db.prepare('DELETE FROM horario_excepciones WHERE horario_id = ? AND user_id = ?').run(id, userId);
          }

          db.prepare('DELETE FROM horarios WHERE id = ? AND user_id = ?').run(id, userId);

          db.exec('COMMIT');
          return sendJson(res, 200, {
            data: {
              id,
              deleted: true,
              version_futura_anulada: true,
              horario_anterior_recuperado: previoRestaurado,
            },
            mensaje: previoRestaurado
              ? `Versión futura anulada y vigencia del horario anterior (${previoRestaurado}) restaurada con éxito.`
              : 'Versión futura anulada con éxito.'
          });
        } else {
          let fechaFinCierre;
          if (existing.fecha_inicio && existing.fecha_inicio >= hoy) {
            fechaFinCierre = existing.fecha_inicio;
          } else {
            fechaFinCierre = addDaysMadrid(hoy, -1);
          }

          db.prepare('UPDATE horarios SET fecha_fin = ? WHERE id = ? AND user_id = ?').run(fechaFinCierre, id, userId);
          db.exec('COMMIT');

          return sendJson(res, 200, {
            data: {
              id,
              deleted: true,
              vigencia_cerrada: fechaFinCierre,
            },
            mensaje: `Vigencia del horario cerrada el ${fechaFinCierre}.`
          });
        }
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_err) { void _err; }
        console.error('[CALENDARIO] Error procesando baja de horario:', err.message);
        return sendJson(res, 500, { error: 'Error al procesar la baja del horario.' });
      }
    }
  }

  // ── /tareas ──
  if (pathname === '/tareas') {
    if (method === 'GET') {
      const ambito = url.searchParams.get('ambito');
      const estado = url.searchParams.get('estado');
      let query = `
        SELECT t.*, a.nombre as asignatura_nombre, a.color as asignatura_color
        FROM tareas t
        LEFT JOIN asignaturas a ON (t.asignatura = a.id OR t.asignatura = a.nombre) AND a.user_id = t.user_id
        WHERE t.user_id = ?
      `;
      const params = [userId];
      if (ambito) {
        query += ' AND t.ambito = ?';
        params.push(ambito);
      }
      if (estado) {
        query += ' AND t.estado = ?';
        params.push(estado);
      }
      query += ' ORDER BY t.fecha_entrega ASC, t.creado_en DESC';

      const rows = db.prepare(query).all(...params);
      const mapped = rows.map(r => ({
        ...r,
        notas: r.descripcion,
        descripcion: r.descripcion,
        asignatura_id: r.asignatura,
        asignaturaId: r.asignatura,
        fechaEntrega: r.fecha_entrega,
        fecha_entrega: r.fecha_entrega,
        fecha: r.fecha || r.fecha_entrega,
      }));
      return sendJson(res, 200, { data: mapped });
    }

    if (method === 'POST') {
      const id = body.id || 'tar_' + crypto.randomUUID().slice(0, 8);
      const fechaEntrega = body.fechaEntrega || body.fecha_entrega || body.fecha || null;
      const descripcion = body.descripcion !== undefined ? body.descripcion : (body.notas !== undefined ? body.notas : '');
      const asignatura = body.asignatura !== undefined ? body.asignatura : (body.asignaturaId || body.asignatura_id || null);

      db.prepare(`
        INSERT INTO tareas (id, user_id, titulo, descripcion, asignatura, fecha, fecha_entrega, prioridad, estado, tipo, ambito, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        userId,
        body.titulo || 'Nueva tarea',
        descripcion,
        asignatura,
        body.fecha || fechaEntrega,
        fechaEntrega,
        String(body.prioridad || 'media'),
        body.estado || 'pendiente',
        body.tipo || 'tarea',
        body.ambito || 'academico'
      );
      const row = db.prepare('SELECT * FROM tareas WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, {
        data: {
          ...row,
          notas: row.descripcion,
          asignatura_id: row.asignatura,
          asignaturaId: row.asignatura,
          fechaEntrega: row.fecha_entrega,
        }
      });
    }
  }

  if (pathname.startsWith('/tareas/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM tareas WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Tarea no encontrada.' });
      }
      const fields = [];
      const values = [];
      const fechaEntrega = body.fechaEntrega !== undefined ? body.fechaEntrega : body.fecha_entrega;
      const descripcion = body.descripcion !== undefined ? body.descripcion : body.notas;
      const asignatura = body.asignatura !== undefined ? body.asignatura : (body.asignaturaId !== undefined ? body.asignaturaId : body.asignatura_id);

      if (body.titulo !== undefined) { fields.push('titulo = ?'); values.push(body.titulo); }
      if (descripcion !== undefined) { fields.push('descripcion = ?'); values.push(descripcion); }
      if (asignatura !== undefined) { fields.push('asignatura = ?'); values.push(asignatura); }
      if (fechaEntrega !== undefined) { fields.push('fecha_entrega = ?'); values.push(fechaEntrega); }
      if (body.fecha !== undefined) { fields.push('fecha = ?'); values.push(body.fecha); }
      if (body.prioridad !== undefined) { fields.push('prioridad = ?'); values.push(String(body.prioridad)); }
      if (body.estado !== undefined) { fields.push('estado = ?'); values.push(body.estado); }
      if (body.tipo !== undefined) { fields.push('tipo = ?'); values.push(body.tipo); }
      if (body.ambito !== undefined) { fields.push('ambito = ?'); values.push(body.ambito); }

      if (fields.length > 0) {
        values.push(id, userId);
        db.prepare(`UPDATE tareas SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
      const row = db.prepare('SELECT * FROM tareas WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 200, {
        data: {
          ...row,
          notas: row.descripcion,
          asignatura_id: row.asignatura,
          asignaturaId: row.asignatura,
          fechaEntrega: row.fecha_entrega,
        }
      });
    }
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM tareas WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Tarea no encontrada.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /eventos ──
  if (pathname === '/eventos') {
    if (method === 'GET') {
      const rows = db.prepare('SELECT * FROM eventos WHERE user_id = ? ORDER BY inicio ASC').all(userId);
      return sendJson(res, 200, { data: rows });
    }
    if (method === 'POST') {
      const id = body.id || 'evt_' + crypto.randomUUID().slice(0, 8);
      const categoria = body.categoria || (body.tipo === 'vacaciones' ? 'vacaciones' : body.tipo === 'plan' ? 'plan' : 'general');
      const defaultColor = categoria === 'vacaciones' ? '#0d9488' : (categoria === 'plan' ? '#6366f1' : '#4c6ef5');
      const esDiaCompleto = (body.es_dia_completo !== undefined ? body.es_dia_completo : (body.dia_completo !== undefined ? body.dia_completo : (categoria === 'vacaciones' ? 1 : 0))) ? 1 : 0;
      const ubicacion = body.ubicacion || null;
      const madridNow = getMadridDateTime();
      const defaultInicio = `${madridNow.date}T${madridNow.time.slice(0, 5)}`;

      db.prepare(`
        INSERT INTO eventos (id, user_id, titulo, descripcion, inicio, fin, categoria, color, ubicacion, es_dia_completo, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        userId,
        body.titulo || (categoria === 'vacaciones' ? 'Vacaciones' : 'Plan'),
        body.descripcion || '',
        body.inicio || defaultInicio,
        body.fin || null,
        categoria,
        body.color || defaultColor,
        ubicacion,
        esDiaCompleto
      );
      const row = db.prepare('SELECT * FROM eventos WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, { data: row });
    }
  }

  if (pathname.startsWith('/eventos/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM eventos WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Evento no encontrado.' });
      }
      const fields = [];
      const values = [];
      if (body.titulo !== undefined) { fields.push('titulo = ?'); values.push(body.titulo); }
      if (body.descripcion !== undefined) { fields.push('descripcion = ?'); values.push(body.descripcion); }
      if (body.inicio !== undefined) { fields.push('inicio = ?'); values.push(body.inicio); }
      if (body.fin !== undefined) { fields.push('fin = ?'); values.push(body.fin); }
      if (body.categoria !== undefined) { fields.push('categoria = ?'); values.push(body.categoria); }
      if (body.color !== undefined) { fields.push('color = ?'); values.push(body.color); }
      if (body.ubicacion !== undefined) { fields.push('ubicacion = ?'); values.push(body.ubicacion); }
      if (body.es_dia_completo !== undefined || body.dia_completo !== undefined) {
        fields.push('es_dia_completo = ?');
        values.push((body.es_dia_completo || body.dia_completo) ? 1 : 0);
      }

      if (fields.length > 0) {
        values.push(id, userId);
        db.prepare(`UPDATE eventos SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
      const row = db.prepare('SELECT * FROM eventos WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 200, { data: row });
    }
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM eventos WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Evento no encontrado.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /festivos ──
  if (pathname === '/festivos') {
    if (method === 'GET') {
      const ambito = url.searchParams.get('ambito');
      let rows;
      if (ambito === 'universidad' || ambito === 'ucm' || ambito === 'madrid') {
        rows = db.prepare("SELECT * FROM festivos WHERE ambito IN ('nacional', 'madrid') ORDER BY fecha ASC").all();
      } else if (ambito === 'trabajo' || ambito === 'laboral' || ambito === 'guadalajara' || ambito === 'clm') {
        rows = db.prepare("SELECT * FROM festivos WHERE ambito IN ('nacional', 'guadalajara') ORDER BY fecha ASC").all();
      } else if (ambito) {
        rows = db.prepare('SELECT * FROM festivos WHERE ambito = ? ORDER BY fecha ASC').all(ambito);
      } else {
        rows = db.prepare('SELECT * FROM festivos ORDER BY fecha ASC').all();
      }
      return sendJson(res, 200, { data: rows });
    }
    if (method === 'POST') {
      const id = body.id || 'fest_' + crypto.randomUUID().slice(0, 8);
      db.prepare('INSERT INTO festivos (id, fecha, nombre, ambito) VALUES (?, ?, ?, ?)').run(
        id,
        body.fecha,
        body.nombre,
        body.ambito || 'nacional'
      );
      const row = db.prepare('SELECT * FROM festivos WHERE id = ?').get(id);
      return sendJson(res, 201, { data: row });
    }
  }

  if (pathname.startsWith('/festivos/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM festivos WHERE id = ?').run(id);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Festivo no encontrado.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /proyectos & /objetivos ──
  if (pathname === '/proyectos') {
    const rows = db.prepare('SELECT * FROM proyectos WHERE user_id = ?').all(userId);
    return sendJson(res, 200, { data: rows });
  }
  if (pathname === '/objetivos') {
    const rows = db.prepare('SELECT * FROM objetivos WHERE user_id = ?').all(userId);
    return sendJson(res, 200, { data: rows });
  }
  if (pathname === '/tipos-tarea') {
    const rows = db.prepare('SELECT * FROM tipos_tarea').all();
    return sendJson(res, 200, { data: rows });
  }

  // ── /hoy ──
  if (pathname === '/hoy') {
    const hoyParam = url.searchParams.get('hoy') || getMadridDateString();
    const diaNum = getMadridDayOfWeek(hoyParam);

    const clasesBase = db.prepare(`
      SELECT h.*, a.nombre as asignatura_nombre, a.color as asignatura_color
      FROM horarios h
      LEFT JOIN asignaturas a ON (h.asignatura = a.id OR h.asignatura = a.nombre) AND a.user_id = h.user_id
      WHERE h.user_id = ? AND h.dia = ?
        AND (h.fecha_inicio IS NULL OR date(?) >= date(h.fecha_inicio))
        AND (h.fecha_fin IS NULL OR date(?) <= date(h.fecha_fin))
      ORDER BY h.hora_inicio ASC
    `).all(userId, diaNum, hoyParam, hoyParam);

    const excepcionesHoy = db.prepare(`
      SELECT * FROM horario_excepciones WHERE user_id = ? AND fecha = ?
    `).all(userId, hoyParam);
    const exMap = new Map(excepcionesHoy.map(e => [e.horario_id, e]));

    const clasesHoy = clasesBase.map(c => {
      const ex = exMap.get(c.id);
      return {
        ...c,
        horaInicio: (ex && ex.hora_inicio_alt) || c.hora_inicio,
        horaFin: (ex && ex.hora_fin_alt) || c.hora_fin,
        aula: (ex && ex.aula_alternativa) || c.aula,
        cancelada: ex ? Boolean(ex.cancelada) : false,
        motivoExcepcion: ex ? ex.motivo : null,
        dia_semana: c.dia,
      };
    }).filter(c => !c.cancelada);

    const eventosHoy = db.prepare(`
      SELECT * FROM eventos
      WHERE user_id = ?
        AND date(inicio) <= date(?)
        AND (fin IS NULL OR date(fin) >= date(?) OR date(inicio) = date(?))
      ORDER BY inicio ASC
    `).all(userId, hoyParam, hoyParam, hoyParam);

    const tareasPendientes = db.prepare(`
      SELECT * FROM tareas WHERE user_id = ? AND estado != 'completado'
      ORDER BY (CASE WHEN fecha_entrega = ? THEN 1 WHEN fecha_entrega < ? THEN 0 ELSE 2 END), prioridad DESC
    `).all(userId, hoyParam, hoyParam).map(t => ({
      ...t,
      notas: t.descripcion,
      fechaEntrega: t.fecha_entrega,
    }));

    const festivosHoy = db.prepare('SELECT * FROM festivos WHERE fecha = ?').all(hoyParam);
    const festivosUniversidad = festivosHoy.filter(f => ['nacional', 'madrid'].includes(f.ambito));
    const festivosTrabajo = festivosHoy.filter(f => ['nacional', 'guadalajara'].includes(f.ambito));

    const turnosHoy = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ? AND fecha = ?').all(userId, hoyParam);

    const timeline = [
      ...clasesHoy.map(c => ({
        tipo: 'clase',
        hora: c.horaInicio,
        horaFin: c.horaFin,
        titulo: c.asignatura_nombre || c.asignatura,
        aula: c.aula,
        ambito: 'universidad',
      })),
      ...eventosHoy.map(e => ({
        tipo: 'evento',
        hora: e.inicio.slice(11, 16),
        horaFin: e.fin ? e.fin.slice(11, 16) : null,
        titulo: e.titulo,
        ambito: 'general',
      })),
      ...turnosHoy.map(tu => ({
        tipo: 'turno',
        hora: tu.hora_inicio,
        horaFin: tu.hora_fin,
        titulo: `Turno de trabajo (${tu.hora_inicio} - ${tu.hora_fin})`,
        ambito: 'trabajo',
      })),
    ].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

    const dispInfo = calculateDailyAvailability({ db, userId, dateStr: hoyParam });
    const disponibilidad = {
      ocupado_horas: dispInfo.ocupado_horas,
      libre_confirmado_horas: dispInfo.libre_confirmado_horas,
      potencialmente_disponible_horas: dispInfo.potencialmente_disponible_horas,
      sin_planificar_horas: dispInfo.sin_planificar_horas,
    };

    const prioridades = tareasPendientes.slice(0, 5).map(t => ({
      id: t.id,
      titulo: t.titulo,
      asignatura: t.asignatura,
      motivo: t.fecha_entrega === hoyParam ? 'Entrega prevista para hoy' : (t.prioridad === 'alta' || t.prioridad === '1' ? 'Prioridad alta' : 'Pendiente'),
    }));

    const sinDatos = clasesHoy.length === 0 && eventosHoy.length === 0 && tareasPendientes.length === 0 && turnosHoy.length === 0;

    return sendJson(res, 200, {
      hoy: hoyParam,
      clasesHoy,
      eventosHoy,
      tareasPendientes,
      festivosHoy,
      festivosUniversidad,
      festivosTrabajo,
      turnosHoy,
      disponibilidad,
      plan: {
        prioridades,
        timeline,
        sinDatos,
      },
    });
  }

  // ── /plan ──
  if (pathname === '/plan') {
    const hoy = url.searchParams.get('hoy') || getMadridDateString();
    const hasta7 = addDaysMadrid(hoy, 7);

    const tareasRows = db.prepare(`
      SELECT * FROM tareas
      WHERE user_id = ? AND estado != 'completado'
      ORDER BY
        CASE WHEN fecha_entrega IS NULL THEN 2 WHEN date(fecha_entrega) < date(?) THEN 0 ELSE 1 END,
        date(fecha_entrega) ASC,
        CASE prioridad WHEN 'alta' THEN 0 WHEN '1' THEN 0 WHEN 'media' THEN 1 WHEN '2' THEN 1 ELSE 2 END
      LIMIT 20
    `).all(userId, hoy);

    const prioridades = tareasRows.slice(0, 10).map((t) => {
      let motivo = 'Pendiente';
      if (t.fecha_entrega) {
        if (t.fecha_entrega < hoy) motivo = `Vencida (${t.fecha_entrega})`;
        else if (t.fecha_entrega === hoy) motivo = 'Entrega hoy';
        else motivo = `Entrega: ${t.fecha_entrega}`;
      } else if (t.prioridad === 'alta' || t.prioridad === '1') {
        motivo = 'Prioridad alta';
      }
      return {
        id: t.id,
        titulo: t.titulo,
        asignatura: t.asignatura,
        fechaEntrega: t.fecha_entrega,
        motivo,
      };
    });

    const proximos7 = tareasRows.filter(
      (t) => t.fecha_entrega && t.fecha_entrega >= hoy && t.fecha_entrega <= hasta7
    );

    const countByDate = new Map();
    for (const t of proximos7) {
      countByDate.set(t.fecha_entrega, (countByDate.get(t.fecha_entrega) || 0) + 1);
    }
    const sobrecarga = [...countByDate.entries()]
      .filter(([, entregas]) => entregas >= 2)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, entregas]) => ({ fecha, entregas }));

    // Calcular bloques sugeridos de estudio en los próximos 7 días respetando disponibilidad real y vacaciones
    const occupiedByDay = new Map();
    for (let offset = 0; offset <= 7; offset++) {
      const dayStr = addDaysMadrid(hoy, offset);
      const disp = calculateDailyAvailability({ db, userId, dateStr: dayStr });
      occupiedByDay.set(dayStr, {
        esVacaciones: disp.es_vacaciones,
        intervals: (disp.intervalos_fusionados || []).map((i) => ({ start: i.start, end: i.end })),
      });
    }

    const bloquesSugeridos = [];
    const sinHueco = [];
    for (const t of tareasRows.slice(0, 6)) {
      const limitDate = t.fecha_entrega && t.fecha_entrega >= hoy && t.fecha_entrega <= hasta7
        ? t.fecha_entrega
        : hasta7;
      let scheduled = false;
      for (let offset = 0; offset <= 7; offset++) {
        const candidateDate = addDaysMadrid(hoy, offset);
        if (candidateDate > limitDate) break;
        const dayState = occupiedByDay.get(candidateDate);
        if (!dayState || dayState.esVacaciones) continue;
        const slot = findFirstFreeSlot(dayState.intervals, 90);
        if (slot) {
          dayState.intervals.push(slot);
          bloquesSugeridos.push({
            tareaId: t.id,
            titulo: t.titulo,
            fecha: candidateDate,
            desde: formatMinutesHHMM(slot.start),
            hasta: formatMinutesHHMM(slot.end),
          });
          scheduled = true;
          break;
        }
      }
      if (!scheduled) {
        sinHueco.push({
          tareaId: t.id,
          titulo: t.titulo,
          fechaEntrega: t.fecha_entrega,
        });
      }
    }

    const eventosProximos = db.prepare(`
      SELECT id, titulo, inicio, fin, categoria FROM eventos
      WHERE user_id = ?
        AND date(inicio) >= date(?)
        AND date(inicio) <= date(?)
      ORDER BY inicio ASC
      LIMIT 6
    `).all(userId, hoy, hasta7);

    const sinDatos = tareasRows.length === 0 && eventosProximos.length === 0;

    return sendJson(res, 200, {
      hoy,
      prioridades,
      proximos7,
      sobrecarga,
      bloquesSugeridos,
      sinHueco,
      eventosProximos,
      supuestos: 'Estimación orientativa en bloques de 90 min (09:00–21:00, Europe/Madrid) evitando clases, turnos y vacaciones.',
      sinDatos,
    });
  }

  // ── /agenda ──
  if (pathname === '/agenda') {
    const desde = url.searchParams.get('desde') || getMadridDateString();
    const hasta = url.searchParams.get('hasta') || addDaysMadrid(desde, 30);
    const ambitoFestivos = url.searchParams.get('ambito');

    const eventos = db.prepare(`
      SELECT * FROM eventos
      WHERE user_id = ?
        AND date(inicio) <= date(?)
        AND (fin IS NULL OR date(fin) >= date(?) OR date(inicio) >= date(?))
      ORDER BY inicio ASC
    `).all(userId, hasta, desde, desde);

    const tareas = db.prepare(`
      SELECT * FROM tareas WHERE user_id = ? AND date(fecha_entrega) >= date(?) AND date(fecha_entrega) <= date(?)
      ORDER BY fecha_entrega ASC
    `).all(userId, desde, hasta).map(t => ({ ...t, notas: t.descripcion, fechaEntrega: t.fecha_entrega }));

    let festivosQuery = 'SELECT * FROM festivos WHERE date(fecha) >= date(?) AND date(fecha) <= date(?)';
    const festivosParams = [desde, hasta];
    if (ambitoFestivos === 'universidad') {
      festivosQuery += " AND ambito IN ('nacional', 'madrid')";
    } else if (ambitoFestivos === 'trabajo') {
      festivosQuery += " AND ambito IN ('nacional', 'guadalajara')";
    } else if (ambitoFestivos) {
      festivosQuery += ' AND ambito = ?';
      festivosParams.push(ambitoFestivos);
    }
    festivosQuery += ' ORDER BY fecha ASC';
    const festivos = db.prepare(festivosQuery).all(...festivosParams);

    const turnos = db.prepare(`
      SELECT * FROM turnos_previstos WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
      ORDER BY fecha ASC
    `).all(userId, desde, hasta);

    return sendJson(res, 200, {
      desde,
      hasta,
      eventos,
      tareas,
      festivos,
      turnos,
    });
  }

  // ── /disponibilidad ──
  if (pathname === '/disponibilidad' && method === 'GET') {
    const fecha = url.searchParams.get('fecha') || getMadridDateString();
    const disp = calculateDailyAvailability({ db, userId, dateStr: fecha });
    return sendJson(res, 200, { data: disp });
  }

  // ── /resumen ──
  if (pathname === '/resumen') {
    const totalTareas = db.prepare('SELECT COUNT(*) as count FROM tareas WHERE user_id = ?').get(userId).count;
    const tareasComp = db.prepare("SELECT COUNT(*) as count FROM tareas WHERE user_id = ? AND estado = 'completado'").get(userId).count;
    const tareasPend = db.prepare("SELECT COUNT(*) as count FROM tareas WHERE user_id = ? AND estado != 'completado'").get(userId).count;

    return sendJson(res, 200, {
      tareas: {
        total: totalTareas,
        completadas: tareasComp,
        pendientes: tareasPend,
      },
    });
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: `Ruta de calendario no encontrada: ${pathname}` });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
