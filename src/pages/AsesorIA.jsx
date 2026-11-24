import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Send,
  Trash2,
  Loader2,
  Sparkles,
  AlertCircle,
  Settings,
  Check,
  X,
  Calendar,
  Briefcase,
  GraduationCap,
} from 'lucide-react'
import { apiIA } from '../lib/apiAgendaSami'
import { useAuth } from '../context/AuthContext'
import { sinEmojis } from '../lib/texto'
import MascotAvatar from '../components/mascots/MascotAvatar'
import PageHeader from '../components/ui/PageHeader'
import { ConfirmDialog } from '../components/ui/AppDialog'

export default function AsesorIA({ embedded = false, initialAssistant = null } = {}) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const urlAssistant = initialAssistant || searchParams.get('asistente')

  const [currentAssistant, setCurrentAssistant] = useState(urlAssistant === 'capilampara' ? 'capilampara' : 'pibble')
  useEffect(() => {
    if (initialAssistant === 'pibble' || initialAssistant === 'capilampara') {
      setCurrentAssistant(initialAssistant)
    }
  }, [initialAssistant])
  const chatStorageKey = `agenda-chat-${user?.id || 'u'}-${currentAssistant}`
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmStatus, setConfirmStatus] = useState({}) // { [propId]: 'confirmada' | 'rechazada' | 'loading' }

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Cargar historial de chat según usuario y asistente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(chatStorageKey)
      if (saved) {
        setMessages(JSON.parse(saved))
      } else {
        // Mensaje de bienvenida inicial
        const initialMsg = currentAssistant === 'pibble'
          ? {
              id: 'init-pibble',
              role: 'assistant',
              content: '¡Hola Sami! Soy Pibble, tu asistente de trabajo, turnos y productividad. Dime si necesitas registrar un turno en Guadalajara, revisar tus horas o fichar.',
              timestamp: new Date().toISOString(),
            }
          : {
              id: 'init-capilampara',
              role: 'assistant',
              content: 'Hola Sami. Soy Capilámpara, tu compañero de estudio para el Grado en Logopedia en la UCM. ¿En qué entrega, examen o asignatura te puedo orientar hoy?',
              timestamp: new Date().toISOString(),
            }
        setMessages([initialMsg])
      }
    } catch {
      setMessages([])
    }
  }, [currentAssistant, chatStorageKey])

  // Guardar historial
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(chatStorageKey, JSON.stringify(messages))
      } catch {
        // ignore
      }
    }
  }, [messages, chatStorageKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const cambiarAsistente = (asistente) => {
    setCurrentAssistant(asistente)
    setError(null)
  }

  const [confirmLimpiar, setConfirmLimpiar] = useState(false)

  const limpiarHistorial = () => {
    setConfirmLimpiar(true)
  }

  const confirmarLimpiarHistorial = () => {
    setMessages([])
    localStorage.removeItem(chatStorageKey)
    setConfirmLimpiar(false)
  }

  const enviarMensaje = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setError(null)
    setIsLoading(true)

    try {
      const res = await apiIA.enviarMensaje({
        assistant: currentAssistant,
        message: text,
        history: updated.map(m => ({ role: m.role, content: m.content })),
      })

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.reply || 'Respuesta recibida.',
        proposal: res.proposal,
        configured: res.configured,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      setError(err.message || 'No se pudo contactar con el asistente.')
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const confirmarPropuesta = async (proposalId) => {
    setConfirmStatus(prev => ({ ...prev, [proposalId]: 'loading' }))
    try {
      await apiIA.confirmarPropuesta(proposalId)
      setConfirmStatus(prev => ({ ...prev, [proposalId]: 'confirmada' }))
    } catch (err) {
      setError('Error al confirmar: ' + err.message)
      setConfirmStatus(prev => ({ ...prev, [proposalId]: 'error' }))
    }
  }

  const rechazarPropuesta = async (proposalId) => {
    setConfirmStatus(prev => ({ ...prev, [proposalId]: 'loading' }))
    try {
      await apiIA.rechazarPropuesta(proposalId)
      setConfirmStatus(prev => ({ ...prev, [proposalId]: 'rechazada' }))
    } catch (err) {
      setError('Error al cancelar: ' + err.message)
    }
  }

  return (
    <div className="page-enter max-w-4xl mx-auto space-y-5">
      {!embedded ? (
        <PageHeader
          title="Asesor IA"
          subtitle="Pibble y Capilámpara con confirmación explícita antes de modificar tu agenda."
          actions={
            <>
              <button type="button" onClick={() => navigate('/ajustes')} className="btn-secondary text-xs">
                <Settings size={14} aria-hidden="true" /> Ajustes
              </button>
              <button
                type="button"
                onClick={limpiarHistorial}
                className="btn-ghost text-xs text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} aria-hidden="true" /> Limpiar chat
              </button>
            </>
          }
        />
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-zinc-500">
            Pibble y Capilámpara con confirmación explícita antes de modificar tu agenda.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/ajustes')} className="btn-secondary text-xs">
              <Settings size={14} aria-hidden="true" /> Ajustes IA
            </button>
            <button
              type="button"
              onClick={limpiarHistorial}
              className="btn-ghost text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} aria-hidden="true" /> Limpiar chat
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLimpiar}
        onCancel={() => setConfirmLimpiar(false)}
        onConfirm={confirmarLimpiarHistorial}
        title="Vaciar conversación"
        message="Se borrará el historial local de este chat."
        confirmLabel="Vaciar"
        destructive
      />

      {/* ── Tabs Pibble / Capilámpara ── */}
      <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-100 rounded-2xl">
        <button
          onClick={() => cambiarAsistente('pibble')}
          className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
            currentAssistant === 'pibble'
              ? 'bg-white text-stone-800 shadow-sm border border-surface-200'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center">
            <MascotAvatar pet="pibble" size={32} />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold leading-tight">Pibble</div>
            <div className="text-[10px] text-stone-400 font-normal">Trabajo & Horarios</div>
          </div>
        </button>

        <button
          onClick={() => cambiarAsistente('capilampara')}
          className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 ${
            currentAssistant === 'capilampara'
              ? 'bg-white text-amber-900 shadow-sm border border-amber-200'
              : 'text-amber-700/60 hover:text-amber-800'
          }`}
        >
          <div className="w-8 h-8 flex items-center justify-center">
            <MascotAvatar pet="capilampara" size={32} />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold leading-tight">Capilámpara</div>
            <div className="text-[10px] text-amber-600/70 font-normal">UCM Logopedia</div>
          </div>
        </button>
      </div>

      {/* ── Área de Conversación ── */}
      <div className="surface-card flex flex-col h-[min(62dvh,560px)] min-h-[380px] p-4 sm:p-5 overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((m) => {
            const isUser = m.role === 'user'
            const prop = m.proposal
            const propStatus = prop ? (confirmStatus[prop.id] || 'pendiente') : null

            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-10 h-10 shrink-0 pt-0.5">
                    <MascotAvatar pet={currentAssistant} size={40} />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[75%] space-y-3`}>
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : 'bg-white border border-surface-200 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{sinEmojis(m.content)}</p>

                    {/* Aviso si la IA no está configurada */}
                    {m.configured === false && (
                      <div className="mt-3 pt-3 border-t border-surface-200 flex items-center justify-between text-xs text-amber-700 bg-amber-50 -mx-2 -mb-2 p-2.5 rounded-xl">
                        <span className="flex items-center gap-1.5 font-medium">
                          <AlertCircle size={14} className="shrink-0" />
                          IA pendiente de configuración
                        </span>
                        <button
                          onClick={() => navigate('/ajustes')}
                          className="font-bold underline hover:text-amber-900"
                        >
                          Añadir clave →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── TARJETA DE PROPUESTA DE ACCIÓN (Consentimiento Explícito) ── */}
                  {prop && (
                    <div className="p-4 rounded-2xl bg-surface-50 border-2 border-primary-200 shadow-md space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary-100 text-primary-700 flex items-center gap-1">
                          {prop.tipo === 'crear_turno' && <Briefcase size={12} />}
                          {prop.tipo === 'crear_tarea' && <GraduationCap size={12} />}
                          {prop.tipo === 'crear_evento' && <Calendar size={12} />}
                          Propuesta de acción
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">Requiere tu consentimiento</span>
                      </div>

                      <p className="text-sm font-semibold text-gray-900">
                        {sinEmojis(prop.resumen)}
                      </p>

                      {/* Detalles técnicos del payload */}
                      {prop.payload && (
                        <div className="text-xs text-gray-600 bg-white p-2.5 rounded-xl border border-surface-200 space-y-1">
                          {prop.payload.fecha && <div><strong>Fecha:</strong> {prop.payload.fecha}</div>}
                          {prop.payload.hora_inicio && (
                            <div><strong>Horario:</strong> {prop.payload.hora_inicio} — {prop.payload.hora_fin}</div>
                          )}
                          {prop.payload.asignatura && <div><strong>Asignatura:</strong> {prop.payload.asignatura}</div>}
                          {prop.payload.fecha_entrega && <div><strong>Entrega:</strong> {prop.payload.fecha_entrega}</div>}
                          {prop.payload.prioridad && <div><strong>Prioridad:</strong> {prop.payload.prioridad}</div>}
                        </div>
                      )}

                      {/* Botones de Confirmación / Cancelación */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {propStatus === 'pendiente' && (
                          <>
                            <button
                              onClick={() => rechazarPropuesta(prop.id)}
                              className="btn-ghost border border-surface-200 text-xs px-3 py-1.5 text-gray-600 hover:bg-surface-200 flex items-center gap-1"
                            >
                              <X size={14} /> Cancelar
                            </button>
                            <button
                              onClick={() => confirmarPropuesta(prop.id)}
                              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm"
                            >
                              <Check size={14} /> Confirmar Acción
                            </button>
                          </>
                        )}
                        {propStatus === 'confirmada' && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-xl flex items-center gap-1.5">
                            <Check size={14} /> Acción confirmada y guardada
                          </span>
                        )}
                        {propStatus === 'rechazada' && (
                          <span className="text-xs font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-xl">
                            Propuesta descartada
                          </span>
                        )}
                        {propStatus === 'loading' && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Loader2 size={14} className="animate-spin" /> Guardando en agenda…
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-gray-400 p-2">
              <Loader2 size={16} className="animate-spin text-primary-500" />
              <span>{currentAssistant === 'pibble' ? 'Pibble' : 'Capilámpara'} está pensando…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="p-3 my-2 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Input bar ── */}
        <form onSubmit={enviarMensaje} className="pt-3 border-t border-surface-100 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              currentAssistant === 'pibble'
                ? 'Escribe a Pibble (ej. "Anota un turno de 9:00 a 17:00 mañana")...'
                : 'Escribe a Capilámpara (ej. "Añade entrega de Neurociencia el viernes")...'
            }
            className="input-field flex-1 text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-primary p-2.5 rounded-xl flex items-center justify-center shrink-0"
            title="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  )
}
