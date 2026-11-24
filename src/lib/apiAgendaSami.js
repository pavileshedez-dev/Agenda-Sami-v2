// Cliente de API para las funcionalidades avanzadas de Agenda Sami:
// Trabajo (Sistema D), Mi Semana, Asistentes IA (Pibble & Capilámpara), y Ajustes.

import { obtenerCsrf, fetchApiJson } from './apiCalendario';

async function pedir(ruta, opciones = {}) {
  return fetchApiJson(ruta, opciones);
}

async function mutar(metodo, ruta, datos, extra = {}) {
  const csrf = await obtenerCsrf();
  return fetchApiJson(
    ruta,
    {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}),
      body: datos === undefined ? undefined : JSON.stringify(datos),
    },
    Object.assign({ allowCsrfRetry: true }, extra)
  );
}

// ── Trabajo (Sistema D) ──
export const apiTrabajo = {
  obtenerEstado: () => pedir('/api/trabajo/estado').then(r => r.data),
  fichar: (action) => mutar('POST', '/api/trabajo/fichar', { action }).then(r => r.data),

  listarTurnos: (desde, hasta) => {
    let q = '';
    if (desde && hasta) q = `?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    return pedir(`/api/trabajo/turnos${q}`).then(r => r.data || []);
  },
  crearTurno: (datos) => mutar('POST', '/api/trabajo/turnos', datos).then(r => r.data),
  editarTurno: (id, datos) => mutar('PATCH', `/api/trabajo/turnos/${encodeURIComponent(id)}`, datos).then(r => r.data),
  borrarTurno: (id) => mutar('DELETE', `/api/trabajo/turnos/${encodeURIComponent(id)}`).then(r => r.data),

  listarJornadas: () => pedir('/api/trabajo/jornadas').then(r => r.data || []),
  crearJornada: (datos) => mutar('POST', '/api/trabajo/jornadas', datos).then(r => r.data),
  editarJornada: (id, datos) => mutar('PATCH', `/api/trabajo/jornadas/${encodeURIComponent(id)}`, datos).then(r => r.data),
  borrarJornada: (id) => mutar('DELETE', `/api/trabajo/jornadas/${encodeURIComponent(id)}`).then(r => r.data),

  resumenSemanal: (fecha) => pedir(`/api/trabajo/resumen${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`).then(r => r.data),
};

// ── Mi Semana (Retrospectiva Semanal Inmutable) ──
export const apiSemana = {
  resumen: (fecha) => pedir(`/api/semana/resumen${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ''}`).then(r => r.data),
  cerrar: (datos) => mutar('POST', '/api/semana/cerrar', datos),
  reabrir: (semanaInicio) => mutar('POST', '/api/semana/reabrir', { semana_inicio: semanaInicio }),
};

// ── Asistentes IA (Pibble & Capilámpara) ──
export const apiIA = {
  enviarMensaje: ({ assistant, message, history }) =>
    mutar('POST', '/api/ia/chat', { assistant, message, history }, { timeoutMs: 45000 }).then(r => r.data),

  confirmarPropuesta: (proposalId) =>
    mutar('POST', '/api/ia/proposal/confirm', { proposalId }).then(r => r.data),

  rechazarPropuesta: (proposalId) =>
    mutar('POST', '/api/ia/proposal/reject', { proposalId }).then(r => r.data),

  listarMemorias: () => pedir('/api/ia/memorias').then(r => r.data || []),
  crearMemoria: (datos) => mutar('POST', '/api/ia/memorias', datos).then(r => r.data),
  borrarMemoria: (id) => mutar('DELETE', `/api/ia/memorias/${encodeURIComponent(id)}`).then(r => r.data),
  limpiarMemorias: () => mutar('DELETE', '/api/ia/memorias').then(r => r.data),

  obtenerConfig: () => pedir('/api/ia/config').then(r => r.data),
  guardarConfig: (datos) => mutar('POST', '/api/ia/config', datos).then(r => r.data),
};

// ── Backup / Exportación / Importación ──
export const apiBackup = {
  exportarUrl: () => '/api/backup/export',
  exportarSqliteUrl: () => '/api/backup/sqlite',
  verificar: () => pedir('/api/backup/verify'),
  importar: (datos) => mutar('POST', '/api/backup/import', datos, { timeoutMs: 60000 }),
};
