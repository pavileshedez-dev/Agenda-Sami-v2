// Catálogo transparente de poses y momentos desbloqueables para Pibble y Capilámpara.
// Cada pose explica con total claridad cómo se activa/desbloquea mediante el uso natural o interacción.

export const UNLOCKS_STORAGE_KEY = 'agenda-sami-mascot-unlocks-v1'

export const POSE_CATALOG = [
  // ── PIBBLE ──
  {
    id: 'pibble_idle',
    pet: 'pibble',
    state: 'idle',
    title: 'Reposo atento',
    preview: '/mascots/pixel-v5/pibble/idle/f0.png',
    howToUnlock: 'Disponible desde el primer momento.',
    defaultUnlocked: true,
  },
  {
    id: 'pibble_happy',
    pet: 'pibble',
    state: 'happy',
    title: 'Contento',
    preview: '/mascots/pixel-v5/pibble/happy/f0.png',
    howToUnlock: 'Acaricia a Pibble en su rincón o en la barrita inferior.',
    defaultUnlocked: false,
  },
  {
    id: 'pibble_belly',
    pet: 'pibble',
    state: 'belly',
    title: 'Boca arriba (pancita)',
    preview: '/mascots/pixel-v5/pibble/belly/f0.png',
    howToUnlock: 'Pulsa «Pedir pancita» y ráscale la tripa y sus pelos de chivo.',
    defaultUnlocked: false,
  },
  {
    id: 'pibble_sleep',
    pet: 'pibble',
    state: 'sleep',
    title: 'Siesta tumbado',
    preview: '/mascots/pixel-v5/pibble/sleep/f0.png',
    howToUnlock: 'Pulsa «Dormir» para dejarle descansar sobre sus patitas.',
    defaultUnlocked: false,
  },
  {
    id: 'pibble_bark',
    pet: 'pibble',
    state: 'bark',
    title: 'Ladrido juguetón',
    preview: '/mascots/pixel-v5/pibble/bark/f1.png',
    howToUnlock: 'Pulsa «Ladrar» o revisa tus turnos en la sección Trabajo.',
    defaultUnlocked: false,
  },
  {
    id: 'pibble_pibblino',
    pet: 'pibble',
    state: 'pibblino',
    title: 'Modo Pibblino (AirPods)',
    preview: '/mascots/pixel-v5/pibble/pibblino/f0.png',
    howToUnlock: 'Dale 5 caricias seguidas a Pibble para que saque sus AirPods y se ponga en modo zen.',
    defaultUnlocked: false,
    requiresStreak: 5,
  },

  // ── CAPILÁMPARA ──
  {
    id: 'capi_idle',
    pet: 'capilampara',
    state: 'idle',
    title: 'En calma',
    preview: '/mascots/pixel-v5/capilampara/idle/f0.png',
    howToUnlock: 'Disponible desde el primer momento.',
    defaultUnlocked: true,
  },
  {
    id: 'capi_pet',
    pet: 'capilampara',
    state: 'pet',
    title: 'Ojos felices (mimos)',
    preview: '/mascots/pixel-v5/capilampara/pet/f0.png',
    howToUnlock: 'Acaricia a Capilámpara en su rincón o en la barrita inferior.',
    defaultUnlocked: false,
  },
  {
    id: 'capi_lamp',
    pet: 'capilampara',
    state: 'lamp',
    title: 'Mandarina encendida',
    preview: '/mascots/pixel-v5/capilampara/lamp/f0.png',
    howToUnlock: 'Pulsa «Encender luz» o abre Agenda Sami de madrugada (00:00–05:59).',
    defaultUnlocked: false,
  },
  {
    id: 'capi_study',
    pet: 'capilampara',
    state: 'study',
    title: 'Modo estudio',
    preview: '/mascots/pixel-v5/capilampara/study/f0.png',
    howToUnlock: 'Activa su atuendo de estudio o entra a revisar tus asignaturas en Universidad.',
    defaultUnlocked: false,
  },

  // ── MOMENTO COMPARTIDO ──
  {
    id: 'shared_belly_moment',
    pet: 'both',
    state: 'together',
    title: 'Mimos compartidos',
    preview: '/mascots/pixel-v5/pibble/belly_rub/f1.png',
    howToUnlock: 'Pulsa «Momento juntos» en su rincón para que Pibble pida pancita y Capilámpara venga a darle luz y compañía.',
    defaultUnlocked: false,
  },
]

const DEFAULT_UNLOCKED_IDS = POSE_CATALOG.filter((p) => p.defaultUnlocked).map((p) => p.id)

export function readUnlockedPoses() {
  try {
    const raw = localStorage.getItem(UNLOCKS_STORAGE_KEY)
    if (!raw) return [...DEFAULT_UNLOCKED_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_UNLOCKED_IDS]
    return Array.from(new Set([...DEFAULT_UNLOCKED_IDS, ...parsed]))
  } catch {
    return [...DEFAULT_UNLOCKED_IDS]
  }
}

export function saveUnlockedPoses(ids) {
  try {
    localStorage.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // ignore storage quota errors
  }
}
