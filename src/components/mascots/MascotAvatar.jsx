import { useMascots } from './MascotProvider'
import { PIXEL_ANIMATIONS } from './pixelManifest'

export default function MascotAvatar({ pet = 'pibble', size = 40, className = '' }) {
  const mascots = useMascots()
  const capi = pet === 'capilampara'

  const state = capi
    ? (mascots.capilampara.outfit
      ? 'study'
      : mascots.capilampara.lampOn
        ? 'lamp'
        : 'idle')
    : (mascots.pibble.pibblino
      ? 'pibblino'
      : mascots.pibble.bellyRub
        ? 'belly'
        : !mascots.pibble.awake
          ? 'sleep'
          : 'idle')

  const src = PIXEL_ANIMATIONS[pet]?.[state]?.frames?.[0] || PIXEL_ANIMATIONS[pet].idle.frames[0]
  const name = capi ? 'Capilámpara' : mascots.pibble.name

  return (
    <div
      className={`mascot-avatar mascot-avatar--${pet} rounded-full overflow-hidden border border-surface-200 flex items-center justify-center shrink-0 ${
        capi ? 'bg-amber-50' : 'bg-stone-100'
      } ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
      data-testid={`mascot-avatar-${pet}`}
    >
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        draggable={false}
        className="w-full h-full object-contain p-0.5 select-none mascot-pixel"
      />
    </div>
  )
}
