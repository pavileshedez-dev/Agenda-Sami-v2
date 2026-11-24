import { ZZZ_SHEET } from './spriteManifest'
import { PixelStrip } from './PixelSprite'

// Tres Z de píxeles flotando sobre la mascota dormida. No es un emoji.
export default function SleepZs({ size = 96, flip = false }) {
  const scale = Math.max(1, Math.round(size / 64))
  const side = flip ? { left: 4 } : { right: 4 }
  return (
    <div className="sleep-zzz" style={{ ...side, bottom: size * 0.72 }} aria-hidden="true" data-testid="sleep-zzz">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="sleep-zzz__item"
          style={{ animationDelay: `${index * 0.55}s`, left: index * 10 * scale }}
        >
          <PixelStrip sheet={ZZZ_SHEET} frame={index} scale={scale} />
        </span>
      ))}
    </div>
  )
}
