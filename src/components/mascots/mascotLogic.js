// Lógica pura de las mascotas: mensajes permitidos, horario de Madrid y
// contador de caricias. Se mantiene fuera de React para poder probarla con Node.
export const LOVE_TEXT = '¡Te quiero! ❤️'
export const PIBBLINO_TEXT = '¿Vemos La que se avecina?'
export const PIBBLINO_NAME = 'Pibblino'
export const PIBBLINO_DURATION_MS = 30000
export const PAT_WINDOW_MS = 6000
export const PATS_FOR_PIBBLINO = 5

export const BELLY_ASK_TEXT = '¡Ráscame la pancita y la barbillita!'
export const BELLY_RUB_LINES = [
  '¡Ahí, ahí! Qué gustito en la pancita ❤️',
  '¡Más rasquitas en los pelos de chivo!',
  '¡Jiji, no pares de rascarme la barbillita!',
  'Pancita feliz, Pibble feliz ❤️',
]

export function madridHour(date = new Date()) {
  try {
    const formatted = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date)
    return Number.parseInt(formatted, 10)
  } catch {
    return date.getHours()
  }
}

export function isLampAutoOn(date = new Date()) {
  const hour = madridHour(date)
  return hour >= 0 && hour < 6
}

export function nextPatCount(currentCount, lastPatAt, now = Date.now(), windowMs = PAT_WINDOW_MS) {
  if (!lastPatAt || now - lastPatAt > windowMs) return 1
  return currentCount + 1
}

export function shouldTriggerPibblino(count) {
  return count >= PATS_FOR_PIBBLINO
}

export function pibbleDisplayName(isPibblino) {
  return isPibblino ? PIBBLINO_NAME : 'Pibble'
}
