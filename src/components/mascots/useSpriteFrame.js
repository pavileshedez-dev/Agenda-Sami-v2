import { useEffect, useRef, useState } from 'react'

// Reloj de animación por frames. No usa transformaciones CSS: cada frame es
// una porción distinta de la hoja de sprites.
export function useSpriteFrame(sheet, state, { playing = true } = {}) {
  const stateMeta = sheet.states[state] || sheet.states.idle || Object.values(sheet.states)[0]
  const [animation, setAnimation] = useState({ state: null, frame: 0 })
  const rafRef = useRef(0)

  useEffect(() => {
    if (!playing || !stateMeta) return undefined
    const start = performance.now()
    const tick = (now) => {
      const elapsed = (now - start) / 1000
      const raw = Math.floor(elapsed * stateMeta.fps)
      const next = stateMeta.loop ? raw % stateMeta.frames : Math.min(raw, stateMeta.frames - 1)
      setAnimation((previous) => (
        previous.state === state && previous.frame === next ? previous : { state, frame: next }
      ))
      const finished = !stateMeta.loop && raw >= stateMeta.frames
      if (!finished) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [stateMeta, playing, state, sheet])

  return animation.state === state ? animation.frame : 0
}

// Variante para tiras horizontales (lámpara, brillo, corazones, Zzz).
export function useStripFrame(sheet, { from = 0, count = sheet.frames, fps = sheet.fps, playing = true } = {}) {
  const [animation, setAnimation] = useState({ from: null, frame: from })
  const rafRef = useRef(0)

  useEffect(() => {
    if (!playing || count <= 1) return undefined
    const start = performance.now()
    const tick = (now) => {
      const elapsed = (now - start) / 1000
      const next = from + (Math.floor(elapsed * fps) % count)
      setAnimation((previous) => (
        previous.from === from && previous.frame === next ? previous : { from, frame: next }
      ))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [from, count, fps, playing])

  if (!playing || count <= 1) return from
  return animation.from === from ? animation.frame : from
}

export function useLampFrame(lampOn) {
  return useStripFrame(
    { frames: 4, fps: 6 },
    lampOn ? { from: 1, count: 3, fps: 6 } : { from: 0, count: 1, playing: false },
  )
}
