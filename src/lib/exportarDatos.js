// Exportación de datos de Calendario Sami.
// No exporta credenciales ni claves de API.
export const CLAVES_ACADEMICAS = [
  'calendario-asignaturas', 'calendario-horario', 'calendario-tasks',
  'agenda-tasks', 'agenda-custom-holidays', 'calendario-tipos-tarea',
];
export const CLAVES_RESPALDO = ['calendario-chat'];
export const CLAVES_PROHIBIDAS = ['calendario-gemini-key', 'gemini-api-key'];

function leer(storage, clave) {
  try {
    const v = storage.getItem(clave);
    if (v === null) return { presente: false, valor: null };
    return { presente: true, valor: JSON.parse(v) };
  } catch {
    return { presente: true, valor: null, error: 'JSON inválido' };
  }
}

export function construirExport(storage, origen = (typeof location !== 'undefined' ? location.origin : 'desconocido')) {
  const claves = {};
  const ausentes = [];
  const invalidas = [];
  for (const clave of CLAVES_ACADEMICAS.concat(CLAVES_RESPALDO)) {
    const r = leer(storage, clave);
    if (!r.presente) { ausentes.push(clave); continue; }
    if (r.error) { invalidas.push(clave); continue; }
    claves[clave] = r.valor;
  }
  return {
    formato: 'calendario-sami/export',
    version: 1,
    exportadoEn: new Date().toISOString(),
    origen,
    resumen: { claves: Object.keys(claves).length, ausentes, invalidas },
    claves,
  };
}

export function descargarExport(storage = window.localStorage) {
  const datos = construirExport(storage);
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'calendario-sami-export-' + datos.exportadoEn.slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  return datos;
}

if (typeof window !== 'undefined') window.exportarCalendario = descargarExport;
