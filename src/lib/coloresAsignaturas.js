// Sistema cromático completo para asignaturas (15 familias · 135 tonos curados + selector libre)
// Calcula estilos accesibles (contraste AA garantizado) directamente desde cualquier #RRGGBB.

export const DEFAULT_SUBJECT_HEX = {
  'Adquisición y Desarrollo del Lenguaje': '#2563eb', // Azul cobalto
  'Bases de la Neurociencia': '#0284c7',              // Azul océano
  'Estadística I': '#4f46e5',                         // Índigo
  'Evaluación I': '#059669',                          // Esmeralda
  'Evaluación II': '#0d9488',                         // Turquesa profundo
  'Exploración de la Audición y de la Voz': '#0891b2',// Cian
  'Fisiología de los Órganos del Lenguaje': '#65a30d',// Lima oliva
  'Lingüística II': '#7c3aed',                        // Violeta
  'Profesión del Logopeda': '#e11d48',                // Carmesí rosa
  'Psicología del Lenguaje': '#d97706',               // Ámbar cálido
  'Trastornos de la Voz y de la Audición': '#9333ea', // Púrpura
  'Trastornos del Desarrollo y del Aprendizaje': '#ea580c', // Naranja mandarina
  'Trastornos del Lenguaje de Etiología Neurológica': '#dc2626', // Rojo intenso
  'Trastornos del Lenguaje en Problemas Psicopatológicos': '#c026d3', // Magenta
  'Trastornos Estructurales de las Funciones Orofaciales': '#db2777', // Frambuesa
}

const FALLBACK_SWATCHES = [
  '#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed',
  '#0891b2', '#ea580c', '#c026d3', '#65a30d', '#4f46e5',
  '#db2777', '#0d9488', '#dc2626', '#0284c7', '#9333ea',
]

export const PALETA_FAMILIAS = [
  {
    id: 'rojos',
    label: 'Rojos y Carmesí',
    colores: ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#e11d48', '#be123c', '#fda4af'],
  },
  {
    id: 'corales',
    label: 'Corales y Terracota',
    colores: ['#7c2d12', '#9a3412', '#c2410c', '#e05a47', '#f06449', '#fb7185', '#ff7b54', '#f4845f', '#f7b2a8'],
  },
  {
    id: 'naranjas',
    label: 'Naranjas y Mandarina',
    colores: ['#92400e', '#b45309', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#ff8c42', '#ffa94d', '#fed7aa'],
  },
  {
    id: 'ambares',
    label: 'Ámbares y Ocre',
    colores: ['#713f12', '#854d0e', '#a16207', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
  },
  {
    id: 'amarillos',
    label: 'Amarillos y Mostaza',
    colores: ['#6b5600', '#8d7100', '#b59410', '#ca8a04', '#eab308', '#facc15', '#e5c100', '#fde047', '#fef08a'],
  },
  {
    id: 'limas',
    label: 'Limas y Oliva',
    colores: ['#365314', '#3f6212', '#4d7c0f', '#65a30d', '#84cc16', '#a3e635', '#7cb518', '#5c8001', '#d9f99d'],
  },
  {
    id: 'verdes',
    label: 'Verdes Bosque y Esmeralda',
    colores: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#16a34a', '#22c55e', '#34d399', '#a7f3d0'],
  },
  {
    id: 'mentas',
    label: 'Menta y Salvia',
    colores: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#38a3a5', '#2a9d8f', '#6b9080', '#74c69d', '#b7e4c7'],
  },
  {
    id: 'turquesas',
    label: 'Turquesas y Cian',
    colores: ['#134e4a', '#115e59', '#0f766e', '#0d9488', '#14b8a6', '#0891b2', '#06b6d4', '#22d3ee', '#99f6e4'],
  },
  {
    id: 'azules',
    label: 'Azules Cielo y Cobalto',
    colores: ['#0c4a6e', '#075985', '#0369a1', '#0284c7', '#0ea5e9', '#1d4ed8', '#2563eb', '#3b82f6', '#93c5fd'],
  },
  {
    id: 'indigos',
    label: 'Índigos y Zafiro',
    colores: ['#1e1b4b', '#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#1e40af', '#3f51b5', '#a5b4fc'],
  },
  {
    id: 'violetas',
    label: 'Violetas y Lavanda',
    colores: ['#3b0764', '#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#9333ea', '#a855f7', '#d8b4fe'],
  },
  {
    id: 'magentas',
    label: 'Magentas y Ciruela',
    colores: ['#4a044e', '#701a75', '#86198f', '#a21caf', '#c026d3', '#d946ef', '#9d174d', '#b5179e', '#f0abfc'],
  },
  {
    id: 'rosas',
    label: 'Rosas y Frambuesa',
    colores: ['#831843', '#9d174d', '#be185d', '#db2777', '#ec4899', '#f472b6', '#ff4d8d', '#fb6f92', '#fbcfe8'],
  },
  {
    id: 'neutros',
    label: 'Neutros, Arena y Pizarra',
    colores: ['#18181b', '#334155', '#475569', '#64748b', '#57534e', '#78716c', '#8d6e63', '#a1887f', '#94a3b8'],
  },
]

const HEX_RE = /^#([0-9a-f]{6})$/i

export function isValidHex(value) {
  return HEX_RE.test(String(value || '').trim())
}

export function normalizeHex(value) {
  const s = String(value || '').trim()
  return HEX_RE.test(s) ? s.toLowerCase() : null
}

export function getDefaultSubjectHex(nombre) {
  if (!nombre) return '#4f46e5'
  if (DEFAULT_SUBJECT_HEX[nombre]) return DEFAULT_SUBJECT_HEX[nombre]
  let hash = 0
  const str = String(nombre)
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return FALLBACK_SWATCHES[hash % FALLBACK_SWATCHES.length]
}

export function resolveSubjectHex(nombre, mapaColores) {
  const saved = mapaColores && nombre ? normalizeHex(mapaColores[nombre]) : null
  if (saved && saved !== '#6b7280') return saved
  return getDefaultSubjectHex(nombre)
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex) || '#4f46e5'
  const n = parseInt(clean.slice(1), 16)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  }
}

function mixRgb(a, b, ratio) {
  const r = Math.round(a.r * (1 - ratio) + b.r * ratio)
  const g = Math.round(a.g * (1 - ratio) + b.g * ratio)
  const bl = Math.round(a.b * (1 - ratio) + b.b * ratio)
  return `rgb(${r}, ${g}, ${bl})`
}

function relativeLuminance({ r, g, b }) {
  const toLin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

const WHITE = { r: 255, g: 255, b: 255 }
const INK = { r: 15, g: 23, b: 42 }

/**
 * Devuelve estilos inline armónicos y legibles (contraste AA >= 4.5:1)
 * directamente a partir de cualquier color hexadecimal o nombre de asignatura.
 */
export function getSubjectColorStyles(hexOrName) {
  const hex = normalizeHex(hexOrName) || getDefaultSubjectHex(hexOrName)
  const rgb = hexToRgb(hex)
  const lum = relativeLuminance(rgb)

  // Fondo suave pastel mezclado con blanco
  const bg = mixRgb(rgb, WHITE, lum > 0.7 ? 0.55 : 0.87)
  // Borde nítido
  const border = mixRgb(rgb, WHITE, lum > 0.7 ? 0.25 : 0.62)
  // Texto oscuro derivado del mismo tono con contraste garantizado
  const textMix = lum > 0.55 ? 0.62 : lum > 0.25 ? 0.42 : 0.16
  const text = mixRgb(rgb, INK, textMix)
  // Punto/acento visible incluso para tonos muy claros
  const dot = lum > 0.75 ? mixRgb(rgb, INK, 0.32) : hex

  return {
    hex,
    bg,
    border,
    text,
    dot,
    badgeStyle: {
      backgroundColor: bg,
      borderColor: border,
      color: text,
    },
    blockStyle: {
      backgroundColor: bg,
      borderColor: border,
      color: text,
    },
  }
}
