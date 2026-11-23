const BASE = import.meta.env.BASE_URL || '/'

// Respeta la base de Vite (por ejemplo /calendario/) sin depender de rutas absolutas.
export function mascotAsset(path) {
  const clean = String(path).replace(/^\/+/, '')
  return `${BASE.endsWith('/') ? BASE : `${BASE}/`}${clean}`
}
