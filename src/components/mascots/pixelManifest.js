// Manifiesto canónico de ciclos de animación pixel art frame-a-frame (96×96 nativos).
// Cada fotograma es un PNG único sin duplicados, con transparencia binaria y paleta bloqueada.

function buildFrames(pet, state, count) {
  return Array.from({ length: count }, (_, i) => `/mascots/pixel-v5/${pet}/${state}/f${i}.png`)
}

export const PIXEL_ANIMATIONS = {
  pibble: {
    idle:      { fps: 3,   frames: buildFrames('pibble', 'idle', 4) },
    sleep:     { fps: 2.5, frames: buildFrames('pibble', 'sleep', 4) },
    belly:     { fps: 3.5, frames: buildFrames('pibble', 'belly', 4) },
    belly_rub: { fps: 7,   frames: buildFrames('pibble', 'belly_rub', 6) },
    happy:     { fps: 6,   frames: buildFrames('pibble', 'happy', 4) },
    bark:      { fps: 7,   frames: buildFrames('pibble', 'bark', 4) },
    pibblino:  { fps: 4,   frames: buildFrames('pibble', 'pibblino', 4) },
  },
  capilampara: {
    idle:  { fps: 3,   frames: buildFrames('capilampara', 'idle', 4) },
    lamp:  { fps: 4.5, frames: buildFrames('capilampara', 'lamp', 4) },
    study: { fps: 3.5, frames: buildFrames('capilampara', 'study', 6) },
    pet:   { fps: 5,   frames: buildFrames('capilampara', 'pet', 4) },
  },
}

let preloaded = false

export function preloadPixelAnimations() {
  if (preloaded || typeof Image === 'undefined') return
  preloaded = true
  Object.values(PIXEL_ANIMATIONS).forEach((states) => {
    Object.values(states).forEach(({ frames }) => {
      frames.forEach((src) => {
        const img = new Image()
        img.src = src
      })
    })
  })
}
