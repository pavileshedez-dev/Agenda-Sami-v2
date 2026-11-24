// Cliente de la API central del Calendario de Agenda Sami.
// Fuente única de verdad: SQLite. Valida, detecta conflictos y persiste.
const BASE = '/api/calendario';
const DEFAULT_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(status, code, mensaje, cuerpo = null) {
    super(mensaje || code);
    this.status = status;
    this.code = code;
    if (cuerpo) {
      this.detalles = cuerpo.detalles;
      this.frontera = cuerpo.frontera;
      this.cuerpo = cuerpo;
    }
  }
}

let csrfCache = null;

export function setCsrfToken(token) {
  csrfCache = token || null;
}

export function resetCsrfCache() {
  csrfCache = null;
}

function notifyUnauthorized() {
  resetCsrfCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agenda:unauthorized'));
  }
}

function createTimeoutSignal(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

export async function obtenerCsrf({ forceRefresh = false } = {}) {
  if (csrfCache && !forceRefresh) return csrfCache;
  const r = await fetch('/api/auth/session', {
    credentials: 'same-origin',
    signal: createTimeoutSignal(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (j && j.authenticated && j.csrfToken) {
    csrfCache = j.csrfToken;
    return csrfCache;
  }
  csrfCache = null;
  return null;
}

export async function fetchApiJson(fullUrl, opciones = {}, { allowCsrfRetry = false, isAuthEndpoint = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const signal = opciones.signal || createTimeoutSignal(timeoutMs);
  const res = await fetch(fullUrl, Object.assign({ credentials: 'same-origin', signal }, opciones));
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch { cuerpo = null; }

  if (res.status === 401 && !isAuthEndpoint) {
    notifyUnauthorized();
  }

  // Reintento único y seguro exclusivamente cuando el servidor rechazó la petición ANTES de ejecutarla por CSRF_INVALID
  if (allowCsrfRetry && res.status === 403 && cuerpo && cuerpo.code === 'CSRF_INVALID') {
    resetCsrfCache();
    const freshCsrf = await obtenerCsrf({ forceRefresh: true });
    if (freshCsrf) {
      const nextHeaders = Object.assign({}, opciones.headers || {}, { 'X-CSRF-Token': freshCsrf });
      return fetchApiJson(
        fullUrl,
        Object.assign({}, opciones, { headers: nextHeaders }),
        { allowCsrfRetry: false, isAuthEndpoint, timeoutMs }
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (cuerpo && cuerpo.code) || 'HTTP_' + res.status,
      (cuerpo && (cuerpo.error || cuerpo.code)) || `Error HTTP ${res.status}`,
      cuerpo
    );
  }
  return cuerpo;
}

async function pedir(ruta, opciones = {}) {
  return fetchApiJson(BASE + ruta, opciones);
}

async function mutar(metodo, ruta, datos) {
  const csrf = await obtenerCsrf();
  return fetchApiJson(
    BASE + ruta,
    {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}),
      body: datos === undefined ? undefined : JSON.stringify(datos),
    },
    { allowCsrfRetry: true }
  );
}

export const apiAuth = {
  session: () => fetchApiJson('/api/auth/session', {}, { isAuthEndpoint: true }),
  login: async ({ username, password }) => {
    const res = await fetchApiJson(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      },
      { isAuthEndpoint: true }
    );
    if (res && res.csrfToken) {
      setCsrfToken(res.csrfToken);
    }
    return res;
  },
  logout: async () => {
    const csrf = await obtenerCsrf();
    try {
      return await fetchApiJson(
        '/api/auth/logout',
        {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}),
          body: JSON.stringify({}),
        },
        { allowCsrfRetry: true, isAuthEndpoint: true }
      );
    } finally {
      resetCsrfCache();
    }
  },
};

const recurso = (ruta) => ({
  listar: (query = '') => pedir(ruta + (query ? `?${query}` : '')).then((r) => (r && r.data) || []),
  crear: (datos) => mutar('POST', ruta, datos).then((r) => r && r.data),
  editar: (id, datos) => mutar('PATCH', ruta + '/' + encodeURIComponent(id), datos).then((r) => r && r.data),
  borrar: (id) => mutar('DELETE', ruta + '/' + encodeURIComponent(id)).then((r) => r && r.data),
});

export const asignaturas = recurso('/asignaturas');
export const horarios = recurso('/horarios');
export const horarioExcepciones = {
  listar: (fecha) => pedir('/horarios/excepciones' + (fecha ? '?fecha=' + encodeURIComponent(fecha) : '')).then((r) => (r && r.data) || []),
  crear: (datos) => mutar('POST', '/horarios/excepciones', datos).then((r) => r && r.data),
  borrar: (id) => mutar('DELETE', '/horarios/excepciones/' + encodeURIComponent(id)).then((r) => r && r.data),
};
export const tareas = recurso('/tareas');
export const proyectos = {
  listar: () => pedir('/proyectos?conTareas=1').then((r) => (r && r.data) || []),
  detalle: (id) => pedir('/proyectos/' + encodeURIComponent(id)).then((r) => r && r.data),
};
export const proyectoTareas = {
  vincular: (proyectoId, tareaId) => mutar('POST', '/proyectos/' + encodeURIComponent(proyectoId) + '/tareas/' + encodeURIComponent(tareaId)),
  desvincular: (proyectoId, tareaId) => mutar('DELETE', '/proyectos/' + encodeURIComponent(proyectoId) + '/tareas/' + encodeURIComponent(tareaId)),
};
export const objetivos = recurso('/objetivos');
export const objetivoTareas = {
  listar: (objetivoId) => pedir('/objetivos/' + encodeURIComponent(objetivoId) + '/tareas').then((r) => (r && r.data) || []),
  vincular: (objetivoId, tareaId) => mutar('POST', '/objetivos/' + encodeURIComponent(objetivoId) + '/tareas', { tareaId }),
  desvincular: (objetivoId, tareaId) => mutar('DELETE', '/objetivos/' + encodeURIComponent(objetivoId) + '/tareas/' + encodeURIComponent(tareaId)),
};
export const tiposTarea = recurso('/tipos-tarea');
export const eventos = recurso('/eventos');

export const festivos = {
  listar: (ambito) => pedir('/festivos' + (ambito ? '?ambito=' + encodeURIComponent(ambito) : '')).then((r) => (r && r.data) || []),
  crear: (datos) => mutar('POST', '/festivos', datos).then((r) => r && r.data),
  borrar: (id) => mutar('DELETE', '/festivos/' + encodeURIComponent(id)).then((r) => r && r.data),
};

export const agenda = (desde, hasta, ambito) =>
  pedir('/agenda?desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta) + (ambito ? '&ambito=' + encodeURIComponent(ambito) : ''));
export const resumen = (desde, hasta) =>
  pedir('/resumen?desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta));

export const plan = (hoy) => pedir('/plan' + (hoy ? '?hoy=' + encodeURIComponent(hoy) : ''));
export const hoy = (dia) => pedir('/hoy' + (dia ? '?hoy=' + encodeURIComponent(dia) : ''));

export async function estadoDatos() {
  try {
    const [a, t] = await Promise.all([asignaturas.listar(), tareas.listar()]);
    return { ok: true, asignaturas: a.length, tareas: t.length, fuente: 'sqlite' };
  } catch (e) {
    return { ok: false, code: e.code, fuente: 'no-disponible' };
  }
}
