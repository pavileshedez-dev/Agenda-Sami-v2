import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EyeOff, MessageCircle, Sparkles } from 'lucide-react'
import MascotFigure from './MascotFigure'
import MascotAvatar from './MascotAvatar'
import { useMascots } from './MascotProvider'

const HIDDEN_KEY = 'agenda-sami-mascotas-ocultas'

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export default function MascotStage() {
  const { playTogether, togetherScene } = useMascots()
  const navigate = useNavigate()
  const location = useLocation()
  const [hidden, setHidden] = useState(readHidden)

  // En su propia página /companeros ya tienen el rincón completo en grande
  if (location.pathname.startsWith('/companeros')) return null

  function toggleHidden(next) {
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => toggleHidden(false)}
        className="mascot-dock__reopen"
        aria-label="Mostrar barra de mascotas Pibble y Capilámpara"
        data-testid="mascot-dock-reopen"
      >
        <MascotAvatar pet="pibble" size={24} />
        <span>Mascotas</span>
      </button>
    )
  }

  return (
    <aside
      aria-label="Barra interactiva de Pibble y Capilámpara"
      className="mascot-dock"
      data-testid="mascot-dock"
    >
      <div className="mascot-dock__actor">
        <MascotFigure pet="pibble" size={76} origin="dock" />
      </div>

      <div className="mascot-dock__actor">
        <MascotFigure pet="capilampara" size={76} origin="dock" />
      </div>

      <div className="flex flex-col gap-1 pl-1 border-l border-surface-200 self-center">
        <button
          type="button"
          onClick={() => playTogether('dock')}
          disabled={togetherScene.active}
          title="Ver momento juntos (Pibble y Capilámpara)"
          aria-label="Ver momento juntos entre Pibble y Capilámpara"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
        >
          <Sparkles size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/companeros')}
          title="Ir al rincón y chat de Compañeros e IA"
          aria-label="Ir al rincón y chat de Compañeros e IA"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 hover:bg-surface-100 hover:text-zinc-900 transition-colors"
        >
          <MessageCircle size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => toggleHidden(true)}
          title="Ocultar barra de mascotas"
          aria-label="Ocultar barra de mascotas"
          data-testid="mascot-dock-hide"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:bg-surface-100 hover:text-zinc-800 transition-colors"
        >
          <EyeOff size={14} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
