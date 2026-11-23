export const DEFAULT_TIMEZONE = 'Europe/Madrid';

/**
 * Devuelve { fecha: 'YYYY-MM-DD', hora: 'HH:MM:SS', isoLocal: 'YYYY-MM-DDTHH:MM:SS' }
 * explícitamente en zona horaria Europe/Madrid (independiente del TZ del sistema operativo).
 */
export function getMadridDateTime(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(d).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  // Normalizar posible '24' a '00' en medianoche en algunos locales/motores ICU
  const hh = parts.hour === '24' ? '00' : parts.hour;
  const fecha = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = `${hh}:${parts.minute}:${parts.second}`;
  return {
    fecha,
    hora,
    date: fecha,
    time: hora,
    isoLocal: `${fecha}T${hora}`,
  };
}

/**
 * Devuelve la fecha actual 'YYYY-MM-DD' explícitamente en Europe/Madrid.
 */
export function getMadridDateString(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return getMadridDateTime(date, timeZone).fecha;
}

/**
 * Devuelve la hora actual 'HH:MM:SS' explícitamente en Europe/Madrid.
 */
export function getMadridTimeString(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return getMadridDateTime(date, timeZone).hora;
}

/**
 * Aritmética segura de fechas civiles 'YYYY-MM-DD' (inmune a DST de 23h/25h y TZ del SO).
 */
export function addDaysMadrid(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Devuelve el día de la semana (1=Lunes .. 7=Domingo) para una fecha civil 'YYYY-MM-DD'
 * sin depender de la zona horaria del sistema anfitrión.
 */
export function getMadridDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = dt.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Devuelve el rango semanal Lunes–Domingo ('YYYY-MM-DD') para una fecha de referencia.
 */
export function getMadridWeekRange(fechaRef = null) {
  const ref = fechaRef || getMadridDateString();
  const diaSemana = getMadridDayOfWeek(ref); // 1=Lun .. 7=Dom
  const desde = addDaysMadrid(ref, -(diaSemana - 1));
  const hasta = addDaysMadrid(desde, 6);
  return { desde, hasta, diaSemana, fechaRef: ref };
}

/**
 * Inspecciona un tiempo de pared (fecha y hora local) en una zona horaria dada,
 * identificando si es una hora normal, inexistente (gap de primavera) o ambigua (overlap de otoño).
 */
export function inspectWallTime(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss = 0] = (timeStr || '00:00:00').split(':').map(Number);

  const approx = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const matches = [];

  // Probar candidatos UTC en un rango de ±3 horas respecto a approx
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes++) {
    const candidate = new Date(approx.getTime() + offsetMinutes * 60000);
    const parts = dtf.formatToParts(candidate).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    if (Number(parts.year) === y && Number(parts.month) === m && Number(parts.day) === d &&
        Number(parts.hour) === hh && Number(parts.minute) === mm) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    const hNext = String(Math.min(23, hh + 1)).padStart(2, '0');
    const hPrev = String(Math.max(0, hh - 1)).padStart(2, '0');
    const mmStr = String(mm).padStart(2, '0');
    return {
      status: 'inexistente',
      isNonExistent: true,
      isAmbiguous: false,
      matches: [],
      tipo: 'inexistente',
      fecha: dateStr,
      hora: timeStr,
      mensaje: `La hora ${timeStr} no existe el día ${dateStr} en ${timeZone} por salto DST de primavera (el reloj salta de 02:00 a 03:00).`,
      opciones: [
        { clave: 'avanzar', descripcion: `Avanzar a las ${hNext}:${mmStr} (horario de verano CEST)`, horaAjustada: `${hNext}:${mmStr}` },
        { clave: 'retroceder', descripcion: `Retroceder a las ${hPrev}:${mmStr} (horario estándar CET)`, horaAjustada: `${hPrev}:${mmStr}` }
      ]
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambigua',
      isNonExistent: false,
      isAmbiguous: true,
      matches,
      tipo: 'ambigua',
      fecha: dateStr,
      hora: timeStr,
      mensaje: `La hora ${timeStr} ocurre dos veces el día ${dateStr} en ${timeZone} por cambio de hora de otoño (el reloj retrocede de 03:00 a 02:00).`,
      opciones: [
        { clave: 'primera', descripcion: 'Primera ocurrencia (horario de verano CEST, UTC+2)', utc: matches[0].toISOString() },
        { clave: 'segunda', descripcion: 'Segunda ocurrencia (horario estándar CET, UTC+1)', utc: matches[1].toISOString() }
      ]
    };
  }

  return {
    status: 'normal',
    isNonExistent: false,
    isAmbiguous: false,
    matches,
    utc: matches[0]
  };
}

/**
 * Convierte fecha y hora local a Date UTC teniendo en cuenta las discontinuidades DST.
 */
export function zonedLocalToUtc(dateStr, timeStr, options = {}) {
  let timeZone = DEFAULT_TIMEZONE;
  let dstChoice = null;
  let strict = false;

  if (typeof options === 'string') {
    timeZone = options;
  } else if (options && typeof options === 'object') {
    if (options.timeZone) timeZone = options.timeZone;
    if (options.dstChoice) dstChoice = options.dstChoice;
    if (options.dst_eleccion) dstChoice = options.dst_eleccion;
    if (options.strict !== undefined) strict = Boolean(options.strict);
  }

  const inspection = inspectWallTime(dateStr, timeStr, timeZone);

  if (inspection.status === 'normal') {
    return inspection.utc;
  }

  if (inspection.status === 'inexistente') {
    if (dstChoice === 'avanzar' || dstChoice === 'avanzar_a_03:30') {
      // Ajustar avanzando 1h a horario de verano
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hh, mm, ss = 0] = (timeStr || '00:00:00').split(':').map(Number);
      const adjusted = inspectWallTime(dateStr, `${String(hh + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, timeZone);
      return adjusted.utc || new Date(Date.UTC(y, m - 1, d, hh + 1, mm, ss) - 2 * 3600000);
    }
    if (dstChoice === 'retroceder' || dstChoice === 'retroceder_a_01:30') {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hh, mm, ss = 0] = (timeStr || '00:00:00').split(':').map(Number);
      const adjusted = inspectWallTime(dateStr, `${String(hh - 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, timeZone);
      return adjusted.utc || new Date(Date.UTC(y, m - 1, d, hh - 1, mm, ss) - 1 * 3600000);
    }
    if (strict) {
      const err = new Error(inspection.mensaje);
      err.code = 'DST_HORA_INEXISTENTE';
      err.dstInfo = inspection;
      throw err;
    }
    // Fallback no estricto: avanzar determinísticamente 1 hora
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm, ss = 0] = (timeStr || '00:00:00').split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh + 1, mm, ss) - 2 * 3600000);
  }

  if (inspection.status === 'ambigua') {
    if (dstChoice === 'primera') {
      return inspection.matches[0];
    }
    if (dstChoice === 'segunda') {
      return inspection.matches[1];
    }
    if (strict) {
      const err = new Error(inspection.mensaje);
      err.code = 'DST_HORA_AMBIGUA';
      err.dstInfo = inspection;
      throw err;
    }
    // Fallback no estricto: segunda ocurrencia (horario estándar)
    return inspection.matches[1];
  }

  return inspection.utc;
}

/**
 * Calcula la duración real trabajada en horas transcurridas (UTC) entre fecha/hora de entrada y salida,
 * descontando pausas y respetando con exactitud los saltos DST de Europe/Madrid.
 * Devuelve desglose explícito de duración real y contractual.
 */
export function calculateShiftDuration({
  fechaEntrada,
  horaEntrada,
  fechaSalida,
  horaSalida,
  pausaMinutos = 0,
  dstEleccion = null,
  dstChoiceEntrada = null,
  dstChoiceSalida = null,
  timeZone = DEFAULT_TIMEZONE,
  strict = false,
}) {
  let effectiveFechaSalida = fechaSalida;
  if (!effectiveFechaSalida) {
    const [h1, m1] = horaEntrada.split(':').map(Number);
    const [h2, m2] = horaSalida.split(':').map(Number);
    if ((h2 * 60 + m2) < (h1 * 60 + m1)) {
      // Cruce de medianoche ordinario
      const d = new Date(fechaEntrada + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      effectiveFechaSalida = d.toISOString().slice(0, 10);
    } else {
      effectiveFechaSalida = fechaEntrada;
    }
  }

  const choiceEntrada = dstChoiceEntrada || dstEleccion;
  const choiceSalida = dstChoiceSalida || dstEleccion;

  const startUtc = zonedLocalToUtc(fechaEntrada, horaEntrada, {
    timeZone,
    dstChoice: choiceEntrada,
    strict,
  });

  const endUtc = zonedLocalToUtc(effectiveFechaSalida, horaSalida, {
    timeZone,
    dstChoice: choiceSalida,
    strict,
  });

  let diffMs = endUtc.getTime() - startUtc.getTime();
  if (diffMs < 0) {
    diffMs += 24 * 3600 * 1000;
  }

  const pausaMs = (Number(pausaMinutos) || 0) * 60 * 1000;
  const netMs = Math.max(0, diffMs - pausaMs);
  const horasReales = parseFloat((netMs / (3600 * 1000)).toFixed(2));

  // Duración contractual/nominal prevista de pared (sin corrección física DST)
  const [h1, m1] = horaEntrada.split(':').map(Number);
  const [h2, m2] = horaSalida.split(':').map(Number);
  let nominalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (nominalMinutes < 0) nominalMinutes += 24 * 60;
  const horasPrevistasContrato = parseFloat((nominalMinutes / 60).toFixed(2));
  const nominalNetMinutes = Math.max(0, nominalMinutes - (Number(pausaMinutos) || 0));
  const horasContractualesNetas = parseFloat((nominalNetMinutes / 60).toFixed(2));

  // Análisis explícito de impacto DST
  const diffHoras = parseFloat(((diffMs / 3600000) - (nominalMinutes / 60)).toFixed(2));
  const esTransicion = Math.abs(diffHoras) >= 0.5 || Boolean(choiceSalida || choiceEntrada);

  let tipoTransicion = null;
  let descripcion = 'Jornada ordinaria sin desfase DST.';

  if (esTransicion) {
    if (diffHoras < 0 || choiceSalida === 'avanzar' || choiceEntrada === 'avanzar') {
      tipoTransicion = 'primavera';
      descripcion = 'Transición de primavera: la noche tuvo 1 hora física menos por salto de 02:00 a 03:00 (se trabajaron/descansaron físicamente menos horas que las de pared).';
    } else {
      tipoTransicion = 'otoño';
      descripcion = 'Transición de otoño: la noche tuvo 1 hora física más por retroceso de 03:00 a 02:00 (se trabajaron/descansaron físicamente más horas que las de pared).';
    }
  }

  return {
    fechaSalida: effectiveFechaSalida,
    horasReales,
    horasPrevistasContrato,
    horasContractualesNetas,
    diffMs,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    infoDst: {
      esTransicionDst: esTransicion,
      tipoTransicion,
      diferenciaHoras: diffHoras,
      horasReales,
      horasContractuales: horasPrevistasContrato,
      eleccionAplicada: choiceSalida || choiceEntrada || null,
      descripcion,
    },
  };
}
