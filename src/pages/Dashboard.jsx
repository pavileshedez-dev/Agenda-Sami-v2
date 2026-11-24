import { createElement, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tareas as apiTareas, plan as apiPlan } from '../lib/apiCalendario'
import { formatLongDate, formatShortDate } from '../lib/formatters'
import PageHeader from '../components/ui/PageHeader'
import {
  GraduationCap,
  Bot,
  Clock,
  CalendarDays,
  CheckSquare,
  ArrowRight,
  Briefcase,
  CalendarRange,
} from 'lucide-react'

const modules = [
  {
    to: '/calendario',
    icon: CalendarDays,
    title: 'Calendario',
    description: 'Vista mensual de clases, tareas, planes y vacaciones.',
    bgLight: 'bg-indigo-50',
    textColor: 'text-indigo-700',
  },
  {
    to: '/universidad',
    icon: GraduationCap,
    title: 'Universidad',
    description: 'Tareas, entregas y apuntes del Grado en Logopedia.',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-700',
  },
  {
    to: '/horario',
    icon: Clock,
    title: 'Horario de clases',
    description: 'Consulta y actualiza tu horario semanal.',
    bgLight: 'bg-sky-50',
    textColor: 'text-sky-700',
  },
  {
    to: '/trabajo',
    icon: Briefcase,
    title: 'Trabajo y turnos',
    description: 'Turnos planificados, jornadas registradas y horas extra.',
    bgLight: 'bg-emerald-50',
    textColor: 'text-emerald-700',
  },
  {
    to: '/agenda',
    icon: CheckSquare,
    title: 'Agenda y festivos',
    description: 'Notas rápidas, exámenes y calendario de festivos.',
    bgLight: 'bg-rose-50',
    textColor: 'text-rose-700',
  },
  {
    to: '/semana',
    icon: CalendarRange,
    title: 'Mi Semana',
    description: 'Balance semanal de estudio, trabajo y descanso.',
    bgLight: 'bg-teal-50',
    textColor: 'text-teal-700',
  },
  {
    to: '/ia',
    icon: Bot,
    title: 'Asesor IA',
    description: 'Consulta con Pibble y Capilámpara con confirmación previa.',
    bgLight: 'bg-violet-50',
    textColor: 'text-violet-700',
  },
]

export default function Dashboard() {
  const [summary, setSummary] = useState({
    taskCounts: { total: 0, pendiente: 0, 'en-curso': 0, completado: 0 },
  })
  const [planAcademico, setPlanAcademico] = useState(null)
  const [planError, setPlanError] = useState(null)
  const [planCargando, setPlanCargando] = useState(true)
  const [errorApi, setErrorApi] = useState(null)

  const cargarPlan = useCallback(async () => {
    setPlanCargando(true)
    setPlanError(null)
    try {
      const r = await apiPlan()
      setPlanAcademico(r)
    } catch (e) {
      setPlanError(e.message || 'No se pudo calcular la planificación.')
    } finally {
      setPlanCargando(false)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    cargarPlan()

    apiTareas
      .listar()
      .then((lista) => {
        if (!vivo) return
        const conteo = { total: lista.length, pendiente: 0, 'en-curso': 0, completado: 0 }
        for (const tarea of lista) {
          const estado = tarea.estado === 'en-curso' ? 'en-curso' : tarea.estado || 'pendiente'
          if (Object.prototype.hasOwnProperty.call(conteo, estado)) conteo[estado] += 1
        }
        setSummary({ taskCounts: conteo })
        setErrorApi(null)
      })
      .catch((e) => {
        if (vivo) setErrorApi(e.message || 'No se pudieron cargar las tareas.')
      })

    return () => {
      vivo = false
    }
  }, [cargarPlan])

  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title={greeting}
        documentTitle="Resumen"
        subtitle={`${formatLongDate(todayIso, { includeYear: true })} · ${summary.taskCounts.pendiente} tareas pendientes`}
        actions={
          <Link to="/" className="btn-primary">
            Ir a Hoy
          </Link>
        }
      />

      {errorApi && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {errorApi}
        </div>
      )}

      {/* ── Planificación académica ── */}
      <section className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Planificación académica</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Resumen calculado con tus tareas, clases y eventos activos.
            </p>
          </div>
          <button type="button" onClick={cargarPlan} disabled={planCargando} className="btn-secondary text-xs px-3 py-1.5">
            {planCargando ? 'Calculando…' : 'Recalcular'}
          </button>
        </div>

        {planError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {planError} —{' '}
            <button type="button" onClick={cargarPlan} className="underline font-medium">
              reintentar
            </button>
          </div>
        )}
        {!planError && planCargando && <p className="text-sm text-zinc-500">Cargando planificación…</p>}
        {!planError && !planCargando && planAcademico && planAcademico.sinDatos && (
          <p className="text-sm text-zinc-500">Todavía no hay datos académicos registrados.</p>
        )}
        {!planError && !planCargando && planAcademico && !planAcademico.sinDatos && (() => {
          const prioridades = Array.isArray(planAcademico.prioridades) ? planAcademico.prioridades : []
          const proximos7 = Array.isArray(planAcademico.proximos7) ? planAcademico.proximos7 : []
          const sobrecarga = Array.isArray(planAcademico.sobrecarga) ? planAcademico.sobrecarga : []
          const bloquesSugeridos = Array.isArray(planAcademico.bloquesSugeridos) ? planAcademico.bloquesSugeridos : []
          const sinHueco = Array.isArray(planAcademico.sinHueco) ? planAcademico.sinHueco : []
          return (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface-50 border border-surface-200 p-3.5">
                <p className="text-xs text-zinc-500">Prioridad principal</p>
                <p className="text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  {prioridades[0] ? prioridades[0].titulo : 'Sin pendientes'}
                </p>
                {prioridades[0] && <p className="text-xs text-zinc-500 mt-1">{prioridades[0].motivo}</p>}
              </div>
              <div className="rounded-xl bg-surface-50 border border-surface-200 p-3.5">
                <p className="text-xs text-zinc-500">Entregas en 7 días</p>
                <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">{proximos7.length}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {sobrecarga.length
                    ? `Sobrecarga: ${sobrecarga.map((s) => `${formatShortDate(s.fecha)} (${s.entregas})`).join(', ')}`
                    : 'Carga equilibrada'}
                </p>
              </div>
              <div className="rounded-xl bg-surface-50 border border-surface-200 p-3.5">
                <p className="text-xs text-zinc-500">Bloques sugeridos</p>
                <p className="text-lg font-semibold text-zinc-900 mt-0.5 tabular-nums">{bloquesSugeridos.length}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {sinHueco.length ? `${sinHueco.length} sin hueco antes del límite` : 'Todo encaja en horario'}
                </p>
              </div>
            </div>
          )
        })()}
      </section>

      {/* ── Accesos directos (visibles también en táctil) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ to, icon: Icon, title, description, bgLight, textColor }) => (
          <Link key={to} to={to} className="group glass-card-hover p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className={`w-10 h-10 rounded-xl ${bgLight} flex items-center justify-center`}>
                {createElement(Icon, { size: 20, className: textColor, strokeWidth: 1.85, 'aria-hidden': true })}
              </div>
              <ArrowRight size={15} className="text-zinc-400 group-hover:text-primary-600 transition-colors" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 group-hover:text-primary-700 transition-colors">
                {title}
              </h2>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
