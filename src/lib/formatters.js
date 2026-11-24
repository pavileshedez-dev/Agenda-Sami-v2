// Utilidades de formateo humano en español para fechas, horas y dominios.

export function capitalizeFirst(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) como "Martes, 17 de noviembre"
 * sin usar CSS `capitalize` (que convertía "de" en "De").
 */
export function formatLongDate(iso, { includeYear = false } = {}) {
  if (!iso) return ''
  const clean = String(iso).slice(0, 10)
  const d = new Date(`${clean}T12:00:00`)
  if (Number.isNaN(d.getTime())) return clean
  const raw = d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
  return capitalizeFirst(raw)
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) como "17 nov" (o "17 nov 2026" si otro año).
 */
export function formatShortDate(iso, { forceYear = false } = {}) {
  if (!iso) return 'Sin fecha'
  const clean = String(iso).slice(0, 10)
  const d = new Date(`${clean}T12:00:00`)
  if (Number.isNaN(d.getTime())) return clean
  const currentYear = new Date().getFullYear()
  const includeYear = forceYear || d.getFullYear() !== currentYear
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

/**
 * Formatea un rango de evento (inicio/fin) manejando correctamente eventos de día completo.
 */
export function formatEventTime(inicio, fin, esDiaCompleto = false) {
  const startStr = String(inicio || '')
  const endStr = String(fin || '')
  const hasStartTime = startStr.includes('T') && startStr.length >= 16
  if (esDiaCompleto || !hasStartTime) {
    const d1 = startStr.slice(0, 10)
    const d2 = endStr ? endStr.slice(0, 10) : d1
    if (d1 && d2 && d2 !== d1) {
      return `${formatShortDate(d1)} – ${formatShortDate(d2)}`
    }
    return 'Todo el día'
  }
  const h1 = startStr.slice(11, 16)
  const h2 = endStr.includes('T') && endStr.length >= 16 ? endStr.slice(11, 16) : ''
  return h2 ? `${h1}–${h2}` : h1
}

export function formatAmbito(ambito) {
  if (ambito === 'academico') return 'Académico'
  if (ambito === 'personal') return 'Personal'
  if (ambito === 'trabajo') return 'Trabajo'
  return ambito || ''
}
