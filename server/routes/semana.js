import crypto from 'node:crypto';
import { db } from '../db.js';
import { resolveEffectiveClasses, mergeIntervals } from '../availability.js';
import {
  getMadridDateString,
  getMadridWeekRange,
  addDaysMadrid,
} from '../timezone.js';

export function handleSemanaRoutes(req, res, url, body, userId, username = null) {
  if (!userId) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED', error: 'Autenticación requerida.' });
  }

  const pathname = url.pathname.replace(/^\/api\/semana/, '') || '/';
  const method = req.method;

  // ── GET /api/semana/resumen ──
  if (pathname === '/resumen' && method === 'GET') {
    const fechaRef = url.searchParams.get('fecha') || getMadridDateString();
    const { desde: lunesStr, hasta: domingoStr } = getMadridWeekRange(fechaRef);

    const semanaCerrada = db.prepare(`
      SELECT * FROM semanas_cerradas
      WHERE user_id = ? AND semana_inicio = ?
    `).get(userId, lunesStr);

    if (semanaCerrada && !semanaCerrada.reabierto) {
      try {
        const frozenData = JSON.parse(semanaCerrada.datos_json);
        return sendJson(res, 200, {
          data: {
            ...frozenData,
            cerrada: true,
            version: semanaCerrada.version || 1,
            reabierto: false,
            cerradoEn: semanaCerrada.cerrado_en,
            notasCierre: semanaCerrada.notas_cierre || '',
            historialVersiones: JSON.parse(semanaCerrada.historial_versiones || '[]'),
          },
        });
      } catch (parseErr) {
        console.error('[SEMANA] Snapshot corrupto en BD:', parseErr.message);
        return sendJson(res, 500, {
          code: 'SNAPSHOT_CORRUPT',
          error: 'Snapshot semanal corrupto en base de datos. Se requiere verificación técnica.',
        });
      }
    }

    const tareasCompletadas = db.prepare(`
      SELECT * FROM tareas
      WHERE user_id = ? AND estado = 'completado'
        AND date(fecha_entrega) >= date(?) AND date(fecha_entrega) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    const tareasPendientes = db.prepare(`
      SELECT * FROM tareas
      WHERE user_id = ? AND estado != 'completado'
        AND date(fecha_entrega) >= date(?) AND date(fecha_entrega) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    let horasClaseSemana = 0;
    for (let offset = 0; offset < 7; offset++) {
      const curStr = addDaysMadrid(lunesStr, offset);
      const { clases } = resolveEffectiveClasses({ db, userId, dateStr: curStr });
      const intervals = clases.map(c => ({ start: c.hora_inicio, end: c.hora_fin }));
      const merged = mergeIntervals(intervals);
      const dayClassMinutes = merged.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
      horasClaseSemana += dayClassMinutes / 60;
    }
    horasClaseSemana = parseFloat(horasClaseSemana.toFixed(1));

    const jornadas = db.prepare(`
      SELECT * FROM jornadas_laborales
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    const turnos = db.prepare(`
      SELECT * FROM turnos_previstos
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    let horasTrabajadas = 0;
    let horasExtra = 0;
    let pausasMinutos = 0;
    for (const j of jornadas) {
      horasTrabajadas += j.horas_trabajadas || 0;
      horasExtra += j.horas_extra || 0;
      pausasMinutos += j.pausa_minutos || 0;
    }

    let horasPrevistas = 0;
    for (const t of turnos) {
      horasPrevistas += t.horas_previstas || 0;
    }

    const festivos = db.prepare(`
      SELECT * FROM festivos
      WHERE date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(lunesStr, domingoStr);

    const ratioTrabajo = horasPrevistas > 0 ? (horasTrabajadas / horasPrevistas) * 100 : 100;
    let pibbleMensaje = '¡Buen ritmo esta semana! Recuerda registrar tus turnos y pausas para mantener el equilibrio.';
    if (horasTrabajadas > 0) {
      if (ratioTrabajo >= 95) {
        pibbleMensaje = `¡Excelente semana de trabajo! Has completado ${horasTrabajadas.toFixed(1)}h reales con gran puntualidad. ¡Sigue así, campeona!`;
      } else {
        pibbleMensaje = `Llevas ${horasTrabajadas.toFixed(1)}h de las ${horasPrevistas.toFixed(1)}h planificadas. Recuerda no sobrecargarte y tomarte tus descansos en Guadalajara.`;
      }
    }

    let capilamparaMensaje = 'Semana académica tranquila. Es un buen momento para ordenar apuntes y planificar lecturas de Logopedia.';
    if (tareasCompletadas.length > 0) {
      capilamparaMensaje = `¡Gran esfuerzo académico! Has cerrado ${tareasCompletadas.length} tareas o entregas de la UCM esta semana. Tu dedicación rinde frutos.`;
    } else if (tareasPendientes.length > 0) {
      capilamparaMensaje = `Tienes ${tareasPendientes.length} entregas o estudios pendientes para los próximos días. Te sugiero priorizar con calma y buena luz.`;
    }

    const horasOcupadas = parseFloat((horasTrabajadas + horasClaseSemana).toFixed(1));
    const horasDisponibles = parseFloat(Math.max(0, 112 - horasOcupadas).toFixed(1));

    const resultado = {
      semana: {
        desde: lunesStr,
        hasta: domingoStr,
        fechaRef,
      },
      academico: {
        tareasCompletadas: tareasCompletadas.length,
        tareasPendientes: tareasPendientes.length,
        horasClase: horasClaseSemana,
        listaCompletadas: tareasCompletadas,
        listaPendientes: tareasPendientes,
      },
      laboral: {
        horasTrabajadas: parseFloat(horasTrabajadas.toFixed(1)),
        horasPrevistas: parseFloat(horasPrevistas.toFixed(1)),
        horasExtra: parseFloat(horasExtra.toFixed(1)),
        pausasMinutos,
        jornadasContadas: jornadas.length,
      },
      festivos,
      balance: {
        horasOcupadas,
        horasLibresEstimadas: horasDisponibles,
      },
      personajes: {
        pibble: pibbleMensaje,
        capilampara: capilamparaMensaje,
      },
      mascotas: {
        pibbleMensaje,
        capilamparaMensaje,
        ratioTrabajo: parseFloat(ratioTrabajo.toFixed(1)),
      },
      cerrada: !!(semanaCerrada && !semanaCerrada.reabierto),
      reabierto: !!(semanaCerrada && semanaCerrada.reabierto),
      version: semanaCerrada ? semanaCerrada.version : 1,
    };

    return sendJson(res, 200, { data: resultado });
  }

  // ── POST /api/semana/cerrar ──
  if (pathname === '/cerrar' && method === 'POST') {
    const fechaRef = body.fecha || body.fechaRef || getMadridDateString();
    const notasCierre = body.notas || body.notas_cierre || '';
    const { desde: lunesStr, hasta: domingoStr } = getMadridWeekRange(fechaRef);

    const existing = db.prepare(`
      SELECT * FROM semanas_cerradas
      WHERE user_id = ? AND semana_inicio = ?
    `).get(userId, lunesStr);

    if (existing && !existing.reabierto) {
      return sendJson(res, 409, {
        code: 'WEEK_ALREADY_CLOSED',
        error: `La semana ${lunesStr} a ${domingoStr} ya está cerrada y congelada (Versión ${existing.version || 1}). Para modificarla, solicite una reapertura formal primero.`,
        version: existing.version || 1,
        cerradoEn: existing.cerrado_en,
      });
    }

    const tareasCompletadas = db.prepare(`
      SELECT * FROM tareas
      WHERE user_id = ? AND estado = 'completado'
        AND date(fecha_entrega) >= date(?) AND date(fecha_entrega) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    const tareasPendientes = db.prepare(`
      SELECT * FROM tareas
      WHERE user_id = ? AND estado != 'completado'
        AND date(fecha_entrega) >= date(?) AND date(fecha_entrega) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    let horasClaseSemana = 0;
    for (let offset = 0; offset < 7; offset++) {
      const curStr = addDaysMadrid(lunesStr, offset);
      const { clases } = resolveEffectiveClasses({ db, userId, dateStr: curStr });
      const intervals = clases.map(c => ({ start: c.hora_inicio, end: c.hora_fin }));
      const merged = mergeIntervals(intervals);
      const dayClassMinutes = merged.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
      horasClaseSemana += dayClassMinutes / 60;
    }
    horasClaseSemana = parseFloat(horasClaseSemana.toFixed(1));

    const jornadas = db.prepare(`
      SELECT * FROM jornadas_laborales
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    const turnos = db.prepare(`
      SELECT * FROM turnos_previstos
      WHERE user_id = ? AND date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(userId, lunesStr, domingoStr);

    let horasTrabajadas = 0;
    let horasExtra = 0;
    let pausasMinutos = 0;
    for (const j of jornadas) {
      horasTrabajadas += j.horas_trabajadas || 0;
      horasExtra += j.horas_extra || 0;
      pausasMinutos += j.pausa_minutos || 0;
    }

    let horasPrevistas = 0;
    for (const t of turnos) {
      horasPrevistas += t.horas_previstas || 0;
    }

    const festivos = db.prepare(`
      SELECT * FROM festivos WHERE date(fecha) >= date(?) AND date(fecha) <= date(?)
    `).all(lunesStr, domingoStr);

    const ratioTrabajo = horasPrevistas > 0 ? (horasTrabajadas / horasPrevistas) * 100 : 100;
    const pibbleMensaje = `Resumen congelado de trabajo: ${horasTrabajadas.toFixed(1)}h realizadas vs ${horasPrevistas.toFixed(1)}h previstas.`;
    const capilamparaMensaje = `Resumen congelado académico: ${tareasCompletadas.length} tareas completadas, ${horasClaseSemana}h de clase.`;

    const snapshot = {
      semana: { desde: lunesStr, hasta: domingoStr, fechaRef },
      academico: {
        tareasCompletadas: tareasCompletadas.length,
        tareasPendientes: tareasPendientes.length,
        horasClase: horasClaseSemana,
        listaCompletadas: tareasCompletadas,
        listaPendientes: tareasPendientes,
      },
      laboral: {
        horasTrabajadas: parseFloat(horasTrabajadas.toFixed(1)),
        horasPrevistas: parseFloat(horasPrevistas.toFixed(1)),
        horasExtra: parseFloat(horasExtra.toFixed(1)),
        pausasMinutos,
        jornadasContadas: jornadas.length,
      },
      festivos,
      balance: {
        horasOcupadas: parseFloat((horasTrabajadas + horasClaseSemana).toFixed(1)),
        horasLibresEstimadas: parseFloat(Math.max(0, 112 - (horasTrabajadas + horasClaseSemana)).toFixed(1)),
      },
      personajes: {
        pibble: pibbleMensaje,
        capilampara: capilamparaMensaje,
      },
      mascotas: {
        pibbleMensaje,
        capilamparaMensaje,
        ratioTrabajo: parseFloat(ratioTrabajo.toFixed(1)),
      },
    };

    let newVersion = 1;
    let historialVersiones = [];

    if (existing) {
      newVersion = (existing.version || 1) + 1;
      try {
        historialVersiones = JSON.parse(existing.historial_versiones || '[]');
      } catch (_err) { void _err; }

      historialVersiones.push({
        version: existing.version || 1,
        cerrado_en: existing.cerrado_en,
        reabierto_en: existing.reabierto_en,
        reabierto_por: existing.reabierto_por,
        datos_json: existing.datos_json,
        notas_cierre: existing.notas_cierre,
      });

      db.prepare(`
        UPDATE semanas_cerradas
        SET cerrado_en = datetime('now'),
            datos_json = ?,
            notas_cierre = ?,
            version = ?,
            reabierto = 0,
            reabierto_por = NULL,
            reabierto_en = NULL,
            historial_versiones = ?
        WHERE id = ? AND user_id = ?
      `).run(JSON.stringify(snapshot), notasCierre, newVersion, JSON.stringify(historialVersiones), existing.id, userId);
    } else {
      const id = 'sem_' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO semanas_cerradas (id, user_id, semana_inicio, semana_fin, cerrado_en, datos_json, notas_cierre, version, reabierto, historial_versiones)
        VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 1, 0, '[]')
      `).run(id, userId, lunesStr, domingoStr, JSON.stringify(snapshot), notasCierre);
    }

    return sendJson(res, 200, {
      success: true,
      message: `Semana ${lunesStr} a ${domingoStr} congelada con éxito (Versión ${newVersion}).`,
      version: newVersion,
      snapshot,
    });
  }

  // ── POST /api/semana/reabrir ──
  if (pathname === '/reabrir' && method === 'POST') {
    const semanaInicio = body.semana_inicio || body.semanaInicio;
    if (!semanaInicio) {
      return sendJson(res, 400, { error: 'Falta semana_inicio (YYYY-MM-DD).' });
    }

    const closed = db.prepare('SELECT * FROM semanas_cerradas WHERE user_id = ? AND semana_inicio = ?').get(userId, semanaInicio);
    if (!closed) {
      return sendJson(res, 404, { code: 'NOT_FOUND', error: 'No existe ninguna semana cerrada para la fecha: ' + semanaInicio });
    }

    const actor = username || (() => {
      const u = db.prepare('SELECT username FROM usuarios WHERE id = ?').get(userId);
      return u ? u.username : `user_${userId}`;
    })();

    db.prepare(`
      UPDATE semanas_cerradas
      SET reabierto = 1,
          reabierto_por = ?,
          reabierto_en = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(actor, closed.id, userId);

    return sendJson(res, 200, {
      success: true,
      message: `Semana ${semanaInicio} reabierta formalmente para edición (Versión actual: ${closed.version || 1}). El histórico previo permanece inalterado.`,
      version: closed.version || 1,
      reabiertoPor: actor,
      reabiertoEn: new Date().toISOString(),
    });
  }

  return sendJson(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada en /api/semana: ' + pathname });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
