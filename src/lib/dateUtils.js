/**
 * Utilidades de fecha para el calendario y la agenda.
 */

/**
 * Genera un arreglo inclusivo de cadenas 'YYYY-MM-DD' entre inicio y fin.
 * Utiliza aritmética UTC pura para evitar desvíos por cambios de huso horario (DST).
 *
 * @param {string} inicio - Fecha o timestamp ISO de inicio (ej: '2026-07-01' o '2026-07-01T10:00:00')
 * @param {string} [fin]  - Fecha o timestamp ISO de fin (opcional). Si se omite, se usa inicio.
 * @returns {string[]} Lista de fechas en formato 'YYYY-MM-DD'
 */
export function getDatesInRange(inicio, fin) {
  if (!inicio) return [];
  const startStr = String(inicio).slice(0, 10);
  const endStr = fin ? String(fin).slice(0, 10) : startStr;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return [];
  if (endStr < startStr || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return [startStr];

  const dates = [];
  const [startY, startM, startD] = startStr.split('-').map(Number);
  const [endY, endM, endD] = endStr.split('-').map(Number);

  const curr = new Date(Date.UTC(startY, startM - 1, startD));
  const end = new Date(Date.UTC(endY, endM - 1, endD));

  while (curr <= end) {
    const y = curr.getUTCFullYear();
    const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
    const d = String(curr.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return dates;
}
