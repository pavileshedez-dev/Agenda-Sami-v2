import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  BELLY_ASK_TEXT,
  BELLY_RUB_LINES,
  LOVE_TEXT,
  PIBBLINO_DURATION_MS,
  PIBBLINO_TEXT,
  isLampAutoOn,
  nextPatCount,
  pibbleDisplayName,
} from './mascotLogic'
import { POSE_CATALOG, readUnlockedPoses, saveUnlockedPoses } from './mascotUnlocks'
import { preloadPixelAnimations } from './pixelManifest'
import './mascot.css'

const MascotContext = createContext(null)
const OUTFIT_KEY = 'agenda-sami-capilampara-outfit'

const CAPI_PAT_LINES = [
  'Qué gustito.',
  'Gracias, Sami.',
  'Se está bien así.',
  'Un rato más y sigo estudiando.',
]

function readOutfit() {
  try {
    return localStorage.getItem(OUTFIT_KEY) === 'on'
  } catch {
    return false
  }
}

export function MascotProvider({ children }) {
  const location = useLocation()
  const [awake, setAwake] = useState(true)
  const [bellyRub, setBellyRub] = useState(false)
  const [pibblino, setPibblino] = useState(false)
  const [outfit, setOutfit] = useState(readOutfit)
  const [bubble, setBubble] = useState(null)
  const [event, setEvent] = useState(null)
  const [autoLamp, setAutoLamp] = useState(() => isLampAutoOn())
  const [lampOn, setLampOn] = useState(() => isLampAutoOn())
  const [unlockedPoses, setUnlockedPoses] = useState(readUnlockedPoses)
  const [patStreak, setPatStreak] = useState(0)
  const [unlockNotice, setUnlockNotice] = useState(null)
  const [togetherScene, setTogetherScene] = useState({ active: false, act: null, caption: '' })

  const awakeRef = useRef(true)
  const bellyRubRef = useRef(false)
  const pibblinoRef = useRef(false)
  const lampOnRef = useRef(lampOn)
  const outfitRef = useRef(outfit)
  const autoRef = useRef(autoLamp)
  const patRef = useRef({ count: 0, lastAt: 0 })
  const bellyCountRef = useRef(0)
  const capiPatRef = useRef(0)
  const eventIdRef = useRef(0)
  const bubbleIdRef = useRef(0)
  const bubbleTimerRef = useRef(null)
  const pibblinoTimerRef = useRef(null)
  const unlockNoticeTimerRef = useRef(null)
  const togetherTimersRef = useRef([])
  const unlockedRef = useRef(unlockedPoses)

  useEffect(() => {
    preloadPixelAnimations()
  }, [])

  useEffect(() => {
    lampOnRef.current = lampOn
  }, [lampOn])

  useEffect(() => {
    unlockedRef.current = unlockedPoses
  }, [unlockedPoses])

  const unlockPose = useCallback((poseId) => {
    if (!poseId || unlockedRef.current.includes(poseId)) return
    const next = [...unlockedRef.current, poseId]
    unlockedRef.current = next
    setUnlockedPoses(next)
    saveUnlockedPoses(next)
    const meta = POSE_CATALOG.find((p) => p.id === poseId)
    if (meta && !meta.defaultUnlocked) {
      if (unlockNoticeTimerRef.current) clearTimeout(unlockNoticeTimerRef.current)
      setUnlockNotice(`Nueva pose descubierta: ${meta.title}`)
      unlockNoticeTimerRef.current = setTimeout(() => setUnlockNotice(null), 4200)
    }
  }, [])

  // Desbloqueo orgánico por uso natural de las secciones de la app
  useEffect(() => {
    const p = location.pathname
    if (p.startsWith('/universidad') || p.startsWith('/horario')) {
      unlockPose('capi_study')
    } else if (p.startsWith('/trabajo')) {
      unlockPose('pibble_bark')
    }
  }, [location.pathname, unlockPose])

  // Reloj de Madrid: la lámpara se enciende sola entre las 00:00 y las 05:59.
  useEffect(() => {
    if (autoLamp) {
      unlockPose('capi_lamp')
    }
    const timer = setInterval(() => setAutoLamp(isLampAutoOn()), 30000)
    return () => clearInterval(timer)
  }, [autoLamp, unlockPose])

  useEffect(() => {
    if (autoRef.current === autoLamp) return
    autoRef.current = autoLamp
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLampOn(autoLamp)
  }, [autoLamp])

  useEffect(() => {
    try {
      localStorage.setItem(OUTFIT_KEY, outfit ? 'on' : 'off')
    } catch {
      // ignore
    }
    outfitRef.current = outfit
  }, [outfit])

  const clearTogetherTimers = useCallback(() => {
    togetherTimersRef.current.forEach((t) => clearTimeout(t))
    togetherTimersRef.current = []
  }, [])

  useEffect(() => () => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
    if (unlockNoticeTimerRef.current) clearTimeout(unlockNoticeTimerRef.current)
    clearTogetherTimers()
  }, [clearTogetherTimers])

  const emit = useCallback((pet, type, extra = {}) => {
    eventIdRef.current += 1
    setEvent({ id: eventIdRef.current, pet, type, ...extra })
  }, [])

  const showBubble = useCallback((pet, text, origin, duration = 2800) => {
    if (!text) return
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    bubbleIdRef.current += 1
    const id = bubbleIdRef.current
    setBubble({ id, pet, text, origin })
    bubbleTimerRef.current = setTimeout(() => {
      setBubble((current) => (current?.id === id ? null : current))
    }, duration)
  }, [])

  const cancelTogether = useCallback(() => {
    clearTogetherTimers()
    setTogetherScene({ active: false, act: null, caption: '' })
  }, [clearTogetherTimers])

  const revertPibblino = useCallback(() => {
    if (!pibblinoRef.current) return
    pibblinoRef.current = false
    setPibblino(false)
    patRef.current = { count: 0, lastAt: 0 }
    setPatStreak(0)
    emit('pibble', 'revert')
  }, [emit])

  const triggerPibblino = useCallback((origin) => {
    cancelTogether()
    awakeRef.current = true
    setAwake(true)
    bellyRubRef.current = false
    setBellyRub(false)
    pibblinoRef.current = true
    setPibblino(true)
    patRef.current = { count: 0, lastAt: 0 }
    setPatStreak(5)
    unlockPose('pibble_pibblino')
    showBubble('pibble', PIBBLINO_TEXT, origin, 3800)
    emit('pibble', 'pibblino')
    if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
    pibblinoTimerRef.current = setTimeout(revertPibblino, PIBBLINO_DURATION_MS)
  }, [cancelTogether, emit, revertPibblino, showBubble, unlockPose])

  const toggleAwakePibble = useCallback((origin) => {
    cancelTogether()
    const next = !awakeRef.current
    awakeRef.current = next
    setAwake(next)
    if (!next) {
      bellyRubRef.current = false
      setBellyRub(false)
      if (pibblinoRef.current) {
        pibblinoRef.current = false
        setPibblino(false)
        if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
      }
      unlockPose('pibble_sleep')
      emit('pibble', 'sleep')
      showBubble('pibble', 'Zzz… a descansar un ratito.', origin, 2200)
    } else {
      emit('pibble', 'wake')
      showBubble('pibble', '¡Ya estoy despierto!', origin, 2200)
    }
  }, [cancelTogether, emit, showBubble, unlockPose])

  const rubPibbleBelly = useCallback((origin) => {
    cancelTogether()
    awakeRef.current = true
    setAwake(true)
    if (pibblinoRef.current) {
      pibblinoRef.current = false
      setPibblino(false)
      if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
    }
    bellyRubRef.current = true
    setBellyRub(true)
    unlockPose('pibble_belly')
    const line = BELLY_RUB_LINES[bellyCountRef.current % BELLY_RUB_LINES.length]
    bellyCountRef.current += 1
    emit('pibble', 'belly_rub')
    showBubble('pibble', line, origin, 3000)
  }, [cancelTogether, emit, showBubble, unlockPose])

  const toggleBellyRub = useCallback((origin) => {
    cancelTogether()
    if (!bellyRubRef.current) {
      awakeRef.current = true
      setAwake(true)
      if (pibblinoRef.current) {
        pibblinoRef.current = false
        setPibblino(false)
        if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
      }
      bellyRubRef.current = true
      setBellyRub(true)
      unlockPose('pibble_belly')
      emit('pibble', 'belly_ask')
      showBubble('pibble', BELLY_ASK_TEXT, origin, 3400)
      return
    }
    bellyRubRef.current = false
    setBellyRub(false)
    emit('pibble', 'wake')
    showBubble('pibble', '¡Listo, ya me siento!', origin, 2000)
  }, [cancelTogether, emit, showBubble, unlockPose])

  const patPibble = useCallback((origin) => {
    cancelTogether()
    if (!awakeRef.current) {
      awakeRef.current = true
      setAwake(true)
      unlockPose('pibble_happy')
      emit('pibble', 'wake')
      showBubble('pibble', '¡Hola, Sami!', origin, 2200)
      return
    }

    if (bellyRubRef.current) {
      rubPibbleBelly(origin)
      return
    }

    const now = Date.now()
    const count = nextPatCount(patRef.current.count, patRef.current.lastAt, now)
    patRef.current = { count, lastAt: now }
    setPatStreak(Math.min(5, count))
    unlockPose('pibble_happy')
    emit('pibble', 'pet')

    if (pibblinoRef.current) {
      showBubble('pibble', LOVE_TEXT, origin, 2600)
      return
    }
    if (count >= 5) {
      triggerPibblino(origin)
      return
    }
    showBubble('pibble', LOVE_TEXT, origin, 2600)
  }, [cancelTogether, emit, rubPibbleBelly, showBubble, triggerPibblino, unlockPose])

  const barkPibble = useCallback((origin) => {
    cancelTogether()
    if (!awakeRef.current) {
      awakeRef.current = true
      setAwake(true)
    }
    if (bellyRubRef.current) {
      bellyRubRef.current = false
      setBellyRub(false)
    }
    unlockPose('pibble_bark')
    emit('pibble', 'bark')
    showBubble('pibble', '¡Guau, guau!', origin, 1800)
  }, [cancelTogether, emit, showBubble, unlockPose])

  const patCapilampara = useCallback((origin) => {
    cancelTogether()
    unlockPose('capi_pet')
    emit('capilampara', 'pet')
    const line = CAPI_PAT_LINES[capiPatRef.current % CAPI_PAT_LINES.length]
    capiPatRef.current += 1
    showBubble('capilampara', line, origin, 2600)
  }, [cancelTogether, emit, showBubble, unlockPose])

  const toggleLamp = useCallback((origin) => {
    cancelTogether()
    const next = !lampOnRef.current
    lampOnRef.current = next
    setLampOn(next)
    if (next) unlockPose('capi_lamp')
    emit('capilampara', 'lamp', { on: next })
    showBubble('capilampara', next ? 'Mandarina encendida.' : 'Luz apagada.', origin, 2000)
  }, [cancelTogether, emit, showBubble, unlockPose])

  const toggleOutfit = useCallback((origin) => {
    cancelTogether()
    const next = !outfitRef.current
    outfitRef.current = next
    setOutfit(next)
    if (next) unlockPose('capi_study')
    emit('capilampara', 'outfit', { on: next })
    showBubble('capilampara', next ? 'Gafas y bufanda de estudio puestas.' : 'Atuendo guardado.', origin, 2400)
  }, [cancelTogether, emit, showBubble, unlockPose])

  // Interacción animada de 4 actos entre Pibble y Capilámpara (Storyboard Fase 4)
  const playTogether = useCallback((origin = 'companeros') => {
    clearTogetherTimers()
    awakeRef.current = true
    setAwake(true)
    bellyRubRef.current = false
    setBellyRub(false)
    if (pibblinoRef.current) {
      pibblinoRef.current = false
      setPibblino(false)
      if (pibblinoTimerRef.current) clearTimeout(pibblinoTimerRef.current)
    }

    unlockPose('pibble_belly')
    unlockPose('capi_lamp')
    unlockPose('capi_pet')
    unlockPose('shared_belly_moment')

    // Acto 1 (0.0s): Pibble se tumba boca arriba pidiendo pancita
    setTogetherScene({
      active: true,
      act: 'act1_ask',
      caption: '1/4 · Pibble se pone boca arriba pidiendo rasquitas en la pancita…',
    })
    showBubble('pibble', '¿Unas rasquitas en la pancita?', origin, 1700)

    // Acto 2 (1.8s): Capilámpara lo nota y enciende su mandarina cálida
    const t2 = setTimeout(() => {
      setTogetherScene({
        active: true,
        act: 'act2_notice',
        caption: '2/4 · Capilámpara le escucha y enciende su mandarina cálida…',
      })
      showBubble('capilampara', 'Ahí voy, Pibble.', origin, 1400)
    }, 1800)

    // Acto 3 (3.2s): Ambos interactúan (Pibble belly_rub feliz + Capilámpara mimos cálidos)
    const t3 = setTimeout(() => {
      setTogetherScene({
        active: true,
        act: 'act3_interact',
        caption: '3/4 · ¡Mimos compartidos! Pibble patalea feliz mientras Capilámpara le hace compañía.',
      })
      emit('pibble', 'belly_rub')
      emit('capilampara', 'pet')
      showBubble('pibble', '¡Qué gustito en la barbillita!', origin, 2200)
    }, 3200)

    // Acto 4 (5.6s): Pibble sonríe contento y vuelven suavemente a reposo
    const t4 = setTimeout(() => {
      setTogetherScene({
        active: true,
        act: 'act4_settle',
        caption: '4/4 · Los dos se quedan contentos y vuelven a descansar.',
      })
      showBubble('capilampara', 'A descansar un ratito.', origin, 1400)
    }, 5600)

    const tEnd = setTimeout(() => {
      setTogetherScene({ active: false, act: null, caption: '' })
    }, 7100)

    togetherTimersRef.current = [t2, t3, t4, tEnd]
  }, [clearTogetherTimers, emit, showBubble, unlockPose])

  const say = useCallback((pet, text, origin, duration = 2600) => {
    showBubble(pet, text, origin, duration)
  }, [showBubble])

  const pibble = useMemo(() => ({
    awake,
    bellyRub,
    pibblino,
    name: pibbleDisplayName(pibblino),
    status: togetherScene.active
      ? 'Jugando juntos'
      : !awake
        ? 'Dormido'
        : bellyRub
          ? 'Pidiendo pancita'
          : pibblino
            ? 'Modo Pibblino'
            : 'Despierto',
  }), [awake, bellyRub, pibblino, togetherScene.active])

  const capilampara = useMemo(() => ({
    lampOn,
    outfit,
    status: togetherScene.active
      ? 'Acompañando a Pibble'
      : outfit
        ? 'Modo estudio'
        : lampOn
          ? 'Luz encendida'
          : 'En calma',
  }), [lampOn, outfit, togetherScene.active])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    window.__SAMI_MASCOTS__ = {
      patPibble,
      barkPibble,
      toggleAwakePibble,
      toggleBellyRub,
      rubPibbleBelly,
      triggerPibblino,
      patCapilampara,
      toggleLamp,
      toggleOutfit,
      playTogether,
      say,
      getState: () => ({
        awake: awakeRef.current,
        bellyRub: bellyRubRef.current,
        pibblino: pibblinoRef.current,
        lampOn: lampOnRef.current,
        outfit: outfitRef.current,
        unlockedPoses: unlockedRef.current,
      }),
    }
    return () => {
      delete window.__SAMI_MASCOTS__
    }
  }, [patPibble, barkPibble, toggleAwakePibble, toggleBellyRub, rubPibbleBelly, triggerPibblino, patCapilampara, toggleLamp, toggleOutfit, playTogether, say])

  const value = useMemo(() => ({
    pibble,
    capilampara,
    bubble,
    event,
    unlockedPoses,
    patStreak,
    unlockNotice,
    togetherScene,
    unlockPose,
    patPibble,
    barkPibble,
    toggleAwakePibble,
    toggleBellyRub,
    rubPibbleBelly,
    triggerPibblino,
    patCapilampara,
    toggleLamp,
    toggleOutfit,
    playTogether,
    say,
    autoLamp,
  }), [
    pibble, capilampara, bubble, event, unlockedPoses, patStreak, unlockNotice, togetherScene,
    unlockPose, patPibble, barkPibble, toggleAwakePibble, toggleBellyRub, rubPibbleBelly,
    triggerPibblino, patCapilampara, toggleLamp, toggleOutfit, playTogether, say, autoLamp,
  ])

  return <MascotContext.Provider value={value}>{children}</MascotContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMascots() {
  const context = useContext(MascotContext)
  if (!context) throw new Error('useMascots debe usarse dentro de <MascotProvider>')
  return context
}
