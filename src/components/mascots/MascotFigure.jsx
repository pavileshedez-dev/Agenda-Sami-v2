import { useEffect, useRef, useState } from 'react'
import { useMascots } from './MascotProvider'
import { PIXEL_ANIMATIONS } from './pixelManifest'

const REACTIONS = {
  pibble: {
    wake: ['happy', 1100],
    pet: ['happy', 2000],
    bark: ['bark', 1500],
    belly_rub: ['belly_rub', 2200],
    belly_ask: ['belly', 1200],
    pibblino: ['pibblino', 1200],
    revert: ['happy', 1200],
  },
  capilampara: {
    pet: ['pet', 2400],
    outfit: ['study', 900],
    lamp: ['lamp', 900],
  },
}

const PARTICLE_OFFSETS = [
  { left: '24%', delay: '0ms', drift: '-14px' },
  { left: '50%', delay: '120ms', drift: '4px' },
  { left: '74%', delay: '220ms', drift: '16px' },
]

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export default function MascotFigure({
  pet,
  size = 192,
  origin = 'companeros',
  className = '',
  interactive = true,
  overrideState = null,
}) {
  const mascots = useMascots()
  const reducedMotion = useReducedMotion()
  const [reaction, setReaction] = useState(null)
  const [burst, setBurst] = useState({ id: 0, kind: 'hearts' })
  const [frameIdx, setFrameIdx] = useState(0)
  const lastEventId = useRef(0)

  const capi = pet === 'capilampara'

  useEffect(() => {
    const event = mascots.event
    if (!event || event.pet !== pet || event.id === lastEventId.current) return undefined
    lastEventId.current = event.id

    if (event.type === 'pet' || event.type === 'belly_rub') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBurst((c) => ({ id: c.id + 1, kind: 'hearts' }))
    } else if (event.type === 'pibblino' || event.type === 'outfit' || event.type === 'lamp' || event.type === 'belly_ask') {
      setBurst((c) => ({ id: c.id + 1, kind: 'sparkles' }))
    }

    const spec = REACTIONS[pet][event.type]
    if (!spec) return undefined
    setReaction({ state: spec[0], id: event.id })
    const timer = setTimeout(() => {
      setReaction((current) => (current?.id === event.id ? null : current))
    }, spec[1])
    return () => clearTimeout(timer)
  }, [mascots.event, pet])

  // Resolver estado visual real (priorizando overrideState y escena compartida de 4 actos)
  let visualState = 'idle'
  let altText = 'Pibble en pixel art, perrito crema regordete con pelos de chivo en la barbillita'

  if (overrideState) {
    visualState = overrideState
  } else if (mascots.togetherScene?.active) {
    const act = mascots.togetherScene.act
    if (!capi) {
      if (act === 'act1_ask' || act === 'act2_notice') visualState = 'belly'
      else if (act === 'act3_interact') visualState = 'belly_rub'
      else if (act === 'act4_settle') visualState = 'happy'
    } else {
      if (act === 'act1_ask') visualState = 'idle'
      else if (act === 'act2_notice') visualState = 'lamp'
      else if (act === 'act3_interact') visualState = 'pet'
      else if (act === 'act4_settle') visualState = 'idle'
    }
  } else if (!capi) {
    const { awake, bellyRub, pibblino } = mascots.pibble
    if (!awake) {
      visualState = 'sleep'
      altText = 'Pibble en pixel art tumbado durmiendo sobre sus patitas'
    } else if (bellyRub) {
      visualState = reaction?.state === 'belly_rub' ? 'belly_rub' : 'belly'
      altText = 'Pibble en pixel art boca arriba pidiendo que le rasquen la pancita'
    } else if (pibblino) {
      visualState = 'pibblino'
      altText = 'Pibblino en pixel art con auriculares AirPods y ojos cerrados'
    } else if (reaction?.state === 'happy' || reaction?.state === 'bark') {
      visualState = reaction.state
      altText = 'Pibble en pixel art contento sonriendo y ladrando'
    } else {
      visualState = 'idle'
    }
  } else {
    const { lampOn, outfit } = mascots.capilampara
    if (reaction?.state === 'pet') {
      visualState = 'pet'
      altText = 'Capilámpara en pixel art con ojos cerrados felices recibiendo caricias'
    } else if (outfit) {
      visualState = 'study'
      altText = 'Capilámpara en pixel art con gafas redondas, bufanda, libro y mandarina encendida'
    } else if (lampOn) {
      visualState = 'lamp'
      altText = 'Capilámpara en pixel art con su mandarina brillando con luz cálida'
    } else {
      visualState = 'idle'
      altText = 'Capilámpara en pixel art descansando en calma con su mandarina'
    }
  }

  const anim = PIXEL_ANIMATIONS[pet]?.[visualState] || PIXEL_ANIMATIONS[pet].idle
  const frameCount = anim.frames.length
  const intervalMs = Math.max(90, Math.round(1000 / anim.fps))

  // Ciclo real fotograma a fotograma (sin transformaciones CSS sustitutivas)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrameIdx(0)
    if (reducedMotion || frameCount <= 1) return undefined
    const timer = setInterval(() => {
      setFrameIdx((idx) => (idx + 1) % frameCount)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [pet, visualState, frameCount, intervalMs, reducedMotion])

  const currentSrc = anim.frames[frameIdx % frameCount] || anim.frames[0]
  const ownBubble = mascots.bubble?.pet === pet && mascots.bubble?.origin === origin
  const lampGlowActive = capi && (visualState === 'lamp' || visualState === 'study')

  const ariaAction = capi
    ? 'Acariciar a Capilámpara'
    : !mascots.pibble.awake
      ? 'Despertar a Pibble'
      : mascots.pibble.bellyRub
        ? 'Rascar la pancita y la barbillita de Pibble'
        : 'Acariciar a Pibble'

  return (
    <div
      className={`mascot-art mascot-art--${pet} ${className}`}
      data-testid={`${pet}-figure`}
      data-state={visualState}
    >
      {ownBubble && (
        <div
          role="status"
          aria-live="polite"
          className={`mascot-speech-bubble mascot-speech-bubble--${pet}`}
        >
          <span>{mascots.bubble.text}</span>
        </div>
      )}

      <div className="mascot-art__stage" style={{ width: size, height: size }}>
        {lampGlowActive && <div className="mascot-art__lamp-halo" aria-hidden="true" />}

        {burst.id > 0 && (
          <div key={burst.id} className="mascot-art__particles" aria-hidden="true">
            {PARTICLE_OFFSETS.map((item, idx) => (
              <span
                key={idx}
                className="mascot-art__particle"
                style={{
                  left: item.left,
                  animationDelay: item.delay,
                  '--particle-drift': item.drift,
                }}
              >
                {burst.kind === 'hearts' ? '♥' : '✦'}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => (capi ? mascots.patCapilampara(origin) : mascots.patPibble(origin))}
          disabled={!interactive}
          aria-label={ariaAction}
          title={ariaAction}
          data-testid={`${pet}-pet-btn`}
          className="mascot-art__hit"
        >
          <img
            src={currentSrc}
            alt={altText}
            width={size}
            height={size}
            draggable={false}
            className="mascot-art__img mascot-art__img--pixel"
          />
        </button>
      </div>
    </div>
  )
}
