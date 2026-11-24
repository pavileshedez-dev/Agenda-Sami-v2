import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { useMascots } from './MascotProvider'
import PibbleMascot from './PibbleMascot'
import CapilamparaMascot from './CapilamparaMascot'

// Tarjeta inline para Hoy/Dashboard. El hábitat flotante vive en MascotStage.
export default function MascotsCompanion({ inline = false }) {
  const navigate = useNavigate()
  const mascots = useMascots()
  const origin = useId()

  if (!inline) return null

  return (
    <section className="mascots-inline" aria-label="Tus asistentes Pibble y Capilámpara" data-testid="mascots-inline">
      <div className="mascots-inline__header">
        <div className="mascots-inline__title">
          <Bot size={17} aria-hidden="true" />
          <span>Tus asistentes personales</span>
        </div>
        <button type="button" className="mascots-inline__chat" onClick={() => navigate('/ia')}>
          Abrir chat con IA →
        </button>
      </div>

      <div className="mascots-inline__stage">
        <PibbleMascot
          size={96}
          origin={origin}
          onOpenChat={() => navigate('/ia?asistente=pibble')}
          showStatus
        />
        <span className="mascots-inline__divider" aria-hidden="true" />
        <CapilamparaMascot
          size={96}
          origin={origin}
          onOpenChat={() => navigate('/ia?asistente=capilampara')}
          showStatus
        />
      </div>

      <div className="mascots-inline__actions">
        <button
          type="button"
          className="mascot-action"
          onClick={() => mascots.barkPibble(origin)}
          disabled={!mascots.pibble.awake}
          data-testid="inline-pibble-bark"
        >
          Ladrar
        </button>
        <button
          type="button"
          className={`mascot-action ${mascots.capilampara.lampOn ? 'is-active' : ''}`}
          onClick={() => mascots.toggleLamp(origin)}
          aria-pressed={mascots.capilampara.lampOn}
          data-testid="inline-capilampara-lamp"
        >
          Luz
        </button>
        <button
          type="button"
          className={`mascot-action ${mascots.capilampara.outfit ? 'is-active' : ''}`}
          onClick={() => mascots.toggleOutfit(origin)}
          aria-pressed={mascots.capilampara.outfit}
          data-testid="inline-capilampara-outfit"
        >
          Atuendo
        </button>
      </div>
    </section>
  )
}
