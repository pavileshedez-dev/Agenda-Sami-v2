import { useEffect, useRef, useState } from 'react'
import { mascotAsset } from './assets'
import { HEART_SHEET, SPARKLE_SHEET } from './spriteManifest'

// Partículas pixel art (corazones al acariciar, destellos al cambiar de look).
export default function PetParticles({ kind = 'hearts', burst = 0, size = 96 }) {
  const [particles, setParticles] = useState([])
  const counter = useRef(0)
  const lastBurst = useRef(0)

  useEffect(() => {
    if (!burst || burst === lastBurst.current) return undefined
    lastBurst.current = burst
    const amount = kind === 'hearts' ? 3 : 6
    const created = Array.from({ length: amount }, (_, index) => {
      counter.current += 1
      return {
        id: counter.current,
        left: 22 + Math.random() * 56,
        bottom: 34 + Math.random() * 12,
        delay: index * 90 + Math.random() * 60,
        drift: (Math.random() - 0.5) * 30,
        scale: kind === 'sparkles' ? 1.2 + Math.random() * 0.8 : 1.1 + Math.random() * 0.6,
      }
    })
    setParticles((previous) => [...previous.slice(-6), ...created])
    const timer = setTimeout(() => {
      setParticles((previous) => previous.filter((particle) => !created.some((item) => item.id === particle.id)))
    }, 2200)
    return () => clearTimeout(timer)
  }, [burst, kind])

  const sheet = kind === 'hearts' ? HEART_SHEET : SPARKLE_SHEET
  const frames = sheet.frames
  const file = mascotAsset(sheet.file)

  return (
    <div className="pet-particles" aria-hidden="true" style={{ width: size, height: size }}>
      {particles.map((particle) => {
        const width = sheet.frameWidth * particle.scale
        const height = sheet.frameHeight * particle.scale
        return (
          <span
            key={particle.id}
            className={`pet-particle pet-particle--${kind}`}
            style={{
              left: `${particle.left}%`,
              bottom: `${particle.bottom}%`,
              width,
              height,
              backgroundImage: `url("${file}")`,
              backgroundSize: `${frames * width}px ${height}px`,
              animationDelay: `${particle.delay}ms`,
              '--particle-drift': `${particle.drift}px`,
              '--particle-frames': `${frames * width}px`,
            }}
          />
        )
      })}
    </div>
  )
}
