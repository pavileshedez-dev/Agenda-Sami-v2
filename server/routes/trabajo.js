import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  calculateShiftDuration,
  inspectWallTime,
  getMadridDateTime,
  getMadridDateString,
  addDaysMadrid,
  getMadridWeekRange,
} from '../timezone.js';

function validarEleccionDst(eleccion, status) {
  if (!eleccion) return false;
  if (status === 'inexistente') {
    return eleccion === 'avanzar' || eleccion === 'retroceder';
  }
  if (status === 'ambigua') {
    return eleccion === 'primera' || eleccion === 'segunda';
  }
  return true;
}

function serializarDstEleccion(elecEntrada, elecSalida) {
  if (elecEntrada && elecSalida) {
    return JSON.stringify({ entrada: elecEntrada, salida: elecSalida });
  }
  return elecEntrada || elecSalida || null;
}

export function handleTrabajoRoutes(req, res, url, body, userId) {
  if (!userId) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' });
  }

  const pathname = url.pathname.replace(/^\/api\/trabajo/, '') || '/';
  const method = req.method;

  // ── /estado ── (Fichaje en vivo actual)
  if (pathname === '/estado' && method === 'GET') {
    const activa = db.prepare(`
      SELECT * FROM jornadas_laborales
      WHERE user_id = ? AND estado = 'activa'
      ORDER BY creado_en DESC LIMIT 1
    `).get(userId);

    if (!activa) {
      return sendJson(res, 200, { data: { fichado: false, jornada: null } });
    }

    return sendJson(res, 200, {
      data: {
        fichado: true,
        jornada: activa,
      },
    });
  }

  // ── /fichar ── (Acciones: entrada, pausa_inicio, pausa_fin, salida)
  if (pathname === '/fichar' && method === 'POST') {
    const action = body.action;
    const now = new Date();
    const madridNow = getMadridDateTime(now);
    const hoyStr = madridNow.date;
    const horaActual = madridNow.time; // HH:MM:SS en Europe/Madrid

    const activa = db.prepare(`
      SELECT * FROM jornadas_laborales
      WHERE user_id = ? AND estado = 'activa'
      ORDER BY creado_en DESC LIMIT 1
    `).get(userId);

    if (action === 'entrada') {
      if (activa) {
        return sendJson(res, 400, { error: 'Ya tienes una jornada activa iniciada a las ' + activa.hora_entrada });
      }
      const id = 'jorn_' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO jornadas_laborales (id, user_id, fecha, hora_entrada, estado, creado_en)
        VALUES (?, ?, ?, ?, 'activa', datetime('now'))
      `).run(id, userId, hoyStr, horaActual);

      const nueva = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, { data: { fichado: true, jornada: nueva } });
    }

    if (!activa) {
      return sendJson(res, 400, { error: 'No tienes ninguna jornada activa iniciada.' });
    }

    if (action === 'pausa_inicio') {
      if (activa.en_pausa) {
        return sendJson(res, 400, { error: 'La jornada ya se encuentra en pausa.' });
      }
      db.prepare(`
        UPDATE jornadas_laborales
        SET en_pausa = 1, inicio_pausa_actual = ?
        WHERE id = ? AND user_id = ?
      `).run(now.toISOString(), activa.id, userId);

      const updated = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(activa.id, userId);
      return sendJson(res, 200, { data: { fichado: true, jornada: updated } });
    }

    if (action === 'pausa_fin') {
      if (!activa.en_pausa) {
        return sendJson(res, 400, { error: 'La jornada no está en pausa.' });
      }
      const pausaStart = activa.inicio_pausa_actual ? new Date(activa.inicio_pausa_actual) : now;
      const diffMs = Math.max(0, now.getTime() - pausaStart.getTime());
      const minPausa = Math.round(diffMs / 60000);
      const totalPausa = (activa.pausa_minutos || 0) + minPausa;

      db.prepare(`
        UPDATE jornadas_laborales
        SET en_pausa = 0, inicio_pausa_actual = NULL, pausa_minutos = ?
        WHERE id = ? AND user_id = ?
      `).run(totalPausa, activa.id, userId);

      const updated = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(activa.id, userId);
      return sendJson(res, 200, { data: { fichado: true, jornada: updated } });
    }

    if (action === 'salida') {
      let totalPausa = activa.pausa_minutos || 0;
      if (activa.en_pausa && activa.inicio_pausa_actual) {
        const diffMs = Math.max(0, now.getTime() - new Date(activa.inicio_pausa_actual).getTime());
        totalPausa += Math.round(diffMs / 60000);
      }

      const eleccion = body.dst_eleccion || body.dstEleccion || body.dst_resolucion || body.dst_ocurrencia || null;
      const shift = calculateShiftDuration({
        fechaEntrada: activa.fecha,
        horaEntrada: activa.hora_entrada,
        fechaSalida: hoyStr,
        horaSalida: horaActual,
        pausaMinutos: totalPausa,
        dstEleccion: eleccion,
      });

      const horasTrabajadas = shift.horasReales;

      const turno = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ? AND fecha = ?').get(userId, activa.fecha);
      const horasPrevistas = turno ? turno.horas_previstas : shift.horasPrevistasContrato;
      const horasExtra = parseFloat(Math.max(0, horasTrabajadas - horasPrevistas).toFixed(2));
      const dstPersist = eleccion || shift.infoDst.eleccionAplicada || (shift.infoDst.esTransicionDst ? shift.infoDst.tipoTransicion : null);

      db.prepare(`
        UPDATE jornadas_laborales
        SET fecha_salida = ?, hora_salida = ?, en_pausa = 0, inicio_pausa_actual = NULL,
            pausa_minutos = ?, horas_trabajadas = ?, horas_extra = ?, estado = 'completada',
            dst_eleccion = ?
        WHERE id = ? AND user_id = ?
      `).run(shift.fechaSalida, horaActual, totalPausa, horasTrabajadas, horasExtra, dstPersist, activa.id, userId);

      const cerrada = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(activa.id, userId);
      return sendJson(res, 200, {
        data: {
          fichado: false,
          jornada: {
            ...cerrada,
            horas_reales: shift.horasReales,
            horas_contractuales: shift.horasPrevistasContrato,
            info_dst: shift.infoDst,
          },
        },
      });
    }

    return sendJson(res, 400, { error: 'Acción de fichaje desconocida: ' + action });
  }

  // ── /turnos ── (Planificados)
  if (pathname === '/turnos') {
    if (method === 'GET') {
      const desde = url.searchParams.get('desde');
      const hasta = url.searchParams.get('hasta');
      let rows;
      if (desde && hasta) {
        rows = db.prepare(`
          SELECT * FROM turnos_previstos
          WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
          ORDER BY fecha ASC, hora_inicio ASC
        `).all(userId, desde, hasta);
      } else {
        rows = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ? ORDER BY fecha DESC LIMIT 50').all(userId);
      }
      return sendJson(res, 200, { data: rows });
    }

    if (method === 'POST') {
      const id = body.id || 'turno_' + crypto.randomUUID().slice(0, 8);
      const hIni = body.hora_inicio || body.horaInicio || '09:00';
      const hFin = body.hora_fin || body.horaFin || '17:00';

      const [h1, m1] = hIni.split(':').map(Number);
      const [h2, m2] = hFin.split(':').map(Number);
      let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
      if (diff < 0) diff += 24;
      const horasPrevistas = parseFloat(diff.toFixed(2));

      db.prepare(`
        INSERT INTO turnos_previstos (id, user_id, fecha, hora_inicio, hora_fin, horas_previstas, tipo_turno, notas, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        userId,
        body.fecha || getMadridDateString(),
        hIni,
        hFin,
        horasPrevistas,
        body.tipo_turno || body.tipoTurno || 'ordinario',
        body.notas || ''
      );

      const row = db.prepare('SELECT * FROM turnos_previstos WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, { data: row });
    }
  }

  if (pathname.startsWith('/turnos/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);
    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM turnos_previstos WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Turno no encontrado.' });

      const hIni = body.hora_inicio || body.horaInicio || existing.hora_inicio;
      const hFin = body.hora_fin || body.horaFin || existing.hora_fin;

      const [h1, m1] = hIni.split(':').map(Number);
      const [h2, m2] = hFin.split(':').map(Number);
      let diff = (h2 + m2 / 60) - (h1 + m1 / 60);
      if (diff < 0) diff += 24;
      const horasPrevistas = parseFloat(diff.toFixed(2));

      const fields = ['hora_inicio = ?', 'hora_fin = ?', 'horas_previstas = ?'];
      const values = [hIni, hFin, horasPrevistas];

      if (body.fecha !== undefined) { fields.push('fecha = ?'); values.push(body.fecha); }
      if (body.tipo_turno !== undefined || body.tipoTurno !== undefined) {
        fields.push('tipo_turno = ?'); values.push(body.tipo_turno || body.tipoTurno);
      }
      if (body.notas !== undefined) { fields.push('notas = ?'); values.push(body.notas); }

      values.push(id, userId);
      db.prepare(`UPDATE turnos_previstos SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);

      const updated = db.prepare('SELECT * FROM turnos_previstos WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 200, { data: updated });
    }
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM turnos_previstos WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Turno no encontrado.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /jornadas ── (Historial de jornadas reales y corrección manual)
  if (pathname === '/jornadas') {
    if (method === 'GET') {
      const rows = db.prepare(`
        SELECT j.*, t.horas_previstas AS turno_horas_previstas
        FROM jornadas_laborales j
        LEFT JOIN turnos_previstos t ON t.user_id = j.user_id AND t.fecha = j.fecha
        WHERE j.user_id = ?
        ORDER BY j.fecha DESC, j.hora_entrada DESC LIMIT 60
      `).all(userId);
      const mapped = rows.map(r => ({
        ...r,
        horas_reales: r.horas_trabajadas,
        horas_contractuales: r.turno_horas_previstas !== null && r.turno_horas_previstas !== undefined ? r.turno_horas_previstas : r.horas_trabajadas,
        dst_eleccion: r.dst_eleccion,
      }));
      return sendJson(res, 200, { data: mapped });
    }

    if (method === 'POST') {
      const id = body.id || 'jorn_' + crypto.randomUUID().slice(0, 8);
      const hEntrada = body.hora_entrada || body.horaEntrada || '09:00:00';
      const hSalida = body.hora_salida || body.horaSalida || '17:00:00';
      const pausa = Number(body.pausa_minutos || body.pausaMinutos || 0);
      const fecha = body.fecha || getMadridDateString();

      let prelimFechaSalida = body.fecha_salida || body.fechaSalida;
      if (!prelimFechaSalida) {
        const [h1, m1] = hEntrada.split(':').map(Number);
        const [h2, m2] = hSalida.split(':').map(Number);
        if ((h2 * 60 + m2) < (h1 * 60 + m1)) {
          prelimFechaSalida = addDaysMadrid(fecha, 1);
        } else {
          prelimFechaSalida = fecha;
        }
      }

      const inspEntrada = inspectWallTime(fecha, hEntrada);
      const inspSalida = hSalida ? inspectWallTime(prelimFechaSalida, hSalida) : { status: 'valida' };

      const entradaRequiereDst = inspEntrada.status === 'inexistente' || inspEntrada.status === 'ambigua';
      const salidaRequiereDst = inspSalida.status === 'inexistente' || inspSalida.status === 'ambigua';

      let eleccionEntrada = body.dst_eleccion_entrada || body.dstChoiceEntrada || null;
      let eleccionSalida = body.dst_eleccion_salida || body.dstChoiceSalida || null;
      const eleccionGlobal = body.dst_eleccion || body.dstEleccion || body.dst_resolucion || body.dst_ocurrencia || null;

      if (!eleccionEntrada && entradaRequiereDst && !salidaRequiereDst && eleccionGlobal) {
        eleccionEntrada = eleccionGlobal;
      }
      if (!eleccionSalida && salidaRequiereDst && !entradaRequiereDst && eleccionGlobal) {
        eleccionSalida = eleccionGlobal;
      }

      if (entradaRequiereDst && !validarEleccionDst(eleccionEntrada, inspEntrada.status)) {
        const isAmb = inspEntrada.status === 'ambigua';
        return sendJson(res, 400, {
          code: isAmb ? 'HORA_AMBIGUA_DST' : 'HORA_INEXISTENTE_DST',
          frontera: 'entrada',
          hora: hEntrada,
          fecha: fecha,
          error: isAmb
            ? `La hora de entrada ${hEntrada} ocurre dos veces el ${fecha} debido al cambio a horario de invierno en Europe/Madrid. Debe especificar si corresponde a la primera o segunda ocurrencia.`
            : `La hora de entrada ${hEntrada} no existe el ${fecha} debido al salto de primavera a horario de verano en Europe/Madrid (salto de 02:00 a 03:00). Debe confirmar la resolución deseada.`,
          detalles: inspEntrada,
        });
      }

      if (salidaRequiereDst && !validarEleccionDst(eleccionSalida, inspSalida.status)) {
        const isAmb = inspSalida.status === 'ambigua';
        return sendJson(res, 400, {
          code: isAmb ? 'HORA_AMBIGUA_DST' : 'HORA_INEXISTENTE_DST',
          frontera: 'salida',
          hora: hSalida,
          fecha: prelimFechaSalida,
          error: isAmb
            ? `La hora de salida ${hSalida} ocurre dos veces el ${prelimFechaSalida} debido al cambio a horario de invierno en Europe/Madrid. Debe especificar si corresponde a la primera o segunda ocurrencia.`
            : `La hora de salida ${hSalida} no existe el ${prelimFechaSalida} debido al salto de primavera a horario de verano en Europe/Madrid (salto de 02:00 a 03:00). Debe confirmar la resolución deseada.`,
          detalles: inspSalida,
          eleccion_entrada_guardada: eleccionEntrada || null,
        });
      }

      const shift = calculateShiftDuration({
        fechaEntrada: fecha,
        horaEntrada: hEntrada,
        fechaSalida: prelimFechaSalida,
        horaSalida: hSalida,
        pausaMinutos: pausa,
        dstChoiceEntrada: eleccionEntrada,
        dstChoiceSalida: eleccionSalida,
      });

      const horasTrab = shift.horasReales;
      const fechaSalida = shift.fechaSalida;
      const turno = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ? AND fecha = ?').get(userId, fecha);
      const horasPrevistas = turno ? turno.horas_previstas : shift.horasPrevistasContrato;
      const horasExtra = parseFloat(Math.max(0, horasTrab - horasPrevistas).toFixed(2));
      const dstPersist = serializarDstEleccion(eleccionEntrada, eleccionSalida) || shift.infoDst.eleccionAplicada || (shift.infoDst.esTransicionDst ? shift.infoDst.tipoTransicion : null);

      db.prepare(`
        INSERT INTO jornadas_laborales (id, user_id, fecha, fecha_salida, hora_entrada, hora_salida, pausa_minutos, horas_trabajadas, horas_extra, estado, notas, dst_eleccion, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completada', ?, ?, datetime('now'))
      `).run(
        id,
        userId,
        fecha,
        fechaSalida,
        hEntrada,
        hSalida,
        pausa,
        horasTrab,
        horasExtra,
        body.notas || '',
        dstPersist
      );

      const row = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 201, {
        data: {
          ...row,
          horas_reales: shift.horasReales,
          horas_contractuales: shift.horasPrevistasContrato,
          info_dst: shift.infoDst,
        }
      });
    }
  }

  if (pathname.startsWith('/jornadas/')) {
    const id = decodeURIComponent(pathname.split('/')[2]);

    if (method === 'PATCH') {
      const existing = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Jornada no encontrada.' });
      }

      const fecha = body.fecha || existing.fecha;
      const hEntrada = body.hora_entrada || body.horaEntrada || existing.hora_entrada;
      const hSalida = body.hora_salida || body.horaSalida || existing.hora_salida;
      const pausa = body.pausa_minutos !== undefined ? Number(body.pausa_minutos) : (body.pausaMinutos !== undefined ? Number(body.pausaMinutos) : existing.pausa_minutos);
      const notas = body.notas !== undefined ? body.notas : existing.notas;
      let fechaSalida = body.fecha_salida || body.fechaSalida || existing.fecha_salida || fecha;

      const fechasO_HorasCambiaron = (body.fecha && body.fecha !== existing.fecha) ||
        (body.hora_entrada && body.hora_entrada !== existing.hora_entrada) ||
        (body.hora_salida && body.hora_salida !== existing.hora_salida) ||
        (body.fecha_salida && body.fecha_salida !== existing.fecha_salida);

      let eleccionEntrada = body.dst_eleccion_entrada || body.dstChoiceEntrada || null;
      let eleccionSalida = body.dst_eleccion_salida || body.dstChoiceSalida || null;
      let eleccionGlobal = body.dst_eleccion || body.dstEleccion || body.dst_resolucion || body.dst_ocurrencia || null;

      if (!fechasO_HorasCambiaron && !eleccionEntrada && !eleccionSalida && !eleccionGlobal && existing.dst_eleccion) {
        try {
          const parsed = JSON.parse(existing.dst_eleccion);
          if (parsed && typeof parsed === 'object') {
            eleccionEntrada = parsed.entrada || null;
            eleccionSalida = parsed.salida || null;
          }
        } catch {
          eleccionGlobal = existing.dst_eleccion;
        }
      }

      const inspEntrada = inspectWallTime(fecha, hEntrada);
      const inspSalida = hSalida ? inspectWallTime(fechaSalida, hSalida) : { status: 'valida' };

      const entradaRequiereDst = inspEntrada.status === 'inexistente' || inspEntrada.status === 'ambigua';
      const salidaRequiereDst = inspSalida.status === 'inexistente' || inspSalida.status === 'ambigua';

      if (!eleccionEntrada && entradaRequiereDst && !salidaRequiereDst && eleccionGlobal) {
        eleccionEntrada = eleccionGlobal;
      }
      if (!eleccionSalida && salidaRequiereDst && !entradaRequiereDst && eleccionGlobal) {
        eleccionSalida = eleccionGlobal;
      }

      if (entradaRequiereDst && !validarEleccionDst(eleccionEntrada, inspEntrada.status)) {
        const isAmb = inspEntrada.status === 'ambigua';
        return sendJson(res, 400, {
          code: isAmb ? 'HORA_AMBIGUA_DST' : 'HORA_INEXISTENTE_DST',
          frontera: 'entrada',
          hora: hEntrada,
          fecha: fecha,
          error: isAmb
            ? `La hora de entrada ${hEntrada} ocurre dos veces el ${fecha} (cambio a horario de invierno). Debe especificar si corresponde a la primera o segunda ocurrencia.`
            : `La hora de entrada ${hEntrada} no existe el ${fecha} (salto de primavera). Debe confirmar resolución.`,
          detalles: inspEntrada,
        });
      }

      if (salidaRequiereDst && !validarEleccionDst(eleccionSalida, inspSalida.status)) {
        const isAmb = inspSalida.status === 'ambigua';
        return sendJson(res, 400, {
          code: isAmb ? 'HORA_AMBIGUA_DST' : 'HORA_INEXISTENTE_DST',
          frontera: 'salida',
          hora: hSalida,
          fecha: fechaSalida,
          error: isAmb
            ? `La hora de salida ${hSalida} ocurre dos veces el ${fechaSalida} (cambio a horario de invierno). Debe especificar si corresponde a la primera o segunda ocurrencia.`
            : `La hora de salida ${hSalida} no existe el ${fechaSalida} (salto de primavera). Debe confirmar resolución.`,
          detalles: inspSalida,
          eleccion_entrada_guardada: eleccionEntrada || null,
        });
      }

      let horasTrab = existing.horas_trabajadas;
      let horasExtra = existing.horas_extra;
      let shiftInfoDst = null;

      if (hSalida) {
        const shift = calculateShiftDuration({
          fechaEntrada: fecha,
          horaEntrada: hEntrada,
          fechaSalida,
          horaSalida: hSalida,
          pausaMinutos: pausa || 0,
          dstChoiceEntrada: eleccionEntrada,
          dstChoiceSalida: eleccionSalida,
        });
        horasTrab = shift.horasReales;
        fechaSalida = shift.fechaSalida;
        shiftInfoDst = shift.infoDst;
        const turno = db.prepare('SELECT * FROM turnos_previstos WHERE user_id = ? AND fecha = ?').get(userId, fecha);
        const horasPrevistas = turno ? turno.horas_previstas : shift.horasPrevistasContrato;
        horasExtra = parseFloat(Math.max(0, horasTrab - horasPrevistas).toFixed(2));
      }

      const dstPersist = serializarDstEleccion(eleccionEntrada, eleccionSalida) || (shiftInfoDst ? shiftInfoDst.eleccionAplicada : (fechasO_HorasCambiaron ? null : existing.dst_eleccion));

      db.prepare(`
        UPDATE jornadas_laborales
        SET fecha = ?, fecha_salida = ?, hora_entrada = ?, hora_salida = ?,
            pausa_minutos = ?, horas_trabajadas = ?, horas_extra = ?, notas = ?, dst_eleccion = ?
        WHERE id = ? AND user_id = ?
      `).run(fecha, fechaSalida, hEntrada, hSalida, pausa, horasTrab, horasExtra, notas, dstPersist, id, userId);

      const updated = db.prepare('SELECT * FROM jornadas_laborales WHERE id = ? AND user_id = ?').get(id, userId);
      return sendJson(res, 200, {
        data: {
          ...updated,
          horas_reales: horasTrab,
          horas_contractuales: existing.horas_contractuales || null,
          info_dst: shiftInfoDst,
        }
      });
    }

    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM jornadas_laborales WHERE id = ? AND user_id = ?').run(id, userId);
      if (result.changes === 0) {
        return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Jornada no encontrada.' });
      }
      return sendJson(res, 200, { data: { id, deleted: true } });
    }
  }

  // ── /resumen ──
  if (pathname === '/resumen' && method === 'GET') {
    const fechaRef = url.searchParams.get('fecha') || getMadridDateString();
    const { desde: lunesStr, hasta: domingoStr } = getMadridWeekRange(fechaRef);

    const jornadas = db.prepare(`
      SELECT * FROM jornadas_laborales
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
      ORDER BY fecha ASC
    `).all(userId, lunesStr, domingoStr);

    const turnos = db.prepare(`
      SELECT * FROM turnos_previstos
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
      ORDER BY fecha ASC
    `).all(userId, lunesStr, domingoStr);

    let totalHorasReales = 0;
    let totalHorasPrevistas = 0;
    let totalPausaMinutos = 0;
    let totalHorasExtra = 0;

    for (const j of jornadas) {
      totalHorasReales += j.horas_trabajadas || 0;
      totalHorasExtra += j.horas_extra || 0;
      totalPausaMinutos += j.pausa_minutos || 0;
    }

    for (const t of turnos) {
      totalHorasPrevistas += t.horas_previstas || 0;
    }

    return sendJson(res, 200, {
      data: {
        semana: {
          desde: lunesStr,
          hasta: domingoStr,
        },
        horasReales: parseFloat(totalHorasReales.toFixed(2)),
        horasPrevistas: parseFloat(totalHorasPrevistas.toFixed(2)),
        horasExtra: parseFloat(totalHorasExtra.toFixed(2)),
        pausaMinutosTotal: totalPausaMinutos,
        jornadas,
        turnos,
      },
    });
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada en /api/trabajo: ' + pathname });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
