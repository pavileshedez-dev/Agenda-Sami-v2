import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  hoy as apiHoy,
  tareas as apiTareas,
  eventos as apiEventos,
  asignaturas as apiAsignaturas,
} from '../lib/apiCalendario'
import { formatLongDate, formatShortDate, formatEventTime, formatAmbito } from '../lib/formatters'
import { getSubjectColorStyles, resolveSubjectHex } from '../lib/coloresAsignaturas'
import PageHeader from '../components/ui/PageHeader'
import AppDialog from '../components/ui/AppDialog'
import MascotFigure from '../components/mascots/MascotFigure'
import { Plus, RefreshCw, Check, AlertTriangle, PartyPopper, MessageCircle, GraduationCap, Briefcase } from 'lucide-react'

function plural(n, singular, pluralWord) {
  return `${n} ${n === 1 ? singular : pluralWord}`
}

export default function Hoy() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [asignaturasMap, setAsignaturasMap] = useState(() => new Map())
  const [coloresAsignatura, setColoresAsignatura] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  // Diálogo unificado de creación rápida
  const [modalAbierto, setModalAbierto] = useState(false)
  const [tabCrear, setTabCrear] = useState('tarea') // 'tarea' | 'evento'
  const [nuevaTarea, setNuevaTarea] = useState('')
  const [nuevoEvento, setNuevoEvento] = useState({ titulo: '', inicio: '' })
  const [errorForm, setErrorForm] = useState(null)

  const formId = useId()

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [dia, listaAsig] = await Promise.all([
        apiHoy(),
        apiAsignaturas.listar().catch(() => []),
      ])
      setDatos(dia)
      setAsignaturasMap(new Map(listaAsig.map((a) => [a.id, a.nombre])))
      setColoresAsignatura(Object.fromEntries(listaAsig.map((a) => [a.nombre, a.color])))
    } catch (e) {
      setError(e.message || 'No se pudo cargar el día.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const nombreAsignatura = useCallback(
    (raw) => {
      if (!raw) return ''
      return asignaturasMap.get(raw) || raw
    },
    [asignaturasMap]
  )

  async function completar(id) {
    setOcupado(true)
    try {
      await apiTareas.editar(id, { estado: 'completado' })
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo completar la tarea.')
    } finally {
      setOcupado(false)
    }
  }

  async function crearTarea(e) {
    e.preventDefault()
    if (!nuevaTarea.trim()) {
      setErrorForm('Introduce un título para la tarea.')
      return
    }
    setOcupado(true)
    setErrorForm(null)
    try {
      await apiTareas.crear({
        titulo: nuevaTarea.trim(),
        ambito: 'personal',
        estado: 'pendiente',
        fechaEntrega: datos ? datos.hoy : undefined,
      })
      setNuevaTarea('')
      setModalAbierto(false)
      await cargar()
    } catch (e2) {
      setErrorForm(e2.message || 'No se pudo crear la tarea.')
    } finally {
      setOcupado(false)
    }
  }

  async function crearEvento(e) {
    e.preventDefault()
    if (!nuevoEvento.titulo.trim() || !nuevoEvento.inicio) {
      setErrorForm('Indica título y fecha/hora de inicio.')
      return
    }
    setOcupado(true)
    setErrorForm(null)
    try {
      await apiEventos.crear({
        titulo: nuevoEvento.titulo.trim(),
        inicio: nuevoEvento.inicio,
      })
      setNuevoEvento({ titulo: '', inicio: '' })
      setModalAbierto(false)
      await cargar()
    } catch (e2) {
      setErrorForm(e2.message || 'No se pudo crear el evento.')
    } finally {
      setOcupado(false)
    }
  }

  // Línea temporal unificada y ordenada cronológicamente
  const agendaOrdenada = useMemo(() => {
    if (!datos) return []
    const items = []
    for (const c of datos.clasesHoy || []) {
      const hi = String(c.hora_inicio || '').slice(0, 5)
      const hf = String(c.hora_fin || '').slice(0, 5)
      const tituloClase = nombreAsignatura(c.asignatura_id || c.asignatura) || 'Clase'
      items.push({
        id: `cls-${c.id}`,
        sortKey: hi || '99:99',
        kind: 'clase',
        titulo: tituloClase,
        dotColor: getSubjectColorStyles(resolveSubjectHex(tituloClase, coloresAsignatura)).dot,
        meta: `${hi}–${hf}${c.aula ? ` · ${c.aula}` : ''}`,
      })
    }
    for (const ev of datos.eventosHoy || []) {
      const startStr = String(ev.inicio || '')
      const sortKey = startStr.includes('T') ? startStr.slice(11, 16) : '00:00'
      items.push({
        id: `ev-${ev.id}`,
        sortKey,
        kind: 'evento',
        titulo: ev.titulo,
        meta: formatEventTime(ev.inicio, ev.fin, ev.es_dia_completo),
      })
    }
    const plan = datos.plan || {}
    for (const b of (plan.bloquesSugeridos || []).filter((x) => x.fecha === datos.hoy)) {
      items.push({
        id: `blk-${b.tareaId}`,
        sortKey: b.desde || '99:99',
        kind: 'sugerido',
        titulo: b.titulo,
        meta: `${b.desde}–${b.hasta} · sugerido`,
      })
    }
    return items.toSorted((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [datos, nombreAsignatura, coloresAsignatura])

  if (cargando) {
    return (
      <div className="page-enter py-8 text-sm text-zinc-500" role="status">
        Cargando tu día…
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-enter surface-card p-6 space-y-3" role="alert">
        <p className="text-sm text-red-700">No se pudo cargar la vista de hoy: {error}</p>
        <button type="button" onClick={cargar} className="btn-secondary">
          Reintentar
        </button>
      </div>
    )
  }

  if (!datos) return null

  const plan = datos.plan || {}
  const sinDatos =
    plan.sinDatos &&
    datos.clasesHoy.length === 0 &&
    datos.eventosHoy.length === 0 &&
    datos.tareasPendientes.length === 0

  const resumenLinea = [
    plural(datos.clasesHoy.length, 'clase', 'clases'),
    plural(datos.eventosHoy.length, 'evento', 'eventos'),
    plural(datos.tareasPendientes.length, 'pendiente', 'pendientes'),
  ].join(' · ')

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title={formatLongDate(datos.hoy)}
        documentTitle="Hoy"
        subtitle={resumenLinea}
        actions={
          <>
            <button
              type="button"
              onClick={cargar}
              disabled={ocupado}
              className="btn-secondary"
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>Recalcular</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorForm(null)
                setModalAbierto(true)
              }}
              className="btn-primary"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Añadir</span>
            </button>
          </>
        }
      />

      {datos.festivosHoy.length > 0 && (
        <div role="status" className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-2.5 text-sm text-teal-900 flex items-center gap-2">
          <PartyPopper size={16} className="text-teal-700 shrink-0" aria-hidden="true" />
          <span>Festivo: {datos.festivosHoy.map((f) => f.nombre || f.fecha).join(', ')}</span>
        </div>
      )}

      {/* ── Presentación rápida de tus asistentes (Capilámpara y Pibble en pixel art) ── */}
      <section aria-label="Tus asistentes de hoy" className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="surface-card px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-amber-50/55 via-white to-white">
          <div className="flex items-center gap-3 min-w-0">
            <MascotFigure pet="capilampara" size={58} origin="hoy" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-900">Capilámpara</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  <GraduationCap size={11} aria-hidden="true" /> Universidad
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                Tu asistente para clases, entregas, exámenes y estudio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/companeros?tab=chat&asistente=capilampara')}
            className="btn-secondary text-xs shrink-0"
          >
            <MessageCircle size={13} aria-hidden="true" />
            <span>Chat</span>
          </button>
        </div>

        <div className="surface-card px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-stone-50/75 via-white to-white">
          <div className="flex items-center gap-3 min-w-0">
            <MascotFigure pet="pibble" size={58} origin="hoy" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-900">Pibble</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  <Briefcase size={11} aria-hidden="true" /> Trabajo
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                Tu asistente para turnos, jornadas, horas y descansos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/companeros?tab=chat&asistente=pibble')}
            className="btn-secondary text-xs shrink-0"
          >
            <MessageCircle size={13} aria-hidden="true" />
            <span>Chat</span>
          </button>
        </div>
      </section>

      {sinDatos && (
        <div className="surface-card p-6 text-sm text-zinc-500">
          No hay actividad registrada para hoy. Añade una tarea o un evento para comenzar.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        {/* ── Columna principal: acción del día ── */}
        <div className="space-y-5 min-w-0">
          {plan.prioridades && plan.prioridades.length > 0 && (
            <section className="surface-card p-5 space-y-3" aria-labelledby="hoy-prioridades">
              <h2 id="hoy-prioridades" className="text-sm font-semibold text-zinc-900">
                Qué hacer primero
              </h2>
              <ol className="divide-y divide-surface-100">
                {plan.prioridades.slice(0, 5).map((p) => {
                  const asigNombre = nombreAsignatura(p.asignatura)
                  return (
                    <li key={p.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{p.titulo}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                          {p.motivo}
                          {asigNombre ? ` · ${asigNombre}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => completar(p.id)}
                        disabled={ocupado}
                        className="btn-ghost text-xs text-primary-700 hover:bg-primary-50 px-2.5 py-1.5 shrink-0"
                        aria-label={`Completar ${p.titulo}`}
                      >
                        <Check size={14} aria-hidden="true" />
                        <span>Completar</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          <section className="surface-card p-5 space-y-3" aria-labelledby="hoy-timeline">
            <h2 id="hoy-timeline" className="text-sm font-semibold text-zinc-900">
              Tu día, en orden
            </h2>
            {agendaOrdenada.length === 0 ? (
              <p className="text-sm text-zinc-500">Sin clases ni eventos programados para hoy.</p>
            ) : (
              <ul className="divide-y divide-surface-100">
                {agendaOrdenada.map((item) => (
                  <li key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          item.dotColor
                            ? ''
                            : item.kind === 'clase'
                              ? 'bg-indigo-600'
                              : item.kind === 'evento'
                                ? 'bg-primary-500'
                                : 'bg-amber-500'
                        }`}
                        style={item.dotColor ? { backgroundColor: item.dotColor } : undefined}
                      />
                      <span className="text-zinc-900 font-medium truncate">{item.titulo}</span>
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                      {item.meta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(plan.sinHueco || []).length > 0 && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>Necesitan atención:</strong>{' '}
                {plan.sinHueco.map((x) => `${x.titulo} (${x.motivo})`).join(' · ')}
              </span>
            </div>
          )}

          {plan.supuestos && <p className="text-xs text-zinc-400 px-1">{plan.supuestos}</p>}
        </div>

        {/* ── Columna secundaria: tareas pendientes ── */}
        <section className="surface-card p-5 space-y-3 min-w-0" aria-labelledby="hoy-pendientes">
          <div className="flex items-center justify-between gap-2">
            <h2 id="hoy-pendientes" className="text-sm font-semibold text-zinc-900">
              Pendientes
            </h2>
            <span className="badge bg-surface-100 text-zinc-600 tabular-nums">
              {datos.tareasPendientes.length}
            </span>
          </div>
          {datos.tareasPendientes.length === 0 ? (
            <p className="text-sm text-zinc-500">No tienes tareas pendientes ahora mismo.</p>
          ) : (
            <ul className="divide-y divide-surface-100">
              {datos.tareasPendientes.slice(0, 12).map((t) => (
                <li key={t.id} className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-3 text-sm">
                  <div className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-zinc-800">{t.titulo}</span>
                    <span className="text-xs text-zinc-400">{formatAmbito(t.ambito)}</span>
                  </div>
                  <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                    {formatShortDate(t.fecha_entrega)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Diálogo nativo <dialog> para añadir tarea o evento rápido ── */}
      <AppDialog
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Añadir para hoy"
        maxWidth="28rem"
        footer={
          <>
            <button type="button" onClick={() => setModalAbierto(false)} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              form={tabCrear === 'tarea' ? `${formId}-tarea` : `${formId}-evento`}
              disabled={ocupado}
              className="btn-primary"
            >
              {ocupado ? 'Guardando…' : tabCrear === 'tarea' ? 'Crear tarea' : 'Crear evento'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-100 rounded-xl mb-4" role="tablist" aria-label="Tipo de registro">
          <button
            type="button"
            role="tab"
            aria-selected={tabCrear === 'tarea'}
            onClick={() => {
              setTabCrear('tarea')
              setErrorForm(null)
            }}
            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
              tabCrear === 'tarea' ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Tarea personal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tabCrear === 'evento'}
            onClick={() => {
              setTabCrear('evento')
              setErrorForm(null)
            }}
            className={`py-2 rounded-lg text-xs font-medium transition-colors ${
              tabCrear === 'evento' ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Evento con hora
          </button>
        </div>

        {errorForm && (
          <div role="alert" className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {errorForm}
          </div>
        )}

        {tabCrear === 'tarea' ? (
          <form id={`${formId}-tarea`} onSubmit={crearTarea} className="space-y-3">
            <div>
              <label htmlFor={`${formId}-tarea-input`} className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Título de la tarea
              </label>
              <input
                id={`${formId}-tarea-input`}
                type="text"
                required
                value={nuevaTarea}
                onChange={(e) => setNuevaTarea(e.target.value)}
                placeholder="Ej. Renovar abono transporte"
                className="input-field"
              />
            </div>
          </form>
        ) : (
          <form id={`${formId}-evento`} onSubmit={crearEvento} className="space-y-3">
            <div>
              <label htmlFor={`${formId}-ev-titulo`} className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Título del evento
              </label>
              <input
                id={`${formId}-ev-titulo`}
                type="text"
                required
                value={nuevoEvento.titulo}
                onChange={(e) => setNuevoEvento({ ...nuevoEvento, titulo: e.target.value })}
                placeholder="Ej. Tutoría en facultad"
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-ev-inicio`} className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Fecha y hora de inicio
              </label>
              <input
                id={`${formId}-ev-inicio`}
                type="datetime-local"
                required
                value={nuevoEvento.inicio}
                onChange={(e) => setNuevoEvento({ ...nuevoEvento, inicio: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
          </form>
        )}
      </AppDialog>
    </div>
  )
}
