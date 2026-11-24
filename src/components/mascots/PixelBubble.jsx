import { mascotAsset } from './assets'
import { UI_ASSETS } from './spriteManifest'

// Bocadillo con borde pixelado 9-slice y cola de píxeles. El texto se mantiene
// como texto normal; el único emoji permitido es el corazón de Pibble.
export default function PixelBubble({ text, pet = 'pibble', className = '' }) {
  if (!text) return null
  return (
    <div
      className={`pixel-bubble pixel-bubble--${pet} ${className}`}
      role="status"
      aria-live="polite"
      data-testid="mascot-bubble"
      data-pet={pet}
      style={{
        '--bubble-image': `url("${mascotAsset(UI_ASSETS.bubble)}")`,
        '--bubble-tail-image': `url("${mascotAsset(UI_ASSETS.bubbleTail)}")`,
      }}
    >
      <span className="pixel-bubble__text">{text}</span>
      <span className="pixel-bubble__tail" aria-hidden="true" />
    </div>
  )
}
