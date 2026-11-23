import { useMascots } from './MascotProvider'
import { mascotAsset } from './assets'
import { UI_ASSETS } from './spriteManifest'

// Luz ambiental cálida de la lámpara: capa fija, no interactiva, con tramado
// pixelado. Se apoya en la variable --lamp-x que actualiza MascotStage.
export default function LampLight() {
  const { capilampara } = useMascots()
  return (
    <div
      className={`lamp-light ${capilampara.lampOn ? 'is-on' : ''}`}
      aria-hidden="true"
      data-testid="lamp-light"
      data-on={capilampara.lampOn ? 'true' : 'false'}
      style={{ '--dither-image': `url("${mascotAsset(UI_ASSETS.dither)}")` }}
    >
      <div className="lamp-light__wash" />
      <div className="lamp-light__dither" />
    </div>
  )
}
