// Limpieza defensiva de emojis en texto libre (respuestas de IA, memoria...).
// La única excepción permitida en toda la app es el corazón del mensaje de
// Pibble, que se construye en mascotLogic.js y no pasa por esta función.
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}]|\uFE0F|\u200D|\u20E3/gu

export function sinEmojis(texto = '') {
  return String(texto)
    .replace(EMOJI_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
