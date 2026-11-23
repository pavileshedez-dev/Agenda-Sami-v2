import { CAPILAMPARA_SHEET, GLOW_SHEET, LAMP_SHEET } from './spriteManifest'
import { PixelStrip } from './PixelSprite'
import { useLampFrame, useStripFrame } from './useSpriteFrame'

const LAMP_SIZE = LAMP_SHEET.frameWidth

// Naranja-lámpara acoplada a la cabeza de Capilámpara. Se dibuja como capa
// independiente para que tenga su propia zona pulsable y su propio brillo.
export default function LampAttachment({
  size,
  state,
  frame,
  flip = false,
  lampOn = false,
  outfit = false,
  onToggle,
  interactive = true,
  showGlow = true,
}) {
  const scale = size / 48
  const anchorSet = outfit
    ? (CAPILAMPARA_SHEET.lampAnchorsOutfit || CAPILAMPARA_SHEET.lampAnchors)
    : CAPILAMPARA_SHEET.lampAnchors
  const anchors = anchorSet?.[state] || anchorSet?.idle || [[30, 3]]
  const anchor = anchors[Math.min(frame, anchors.length - 1)] || anchors[0]
  const lampNativeX = flip ? 48 - anchor[0] - LAMP_SIZE : anchor[0]
  const lampX = lampNativeX * scale
  const lampY = anchor[1] * scale
  const lampSize = LAMP_SIZE * scale
  const hitPad = Math.max(4, (40 - lampSize) / 2)
  const glowSize = 64 * scale
  const glowX = (lampNativeX + LAMP_SIZE / 2) * scale - glowSize / 2
  const glowY = (anchor[1] + LAMP_SIZE / 2 + 1) * scale - glowSize / 2
  const lampFrame = useLampFrame(lampOn)
  const glowFrame = useStripFrame(GLOW_SHEET, { playing: lampOn, count: 3 })

  return (
    <>
      {showGlow && lampOn && (
        <div
          className="lamp-glow"
          aria-hidden="true"
          style={{ left: glowX, top: glowY, width: glowSize, height: glowSize }}
        >
          <PixelStrip sheet={GLOW_SHEET} frame={glowFrame} scale={scale} />
        </div>
      )}
      {interactive ? (
        <button
          type="button"
          className="lamp-hit"
          style={{
            left: lampX - hitPad,
            top: lampY - hitPad,
            width: lampSize + hitPad * 2,
            height: lampSize + hitPad * 2,
            padding: hitPad,
          }}
          onClick={(event) => {
            event.stopPropagation()
            onToggle?.()
          }}
          aria-pressed={lampOn}
          aria-label={lampOn ? 'Apagar la lámpara de Capilámpara' : 'Encender la lámpara de Capilámpara'}
          title={lampOn ? 'Apagar la lámpara' : 'Encender la lámpara'}
          data-testid="capilampara-lamp"
        >
          <PixelStrip sheet={LAMP_SHEET} frame={lampFrame} scale={scale} />
        </button>
      ) : (
        <div className="lamp-static" style={{ left: lampX, top: lampY }} aria-hidden="true">
          <PixelStrip sheet={LAMP_SHEET} frame={lampFrame} scale={scale} />
        </div>
      )}
    </>
  )
}
