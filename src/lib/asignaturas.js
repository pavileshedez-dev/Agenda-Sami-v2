// Catálogo unificado de asignaturas — Grado en Logopedia
// Fuente única y coherente para Universidad, Agenda y Horario.

export const ASIGNATURAS = [
    'Adquisición y Desarrollo del Lenguaje',
    'Bases de la Neurociencia',
    'Estadística I',
    'Evaluación I',
    'Evaluación II',
    'Exploración de la Audición y de la Voz',
    'Fisiología de los Órganos del Lenguaje',
    'Lingüística II',
    'Profesión del Logopeda',
    'Psicología del Lenguaje',
    'Trastornos de la Voz y de la Audición',
    'Trastornos del Desarrollo y del Aprendizaje',
    'Trastornos del Lenguaje de Etiología Neurológica',
    'Trastornos del Lenguaje en Problemas Psicopatológicos',
    'Trastornos Estructurales de las Funciones Orofaciales',
]

export const ASIGNATURA_COLORS = {
    'Adquisición y Desarrollo del Lenguaje': 'bg-blue-100 text-blue-700',
    'Bases de la Neurociencia': 'bg-sky-100 text-sky-700',
    'Estadística I': 'bg-indigo-100 text-indigo-700',
    'Evaluación I': 'bg-emerald-100 text-emerald-700',
    'Evaluación II': 'bg-teal-100 text-teal-700',
    'Exploración de la Audición y de la Voz': 'bg-cyan-100 text-cyan-700',
    'Fisiología de los Órganos del Lenguaje': 'bg-teal-100 text-teal-700',
    'Lingüística II': 'bg-violet-100 text-violet-700',
    'Profesión del Logopeda': 'bg-rose-100 text-rose-700',
    'Psicología del Lenguaje': 'bg-amber-100 text-amber-700',
    'Trastornos de la Voz y de la Audición': 'bg-purple-100 text-purple-700',
    'Trastornos del Desarrollo y del Aprendizaje': 'bg-orange-100 text-orange-700',
    'Trastornos del Lenguaje de Etiología Neurológica': 'bg-red-100 text-red-700',
    'Trastornos del Lenguaje en Problemas Psicopatológicos': 'bg-fuchsia-100 text-fuchsia-700',
    'Trastornos Estructurales de las Funciones Orofaciales': 'bg-pink-100 text-pink-700',
    'Otra': 'bg-gray-100 text-gray-600',
}

export function normalizeText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

export function getColorAsignatura(nombre) {
    if (!nombre) return 'bg-gray-100 text-gray-600'
    return ASIGNATURA_COLORS[nombre] || 'bg-primary-100 text-primary-700'
}
