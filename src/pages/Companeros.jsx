import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Heart,
  Volume2,
  Moon,
  Sun,
  Headphones,
  Lightbulb,
  BookOpen,
  MessageCircle,
  Sparkles,
  Check,
  Lock,
  Play,
  Briefcase,
  GraduationCap,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import MascotFigure from '../components/mascots/MascotFigure'
import { useMascots } from '../components/mascots/MascotProvider'
import { POSE_CATALOG } from '../components/mascots/mascotUnlocks'
import AsesorIA from './AsesorIA'

export default function Companeros() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab')
  const urlAssistant = searchParams.get('asistente')

  const [activeTab, setActiveTab] = useState(urlTab === 'chat' ? 'chat' : urlTab === 'poses' ? 'poses' : 'rincon')
  const [chatPet, setChatPet] = useState(urlAssistant === 'capilampara' ? 'capilampara' : 'pibble')

  useEffect(() => {
    if (urlTab === 'chat' || urlTab === 'poses' || urlTab === 'rincon') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(urlTab)
    }
    if (urlAssistant === 'pibble' || urlAssistant === 'capilampara') {
      setChatPet(urlAssistant)
    }
  }, [urlTab, urlAssistant])

  const {
    pibble,
    capilampara,
    unlockedPoses,
    patStreak,
    unlockNotice,
    togetherScene,
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
  } = useMascots()

  const lampActive = capilampara.lampOn || capilampara.outfit || togetherScene.act === 'act2_notice' || togetherScene.act === 'act3_interact'
  const totalPoses = POSE_CATALOG.length
  const unlockedCount = unlockedPoses.length

  function openChatWith(pet) {
    setChatPet(pet)
    setActiveTab('chat')
    setSearchParams({ tab: 'chat', asistente: pet }, { replace: true })
  }

  function switchTab(next) {
    setActiveTab(next)
    if (next === 'chat') setSearchParams({ tab: 'chat', asistente: chatPet }, { replace: true })
    else if (next === 'poses') setSearchParams({ tab: 'poses' }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

  function replayUnlockedPose(item) {
    switchTab('rincon')
    if (item.id === 'shared_belly_moment') {
      playTogether('companeros')
      return
    }
    if (item.pet === 'pibble') {
      if (item.state === 'sleep') {
        if (pibble.awake) toggleAwakePibble('companeros')
      } else if (item.state === 'belly') {
        if (!pibble.bellyRub) toggleBellyRub('companeros')
        else rubPibbleBelly('companeros')
      } else if (item.state === 'happy') {
        patPibble('companeros')
      } else if (item.state === 'bark') {
        barkPibble('companeros')
      } else if (item.state === 'pibblino') {
        triggerPibblino('companeros')
      } else {
        if (!pibble.awake) toggleAwakePibble('companeros')
        else if (pibble.bellyRub) toggleBellyRub('companeros')
      }
    } else if (item.pet === 'capilampara') {
      if (item.state === 'pet') patCapilampara('companeros')
      else if (item.state === 'lamp') {
        if (!capilampara.lampOn) toggleLamp('companeros')
      } else if (item.state === 'study') {
        if (!capilampara.outfit) toggleOutfit('companeros')
      } else {
        if (capilampara.outfit) toggleOutfit('companeros')
        if (capilampara.lampOn) toggleLamp('companeros')
      }
    }
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Compañeros e IA"
        subtitle="Pasa un rato con Pibble y Capilámpara en pixel art animado, rasca sus poses desbloqueables o entra al chat de cada asistente."
      />

      {/* Aviso discreto al descubrir una pose nueva */}
      {unlockNotice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 flex items-center gap-2"
        >
          <Sparkles size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{unlockNotice}</span>
        </div>
      )}

      {/* Pestañas unificadas: Su rincón · Chat IA · Álbum de poses */}
      <div
        role="tablist"
        aria-label="Vistas de Compañeros e IA"
        className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl bg-surface-100 border border-surface-200"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'rincon'}
          onClick={() => switchTab('rincon')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'rincon'
              ? 'bg-white text-zinc-900 shadow-sm border border-surface-200'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Heart size={14} aria-hidden="true" />
          <span>Su rincón</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chat'}
          onClick={() => switchTab('chat')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'chat'
              ? 'bg-white text-zinc-900 shadow-sm border border-surface-200'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <MessageCircle size={14} aria-hidden="true" />
          <span>Chat con {chatPet === 'capilampara' ? 'Capilámpara' : 'Pibble'}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'poses'}
          onClick={() => switchTab('poses')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            activeTab === 'poses'
              ? 'bg-white text-zinc-900 shadow-sm border border-surface-200'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Álbum de poses ({unlockedCount}/{totalPoses})</span>
        </button>
      </div>

      {/* ══════════════════════ PESTAÑA 1: SU RINCÓN VIVO ══════════════════════ */}
      {activeTab === 'rincon' && (
        <div className="space-y-6">
          {/* Escenario compartido con interacción entre Pibble y Capilámpara */}
          <section
            aria-labelledby="rincon-compartido"
            className="surface-card p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 id="rincon-compartido" className="text-base font-semibold text-zinc-900">
                  Rincón compartido
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Toca directamente a Pibble o a Capilámpara para acariciarlos, o disfruta de su momento juntos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => playTogether('companeros')}
                disabled={togetherScene.active}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>{togetherScene.active ? 'Interactuando…' : 'Momento juntos'}</span>
              </button>
            </div>

            <div className={`mascot-habitat ${lampActive ? 'mascot-habitat--warm' : ''} px-4 pt-14 pb-6`}>
              <div className="flex items-end justify-center gap-6 sm:gap-14 flex-wrap">
                <div className="flex flex-col items-center">
                  <MascotFigure pet="pibble" size={192} origin="companeros" />
                  <span className="mt-1.5 text-xs font-semibold text-zinc-700">{pibble.name}</span>
                  <span className="text-[11px] text-zinc-500">{pibble.status}</span>
                </div>

                <div className="flex flex-col items-center">
                  <MascotFigure pet="capilampara" size={192} origin="companeros" />
                  <span className="mt-1.5 text-xs font-semibold text-zinc-700">Capilámpara</span>
                  <span className="text-[11px] text-zinc-500">{capilampara.status}</span>
                </div>
              </div>

              {togetherScene.active && togetherScene.caption && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-4 text-center text-xs font-medium text-amber-900 bg-white/85 border border-amber-200/80 rounded-xl px-3.5 py-2 max-w-lg mx-auto"
                >
                  {togetherScene.caption}
                </p>
              )}
            </div>
          </section>

          {/* Dos tarjetas interactivas + acceso directo al chat de cada asistente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* ── Tarjeta de Pibble ── */}
            <section
              aria-labelledby="companero-pibble"
              className="surface-card overflow-hidden flex flex-col justify-between"
            >
              <div className="px-5 pt-5 pb-3.5 flex items-start justify-between gap-3 border-b border-surface-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id="companero-pibble" className="text-base font-semibold text-zinc-900">
                      {pibble.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <Briefcase size={11} aria-hidden="true" /> Asistente de trabajo
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Te ayuda con turnos, jornadas, horas y descansos. Le encantan las rasquitas en la pancita y sus pelos de chivo.
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 space-y-3 bg-white">
                <div className="flex flex-wrap gap-2">
                  {pibble.bellyRub ? (
                    <>
                      <button
                        type="button"
                        onClick={() => rubPibbleBelly('companeros')}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                      >
                        <Heart size={14} aria-hidden="true" />
                        <span>Rascar pancita y barbillita</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBellyRub('companeros')}
                        className="btn-secondary text-xs"
                      >
                        <span>Sentarse</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleBellyRub('companeros')}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200/70 transition-colors"
                    >
                      <Heart size={14} aria-hidden="true" />
                      <span>Pedir pancita</span>
                    </button>
                  )}

                  <button type="button" onClick={() => patPibble('companeros')} className="btn-secondary text-xs">
                    <Sparkles size={14} aria-hidden="true" />
                    <span>Acariciar</span>
                  </button>

                  <button type="button" onClick={() => barkPibble('companeros')} className="btn-secondary text-xs">
                    <Volume2 size={14} aria-hidden="true" />
                    <span>Ladrar</span>
                  </button>

                  <button type="button" onClick={() => toggleAwakePibble('companeros')} className="btn-secondary text-xs">
                    {pibble.awake ? (
                      <>
                        <Moon size={14} aria-hidden="true" />
                        <span>Dormir</span>
                      </>
                    ) : (
                      <>
                        <Sun size={14} aria-hidden="true" />
                        <span>Despertar</span>
                      </>
                    )}
                  </button>

                  {unlockedPoses.includes('pibble_pibblino') ? (
                    <button
                      type="button"
                      onClick={() => triggerPibblino('companeros')}
                      aria-pressed={pibble.pibblino}
                      className={`btn-secondary text-xs ${
                        pibble.pibblino ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : ''
                      }`}
                    >
                      <Headphones size={14} aria-hidden="true" />
                      <span>Modo Pibblino</span>
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs bg-surface-50 text-zinc-500 border border-dashed border-surface-300"
                      title="Dale 5 caricias seguidas a Pibble para desbloquear el Modo Pibblino"
                    >
                      <Headphones size={13} aria-hidden="true" />
                      <span>Pibblino: {patStreak}/5 caricias seguidas</span>
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-surface-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500">Estado: {pibble.status}</span>
                  <button
                    type="button"
                    onClick={() => openChatWith('pibble')}
                    className="btn-primary text-xs"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>Abrir chat con Pibble</span>
                  </button>
                </div>
              </div>
            </section>

            {/* ── Tarjeta de Capilámpara ── */}
            <section
              aria-labelledby="companero-capilampara"
              className={`surface-card overflow-hidden flex flex-col justify-between transition-colors ${
                lampActive ? 'border-amber-200/90' : ''
              }`}
            >
              <div className="px-5 pt-5 pb-3.5 flex items-start justify-between gap-3 border-b border-surface-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id="companero-capilampara" className="text-base font-semibold text-zinc-900">
                      Capilámpara
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                      <GraduationCap size={11} aria-hidden="true" /> Asistente universitario
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Te acompaña con Logopedia (UCM), entregas, exámenes y tardes de estudio con la luz cálida de su mandarina.
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 space-y-3 bg-white">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => patCapilampara('companeros')} className="btn-secondary text-xs">
                    <Heart size={14} aria-hidden="true" />
                    <span>Acariciar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleLamp('companeros')}
                    aria-pressed={capilampara.lampOn}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors ${
                      capilampara.lampOn
                        ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <Lightbulb size={14} aria-hidden="true" />
                    <span>{capilampara.lampOn ? 'Apagar mandarina' : 'Encender mandarina'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleOutfit('companeros')}
                    aria-pressed={capilampara.outfit}
                    className={`btn-secondary text-xs ${
                      capilampara.outfit ? 'border-amber-300 bg-amber-50 text-amber-900' : ''
                    }`}
                  >
                    <BookOpen size={14} aria-hidden="true" />
                    <span>{capilampara.outfit ? 'Quitar modo estudio' : 'Modo estudio'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-surface-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500">Estado: {capilampara.status}</span>
                  <button
                    type="button"
                    onClick={() => openChatWith('capilampara')}
                    className="btn-primary text-xs"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>Abrir chat con Capilámpara</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ══════════════════════ PESTAÑA 2: CHAT INTEGRADO ══════════════════════ */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          <AsesorIA embedded initialAssistant={chatPet} />
        </div>
      )}

      {/* ══════════════════════ PESTAÑA 3: ÁLBUM DE POSES DESBLOQUEABLES ══════════════════════ */}
      {activeTab === 'poses' && (
        <section aria-labelledby="album-poses" className="space-y-4">
          <div className="surface-card p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 id="album-poses" className="text-base font-semibold text-zinc-900">
                Álbum de poses y momentos ({unlockedCount} de {totalPoses} desbloqueadas)
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Todas las poses indican claramente cómo se descubren con el uso diario o interactuando con ellos. Una vez desbloqueadas, puedes activarlas cuando quieras.
              </p>
            </div>
            <div className="w-44 h-2.5 rounded-full bg-surface-100 overflow-hidden border border-surface-200">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.round((unlockedCount / totalPoses) * 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {POSE_CATALOG.map((item) => {
              const unlocked = unlockedPoses.includes(item.id)
              return (
                <article
                  key={item.id}
                  className={`surface-card p-4 flex flex-col justify-between gap-3 ${
                    unlocked ? 'border-emerald-200/80' : 'border-surface-200 bg-surface-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-16 h-16 rounded-xl border flex items-center justify-center shrink-0 ${
                        unlocked ? 'bg-[#f7f7f5] border-surface-200' : 'bg-surface-100 border-surface-200'
                      }`}
                    >
                      <img
                        src={item.preview}
                        alt={item.title}
                        width={56}
                        height={56}
                        draggable={false}
                        className={`w-14 h-14 object-contain mascot-pixel ${
                          unlocked ? '' : 'opacity-35 grayscale'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            unlocked
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-surface-100 text-zinc-600 border border-surface-200'
                          }`}
                        >
                          {unlocked ? <Check size={10} aria-hidden="true" /> : <Lock size={10} aria-hidden="true" />}
                          {unlocked ? 'Desbloqueada' : 'Por descubrir'}
                        </span>
                        <span className="text-[10px] font-medium text-zinc-400 uppercase">
                          {item.pet === 'both' ? 'Ambos' : item.pet === 'capilampara' ? 'Capilámpara' : 'Pibble'}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-900 mt-1">{item.title}</h3>
                      <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{item.howToUnlock}</p>
                      {!unlocked && item.requiresStreak && (
                        <p className="text-[11px] font-semibold text-indigo-600 mt-1">
                          Progreso actual: {patStreak}/{item.requiresStreak} caricias seguidas
                        </p>
                      )}
                    </div>
                  </div>

                  {unlocked && (
                    <button
                      type="button"
                      onClick={() => replayUnlockedPose(item)}
                      className="btn-secondary text-xs w-full justify-center"
                    >
                      <Play size={12} aria-hidden="true" />
                      <span>Ver en su rincón</span>
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
