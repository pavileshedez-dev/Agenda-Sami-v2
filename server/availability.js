/**
 * Módulo centralizado para el cálculo riguroso de disponibilidad, solapamiento de intervalos
 * y resolución de festivos y excepciones horarias en Agenda Sami.
 */

/**
 * Convierte 'HH:MM' o 'HH:MM:SS' a minutos desde la medianoche (0..1439).
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Fusiona intervalos temporales solapados o contiguos.
 * Recibe array de { start: minutes, end: minutes } y devuelve array ordenado y disjunto.
 */
export function mergeIntervals(intervals) {
  if (!intervals || intervals.length === 0) return [];

  const valid = intervals
    .map(i => ({
      start: typeof i.start === 'string' ? timeToMinutes(i.start) : Number(i.start),
      end: typeof i.end === 'string' ? timeToMinutes(i.end) : Number(i.end),
    }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (valid.length === 0) return [];

  const merged = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];

    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/**
 * Calcula la suma total de horas a partir de una lista de intervalos ya fusionados.
 */
export function calculateMergedHours(intervals) {
  const merged = mergeIntervals(intervals);
  const totalMinutes = merged.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
  return parseFloat((totalMinutes / 60).toFixed(2));
}

/**
 * Resuelve las clases efectivas para una fecha dada (YYYY-MM-DD), aplicando:
 * 1. Día de la semana (1=Lunes..7=Domingo).
 * 2. Festivos del ámbito universitario (nacional y madrid): anulan las clases regulares.
 * 3. Excepciones puntuales registradas en horario_excepciones (cancelaciones u horarios alternativos).
 */
export function resolveEffectiveClasses({ db, userId = 1, dateStr }) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Lunes, 7=Domingo

  // Comprobar festivos universitarios (UCM) en esta fecha
  const festivoUni = db.prepare(`
    SELECT * FROM festivos
    WHERE date(fecha) = date(?) AND ambito IN ('nacional', 'madrid')
    LIMIT 1
  `).get(dateStr);

  // Obtener excepciones para esta fecha
  const excepciones = db.prepare(`
    SELECT * FROM horario_excepciones
    WHERE user_id = ? AND date(fecha) = date(?)
  `).all(userId, dateStr);

  const excMap = new Map(excepciones.map(e => [e.horario_id, e]));

  // Clases regulares activas para este día de la semana con filtro de vigencia histórica
  const horarios = db.prepare(`
    SELECT h.*, a.nombre as asignatura_nombre, a.color as asignatura_color
    FROM horarios h
    LEFT JOIN asignaturas a ON (a.id = h.asignatura OR a.nombre = h.asignatura) AND a.user_id = h.user_id
    WHERE h.user_id = ? AND h.dia = ?
      AND (h.fecha_inicio IS NULL OR date(?) >= date(h.fecha_inicio))
      AND (h.fecha_fin IS NULL OR date(?) <= date(h.fecha_fin))
  `).all(userId, dayOfWeek, dateStr, dateStr);

  const effective = [];

  for (const h of horarios) {
    const exc = excMap.get(h.id);

    // Si hay excepción con cancelación explícita, se omite
    if (exc && (exc.cancelada === 1 || exc.cancelada === true)) {
      continue;
    }

    // Si es festivo universitario y no hay excepción alternativa que lo reanude, no hay clase
    if (festivoUni && (!exc || !exc.hora_inicio_alt)) {
      continue;
    }

    const horaInicio = (exc && exc.hora_inicio_alt) ? exc.hora_inicio_alt : h.hora_inicio;
    const horaFin = (exc && exc.hora_fin_alt) ? exc.hora_fin_alt : h.hora_fin;
    const aula = (exc && exc.aula_alternativa) ? exc.aula_alternativa : (h.aula || '');

    effective.push({
      id: h.id,
      asignatura: h.asignatura_nombre || h.asignatura,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      aula,
      tipo: h.tipo || 'teoria',
      color: h.color || h.asignatura_color || '#2563eb',
      es_excepcion: !!exc,
    });
  }

  return {
    clases: effective,
    esFestivoUni: !!festivoUni,
    festivoUni,
  };
}

/**
 * Calcula la disponibilidad completa del día integrando clases, eventos y turnos laborales,
 * fusionando intervalos solapados para evitar sobreestimación de horas ocupadas.
 */
export function calculateDailyAvailability({ db, userId = 1, dateStr }) {
  // 1. Clases efectivas
  const { clases, esFestivoUni, festivoUni } = resolveEffectiveClasses({ db, userId, dateStr });

  // 2. Festivos laborales (Guadalajara / CLM)
  const festivoTrabajo = db.prepare(`
    SELECT * FROM festivos
    WHERE date(fecha) = date(?) AND ambito IN ('nacional', 'guadalajara')
    LIMIT 1
  `).get(dateStr);

  // 3. Eventos del día (soporte para eventos puntuales, planes y rangos multidía como vacaciones)
  const eventos = db.prepare(`
    SELECT * FROM eventos
    WHERE user_id = ?
      AND (
        (fin IS NULL AND date(inicio) = date(?))
        OR
        (fin IS NOT NULL AND date(inicio) <= date(?) AND date(fin) >= date(?))
      )
  `).all(userId, dateStr, dateStr, dateStr);

  const vacaciones = eventos.filter(e => e.categoria === 'vacaciones');
  const esVacaciones = vacaciones.length > 0;
  const planes = eventos.filter(e => e.categoria === 'plan');

  // 4. Turnos previstos y jornadas laborales del día
  const turnos = db.prepare(`
    SELECT * FROM turnos_previstos
    WHERE user_id = ? AND date(fecha) = date(?)
  `).all(userId, dateStr);

  const jornadas = db.prepare(`
    SELECT * FROM jornadas_laborales
    WHERE user_id = ? AND date(fecha) = date(?)
  `).all(userId, dateStr);

  // 5. Construir todos los intervalos ocupados del día
  const busyIntervals = [];

  for (const c of clases) {
    busyIntervals.push({ start: c.hora_inicio, end: c.hora_fin, tipo: 'clase', titulo: c.asignatura });
  }

  const extractTime = (str, defaultVal) => {
    if (!str) return defaultVal;
    if (str.includes('T')) return str.split('T')[1].slice(0, 5);
    if (str.includes(' ')) return str.split(' ')[1].slice(0, 5);
    if (/^\d{2}:\d{2}/.test(str)) return str.slice(0, 5);
    return defaultVal;
  };

  for (const ev of eventos) {
    if (ev.categoria === 'vacaciones') {
      // Las vacaciones se gestionan a nivel de indisponibilidad de jornada completa
      continue;
    }
    if (ev.es_dia_completo || ev.dia_completo) {
      busyIntervals.push({ start: '08:00', end: '22:00', tipo: ev.categoria || 'evento', titulo: ev.titulo });
    } else if (ev.inicio) {
      const horaIni = extractTime(ev.inicio, '00:00');
      const horaFin = ev.fin ? extractTime(ev.fin, '23:59') : '23:59';
      busyIntervals.push({ start: horaIni, end: horaFin, tipo: ev.categoria || 'evento', titulo: ev.titulo });
    }
  }

  for (const tu of turnos) {
    busyIntervals.push({ start: tu.hora_inicio, end: tu.hora_fin, tipo: 'turno', titulo: 'Turno de trabajo' });
  }

  for (const j of jornadas) {
    if (j.hora_entrada && j.hora_salida) {
      busyIntervals.push({ start: j.hora_entrada.slice(0, 5), end: j.hora_salida.slice(0, 5), tipo: 'jornada', titulo: 'Jornada laboral' });
    }
  }

  // 6. Fusionar intervalos solapados (ej: Clase 09-11 y Evento 10-12 -> 3h, no 4h)
  const merged = mergeIntervals(busyIntervals);
  const totalMinutosOcupados = merged.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
  const horasOcupadas = parseFloat((totalMinutosOcupados / 60).toFixed(1));

  // Capacidad diurna estándar: 16 horas activas (8h de sueño)
  const horasActivasBase = 16.0;
  const potencialmenteDisponible = esVacaciones ? 0 : parseFloat(Math.max(0, horasActivasBase - horasOcupadas).toFixed(1));

  // Si es festivo general o no hay ninguna actividad programada, horas confirmadas libres
  const esFestivoCompleto = esFestivoUni && festivoTrabajo;
  let libreConfirmado = 0;
  if (!esVacaciones) {
    if (esFestivoCompleto && horasOcupadas === 0) {
      libreConfirmado = 8.0;
    } else if (esFestivoUni && turnos.length === 0 && jornadas.length === 0 && horasOcupadas === 0) {
      libreConfirmado = 8.0;
    }
  }

  const sinPlanificar = esVacaciones ? 0 : (busyIntervals.length === 0 ? 16.0 : parseFloat(Math.max(0, 8.0 - horasOcupadas).toFixed(1)));

  // 7. Detección no destructiva de conflictos para Vacaciones
  // Principio: NO borrar ni modificar clases, turnos ni festivos; preservar ambos y señalar conflicto
  const conflictos = [];
  if (esVacaciones) {
    if (clases.length > 0) {
      conflictos.push({
        tipo: 'conflicto_vacaciones_clases',
        mensaje: `Conflicto detectado: El día de vacaciones coincide con ${clases.length} clase(s) lectiva(s).`,
        elementos: clases,
      });
    }
    if (turnos.length > 0) {
      conflictos.push({
        tipo: 'conflicto_vacaciones_turnos',
        mensaje: `Conflicto detectado: El día de vacaciones coincide con ${turnos.length} turno(s) laboral(es) previsto(s).`,
        elementos: turnos,
      });
    }
    if (jornadas.length > 0) {
      conflictos.push({
        tipo: 'conflicto_vacaciones_jornadas',
        mensaje: `Conflicto detectado: El día de vacaciones coincide con ${jornadas.length} jornada(s) laboral(es) fichada(s).`,
        elementos: jornadas,
      });
    }
    if (festivoUni || festivoTrabajo) {
      conflictos.push({
        tipo: 'coincidencia_vacaciones_festivo',
        mensaje: `Coincidencia: El día de vacaciones solapa con festivo oficial: ${(festivoUni?.nombre || festivoTrabajo?.nombre)}.`,
        elementos: [festivoUni, festivoTrabajo].filter(Boolean),
      });
    }
  }

  return {
    fecha: dateStr,
    ocupado_horas: horasOcupadas,
    libre_confirmado_horas: libreConfirmado,
    potencialmente_disponible_horas: potencialmenteDisponible,
    sin_planificar_horas: sinPlanificar,
    intervalos_fusionados: merged,
    clases,
    turnos,
    jornadas,
    eventos,
    vacaciones,
    planes,
    es_vacaciones: esVacaciones,
    indisponibilidad_personal: esVacaciones,
    disponible: !esVacaciones && potencialmenteDisponible > 0,
    conflictos,
    festivos: {
      universidad: festivoUni || null,
      trabajo: festivoTrabajo || null,
    },
  };
}
