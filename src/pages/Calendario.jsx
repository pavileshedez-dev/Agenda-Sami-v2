import { useState, useMemo, useEffect, useId } from 'react'
import {
  asignaturas as apiAsignaturas,
  tareas as apiTareas,
  horarios as apiHorarios,
  eventos as apiEventos,
  festivos as apiFestivos,
} from '../lib/apiCalendario'
import { getDatesInRange } from '../lib/dateUtils'
import { formatLongDate, formatShortDate, formatEventTime } from '../lib/formatters'
import PageHeader from '../components/ui/PageHeader'
import AppDialog, { ConfirmDialog } from '../components/ui/AppDialog'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  GraduationCap,
  ListTodo,
  CheckCircle2,
  PartyPopper,
  CalendarHeart,
  AlertTriangle,
  Plus,
  MapPin,
  Trash2,
  Sun,
  Pencil,
  CalendarDays,
  ChevronDown,
} from 'lucide-react'

const HOLIDAYS = [
  { date: '2026-01-01', name: 'Año Nuevo', type: 'nacional' },
  { date: '2026-01-06', name: 'Día de Reyes', type: 'nacional' },
  { date: '2026-04-02', name: 'Jueves Santo', type: 'autonomico' },
  { date: '2026-04-03', name: 'Viernes Santo', type: 'nacional' },
  { date: '2026-05-01', name: 'Día del Trabajo', type: 'nacional' },
  { date: '2026-05-02', name: 'Fiesta de la Comunidad de Madrid', type: 'autonomico' },
  { date: '2026-08-15', name: 'Asunción de la Virgen', type: 'nacional' },
  { date: '2026-10-12', name: 'Fiesta Nacional de España', type: 'nacional' },
  { date: '2026-11-01', name: 'Todos los Santos', type: 'nacional' },
  { date: '2026-11-09', name: 'La Almudena', type: 'local' },
  { date: '2026-12-06', name: 'Día de la Constitución', type: 'nacional' },
  { date: '2026-12-08', name: 'Inmaculada Concepción', type: 'nacional' },
  { date: '2026-12-25', name: 'Navidad', type: 'nacional' },
]

const OFFICIAL_HOLIDAY_DATES = new Set(HOLIDAYS.map((h) => h.date))
const DAYS_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const FILTER_CHIPS = [
  { id: 'todos', label: 'Todos' },
  { id: 'planes', label: 'Planes y eventos' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'tareas', label: 'Tareas y exámenes' },
  { id: 'festivos', label: 'Festivos' },
]

export default function Calendario() {
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => formatDate(today), [today])

  const [tasks, setTasks] = useState([])
  const [horario, setHorario] = useState([])
  const [agendaTasks, setAgendaTasks] = useState([])
  const [customHolidays, setCustomHolidays] = useState([])
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorApi, setErrorApi] = useState(null)
  const [tick, setTick] = useState(0)

  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [activeFilter, setActiveFilter] = useState('todos')

  // Diálogo de creación / edición de eventos
  const [modalEventoAbierto, setModalEventoAbierto] = useState(false)
  const [eventoEditandoId, setEventoEditandoId] = useState(null)
  const [formularioEvento, setFormularioEvento] = useState({
    categoria: 'plan',
    titulo: '',
    descripcion: '',
    ubicacion: '',
    es_dia_completo: false,
    fecha_inicio: todayKey,
    hora_inicio: '10:00',
    fecha_fin: todayKey,
    hora_fin: '12:00',
  })
  const [ocupadoEvento, setOcupadoEvento] = useState(false)
  const [errorEvento, setErrorEvento] = useState(null)
  const [eventoAEliminar, setEventoAEliminar] = useState(null)

  const fieldPrefix = useId()

  const abrirModalNuevoEvento = (fechaPre = null) => {
    const fecha = fechaPre || selectedDate || todayKey
    setEventoEditandoId(null)
    setFormularioEvento({
      categoria: 'plan',
      titulo: '',
      descripcion: '',
      ubicacion: '',
      es_dia_completo: false,
      fecha_inicio: fecha,
      hora_inicio: '10:00',
      fecha_fin: fecha,
      hora_fin: '12:00',
    })
    setErrorEvento(null)
    setModalEventoAbierto(true)
  }

  const abrirModalEditarEvento = (ev) => {
    const inicioStr = String(ev.inicio || '')
    const finStr = String(ev.fin || inicioStr)
    const fechaInicio = inicioStr.slice(0, 10) || selectedDate || todayKey
    const fechaFin = finStr.slice(0, 10) || fechaInicio
    const horaInicio = inicioStr.includes('T') ? inicioStr.split('T')[1].slice(0, 5) : '10:00'
    const horaFin = finStr.includes('T') ? finStr.split('T')[1].slice(0, 5) : '12:00'
    setEventoEditandoId(ev.id)
    setFormularioEvento({
      categoria: ev.categoria || (ev.isVacaciones ? 'vacaciones' : ev.isPlan ? 'plan' : 'general'),
      titulo: ev.title || ev.titulo || '',
      descripcion: ev.descripcion || '',
      ubicacion: ev.ubicacion || '',
      es_dia_completo: Boolean(ev.esDiaCompleto || ev.es_dia_completo || !inicioStr.includes('T')),
      fecha_inicio: fechaInicio,
      hora_inicio: horaInicio,
      fecha_fin: fechaFin,
      hora_fin: horaFin,
    })
    setErrorEvento(null)
    setModalEventoAbierto(true)
  }

  const guardarEvento = async (e) => {
    e.preventDefault()
    if (!formularioEvento.titulo.trim()) {
      setErrorEvento('El título es obligatorio.')
      return
    }
    setOcupadoEvento(true)
    setErrorEvento(null)
    try {
      const esVacaciones = formularioEvento.categoria === 'vacaciones'
      const esDiaCompleto = esVacaciones || formularioEvento.es_dia_completo
      const inicio = esDiaCompleto
        ? formularioEvento.fecha_inicio
        : `${formularioEvento.fecha_inicio}T${formularioEvento.hora_inicio || '10:00'}:00`
      const fin = esDiaCompleto
        ? (formularioEvento.fecha_fin || formularioEvento.fecha_inicio)
        : `${formularioEvento.fecha_fin || formularioEvento.fecha_inicio}T${formularioEvento.hora_fin || '12:00'}:00`

      const payload = {
        titulo: formularioEvento.titulo.trim(),
        descripcion: formularioEvento.descripcion.trim(),
        categoria: formularioEvento.categoria,
        ubicacion: formularioEvento.ubicacion.trim() || null,
        es_dia_completo: esDiaCompleto ? 1 : 0,
        inicio,
        fin,
      }

      if (eventoEditandoId) {
        await apiEventos.editar(eventoEditandoId, payload)
      } else {
        await apiEventos.crear(payload)
      }

      setModalEventoAbierto(false)
      setEventoEditandoId(null)
      setTick((t) => t + 1)
    } catch (err) {
      setErrorEvento(err.message || 'No se pudo guardar el evento.')
    } finally {
      setOcupadoEvento(false)
    }
  }

  const confirmarBorradoEvento = async () => {
    if (!eventoAEliminar) return
    setOcupadoEvento(true)
    try {
      await apiEventos.borrar(eventoAEliminar.id)
      setEventoAEliminar(null)
      setTick((t) => t + 1)
    } catch (err) {
      setErrorApi(err.message || 'No se pudo eliminar el evento.')
      setEventoAEliminar(null)
    } finally {
      setOcupadoEvento(false)
    }
  }

  useEffect(() => {
    let vivo = true
    Promise.all([
      apiTareas.listar(),
      apiHorarios.listar(),
      apiAsignaturas.listar(),
      apiEventos.listar().catch(() => []),
      apiFestivos.listar().catch(() => []),
    ])
      .then(([tareas, horarios, asignaturas, evs, fests]) => {
        if (!vivo) return
        const nombrePorId = new Map(asignaturas.map((a) => [a.id, a.nombre]))
        const colorPorId = new Map(asignaturas.map((a) => [a.id, a.color]))
        const academicas = tareas.filter((x) => (x.ambito || 'academico') === 'academico')
        const personales = tareas.filter((x) => x.ambito === 'personal')

        setTasks(
          academicas.map((x) => ({
            id: x.id,
            title: x.titulo,
            asignatura: nombrePorId.get(x.asignatura_id) || x.asignatura_nombre || x.asignatura || '',
            asignaturaId: x.asignatura_id,
            status: x.estado,
            dueDate: x.fecha_entrega,
            tipo: x.tipo,
          }))
        )
        setAgendaTasks(
          personales.map((x) => ({
            id: x.id,
            title: x.titulo,
            dueDate: x.fecha_entrega,
            status: x.estado,
            completed: x.estado === 'completado',
            isExam: x.tipo === 'examen',
            highPriority: Number(x.prioridad) === 1,
            asignatura: nombrePorId.get(x.asignatura_id) || '',
          }))
        )
        setHorario(
          horarios.map((h) => ({
            id: h.id,
            subject: nombrePorId.get(h.asignatura_id) || h.asignatura_nombre || h.asignatura || '',
            asignaturaId: h.asignatura_id,
            asignaturaColor: colorPorId.get(h.asignatura_id) || null,
            room: h.aula || '',
            day: Number(h.dia_semana || h.dia || 1) - 1,
            startHour: Number(String(h.hora_inicio).split(':')[0]),
            endHour: Number(String(h.hora_fin).split(':')[0]),
          }))
        )
        setCustomHolidays(
          fests
            .filter((f) => f && f.fecha)
            .map((f) => ({
              id: f.id || f.fecha,
              date: String(f.fecha).slice(0, 10),
              name: f.nombre || 'Festivo',
              ambito: f.ambito || f.tipo || 'personal',
              isStrike:
                Boolean(f.es_huelga) ||
                String(f.tipo || '').toLowerCase() === 'huelga' ||
                /huelga/i.test(String(f.nombre || '')),
            }))
        )
        setEventos(evs)
        setErrorApi(null)
      })
      .catch((e) => {
        if (vivo) setErrorApi(e.message || 'No se pudieron cargar los datos del calendario.')
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [tick])

  const calendarDays = useMemo(() => buildCalendar(currentYear, currentMonth), [currentYear, currentMonth])

  const strikeDates = useMemo(
    () => new Set(customHolidays.filter((h) => h.isStrike).map((h) => h.date)),
    [customHolidays]
  )

  const exemptDates = useMemo(() => {
    const s = new Set(OFFICIAL_HOLIDAY_DATES)
    customHolidays.forEach((h) => s.add(h.date))
    return s
  }, [customHolidays])

  // Mapa de días con clases (para mostrar indicador de conflicto vacaciones vs clases en la cuadrícula)
  const weekdayHasClasses = useMemo(() => {
    const set = new Set()
    horario.forEach((c) => {
      if (c.day >= 0 && c.day <= 4) set.add(c.day)
    })
    return set
  }, [horario])

  const eventsMap = useMemo(() => {
    const map = {}
    const push = (key, item) => {
      if (!key) return
      if (!map[key]) map[key] = []
      map[key].push(item)
    }

    tasks.forEach((task) => {
      if (!task.dueDate) return
      push(task.dueDate, {
        type: 'task',
        title: task.title,
        subtitle: task.asignatura,
        status: task.status,
        color: task.status === 'completado' ? 'emerald' : task.status === 'en-curso' ? 'blue' : 'amber',
      })
    })

    agendaTasks.forEach((at) => {
      if (!at.dueDate) return
      push(at.dueDate, {
        type: 'agenda',
        title: at.title,
        subtitle: at.completed ? 'Completada' : 'Pendiente',
        status: at.completed ? 'completado' : 'pendiente',
        highPriority: at.highPriority,
        isExam: at.isExam,
        asignatura: at.asignatura,
        color: at.isExam ? 'rose' : at.completed ? 'emerald' : at.highPriority ? 'amber' : 'violet',
      })
    })

    const seenHolidayKey = new Set()
    HOLIDAYS.forEach((h) => {
      seenHolidayKey.add(`${h.date}:${h.name.toLowerCase()}`)
      push(h.date, {
        type: 'holiday',
        title: h.name,
        subtitle: h.type === 'nacional' ? 'Nacional' : h.type === 'autonomico' ? 'Autonómico' : 'Local',
        color: 'rose',
      })
    })

    customHolidays.forEach((h) => {
      const dedup = `${h.date}:${h.name.toLowerCase()}`
      if (seenHolidayKey.has(dedup)) return
      if (OFFICIAL_HOLIDAY_DATES.has(h.date) && !h.isStrike) return
      seenHolidayKey.add(dedup)
      push(h.date, {
        type: 'holiday',
        title: h.name,
        subtitle: h.isStrike ? 'Huelga' : 'Personalizado',
        color: h.isStrike ? 'red' : 'teal',
        custom: true,
        isStrike: h.isStrike,
      })
    })

    eventos.forEach((ev) => {
      if (!ev.inicio) return
      const isVacaciones = ev.categoria === 'vacaciones'
      const isPlan = ev.categoria === 'plan'
      const range = getDatesInRange(ev.inicio, ev.fin)
      range.forEach((dateKey, idx) => {
        push(dateKey, {
          id: ev.id,
          type: isVacaciones ? 'vacaciones' : isPlan ? 'plan' : 'event',
          title: ev.titulo,
          subtitle: isVacaciones
            ? 'Vacaciones'
            : ev.ubicacion
              ? `Plan · ${ev.ubicacion}`
              : isPlan
                ? 'Plan personal'
                : 'Evento',
          categoria: ev.categoria || 'general',
          color: isVacaciones ? 'teal' : isPlan ? 'indigo' : 'sky',
          isVacaciones,
          isPlan,
          esDiaCompleto: Boolean(ev.es_dia_completo),
          inicio: ev.inicio,
          fin: ev.fin,
          ubicacion: ev.ubicacion || '',
          descripcion: ev.descripcion || '',
          isRangeStart: idx === 0,
          isRangeEnd: idx === range.length - 1,
          rangeLength: range.length,
        })
      })
    })

    return map
  }, [tasks, agendaTasks, customHolidays, eventos])

  const selectedDayClasses = useMemo(() => {
    if (!selectedDate) return []
    if (strikeDates.has(selectedDate) || exemptDates.has(selectedDate)) return []
    const d = new Date(`${selectedDate}T12:00:00`)
    const jsDay = d.getDay()
    const dayIdx = jsDay === 0 ? -1 : jsDay - 1
    if (dayIdx < 0 || dayIdx > 4) return []
    return horario.filter((c) => c.day === dayIdx).toSorted((a, b) => a.startHour - b.startHour)
  }, [selectedDate, horario, strikeDates, exemptDates])

  const upcomingEvents = useMemo(
    () =>
      eventos
        .filter((e) => e && e.inicio)
        .toSorted((a, b) => String(a.inicio).localeCompare(String(b.inicio))),
    [eventos]
  )

  const yearHolidays = useMemo(() => {
    const prefix = `${currentYear}-`
    const byDate = new Map()
    HOLIDAYS.filter((h) => h.date.startsWith(prefix)).forEach((h) => byDate.set(h.date, { date: h.date, name: h.name, isStrike: false }))
    customHolidays
      .filter((h) => h.date.startsWith(prefix))
      .forEach((h) => {
        if (!byDate.has(h.date) || h.isStrike) byDate.set(h.date, h)
      })
    return Array.from(byDate.values()).toSorted((a, b) => a.date.localeCompare(b.date))
  }, [customHolidays, currentYear])

  function matchesFilter(ev) {
    if (activeFilter === 'todos') return true
    if (activeFilter === 'planes') return ev.isPlan || ev.type === 'event'
    if (activeFilter === 'vacaciones') return ev.isVacaciones
    if (activeFilter === 'tareas') return ev.type === 'task' || ev.type === 'agenda'
    if (activeFilter === 'festivos') return ev.type === 'holiday'
    return true
  }

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  function goToToday() {
    setCurrentMonth(today.getMonth())
    setCurrentYear(today.getFullYear())
    setSelectedDate(todayKey)
  }

  return (
    <div className="page-enter space-y-5">
      <PageHeader
        title="Calendario"
        subtitle="Vista unificada de clases, entregas, planes, vacaciones y festivos."
        actions={
          <>
            <button type="button" onClick={goToToday} className="btn-secondary">
              Hoy
            </button>
            <button type="button" onClick={() => abrirModalNuevoEvento()} className="btn-primary">
              <Plus size={16} aria-hidden="true" />
              <span>Nuevo evento</span>
            </button>
          </>
        }
      />

      {errorApi && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>No se pudo conectar con la API: {errorApi}</span>
          <button type="button" onClick={() => setTick((v) => v + 1)} className="font-semibold underline shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {/* ── Barra de mes y filtros (encima de la cuadrícula) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="btn-ghost p-2 min-w-[40px] min-h-[40px]"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <h2 className="text-lg font-semibold text-zinc-900 min-w-[168px] text-center tabular-nums">
            {MONTHS[currentMonth]} {currentYear}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            className="btn-ghost p-2 min-w-[40px] min-h-[40px]"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar elementos del calendario">
          {FILTER_CHIPS.map((chip) => {
            const active = activeFilter === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilter(chip.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[34px] ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white border border-surface-200 text-zinc-600 hover:bg-surface-100 hover:text-zinc-900'
                }`}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Cuadrícula mensual + Inspector lateral (2 columnas en escritorio) ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-4 min-w-0">
          <div className="surface-card overflow-hidden">
            {/* Cabecera de días */}
            <div className="grid grid-cols-7 border-b border-surface-200 bg-surface-50/80">
              {DAYS_HEADER.map((d) => (
                <div key={d} className="py-2.5 text-center text-xs font-semibold text-zinc-500">
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas del mes */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const dateKey = day ? formatDate(new Date(currentYear, currentMonth, day)) : null
                const allEvents = dateKey ? eventsMap[dateKey] || [] : []
                const events = allEvents.filter(matchesFilter)
                const isToday = Boolean(dateKey) && dateKey === todayKey
                const isSelected = Boolean(dateKey) && dateKey === selectedDate
                const isWeekend = i % 7 >= 5
                const isOfficialHoliday = Boolean(dateKey) && OFFICIAL_HOLIDAY_DATES.has(dateKey)
                const isCustomHoliday = Boolean(dateKey) && customHolidays.some((h) => h.date === dateKey && !h.isStrike)
                const isStrike = Boolean(dateKey) && strikeDates.has(dateKey)
                const vacacionesEvents = events.filter((e) => e.isVacaciones)
                const hasVacaciones = vacacionesEvents.length > 0
                const planesEvents = events.filter((e) => e.isPlan || e.type === 'event')
                const examEvents = events.filter((e) => e.type === 'agenda' && e.isExam)
                const holidayEvents = events.filter((e) => e.type === 'holiday')
                const otherEvents = events.filter(
                  (e) => !e.isVacaciones && !e.isPlan && e.type !== 'event' && e.type !== 'holiday' && !(e.type === 'agenda' && e.isExam)
                )

                // Detectar conflicto vacaciones vs clases/tareas
                const dayIdx = i % 7
                const hasClassesThisDay =
                  Boolean(dateKey) && dayIdx < 5 && !isOfficialHoliday && !isCustomHoliday && !isStrike && weekdayHasClasses.has(dayIdx)
                const hasConflict =
                  allEvents.some((e) => e.isVacaciones) &&
                  (hasClassesThisDay || allEvents.some((e) => e.type === 'task' || e.isExam))

                if (!day) {
                  return (
                    <div
                      key={i}
                      aria-hidden="true"
                      className="min-h-[68px] sm:min-h-[96px] border-b border-r border-surface-100 bg-surface-50/50"
                    />
                  )
                }

                const vac = vacacionesEvents[0]
                let cellBg = isWeekend ? 'bg-surface-50/40' : 'bg-white'
                if (isStrike) cellBg = 'bg-red-50/60'
                else if (hasVacaciones) cellBg = 'bg-teal-50/55'
                else if (isOfficialHoliday || isCustomHoliday) cellBg = 'bg-rose-50/35'

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDate(dateKey)}
                    aria-label={`${formatLongDate(dateKey)}${allEvents.length ? `, ${allEvents.length} elementos` : ''}${hasConflict ? ', conflicto detectado' : ''}`}
                    aria-pressed={isSelected}
                    className={`relative text-left align-top min-h-[68px] sm:min-h-[96px] p-1.5 border-b border-r border-surface-200/70 transition-colors flex flex-col justify-start gap-1
                      ${cellBg}
                      ${isSelected ? 'ring-2 ring-inset ring-primary-600 bg-primary-50/40 z-[1]' : 'hover:bg-surface-100/70'}
                    `}
                  >
                    {/* Fila superior: número de día + indicador de conflicto/festivo */}
                    <div className="flex items-center justify-between w-full gap-1">
                      <span
                        className={`text-xs font-medium tabular-nums inline-flex items-center justify-center w-6 h-6 rounded-full mx-auto sm:mx-0 ${
                          isToday
                            ? 'bg-primary-600 text-white font-semibold'
                            : isStrike || isOfficialHoliday
                              ? 'text-rose-600 font-semibold'
                              : hasVacaciones
                                ? 'text-teal-800 font-semibold'
                                : 'text-zinc-700'
                        }`}
                      >
                        {day}
                      </span>
                      {hasConflict && (
                        <span
                          title="Conflicto: vacaciones con actividad académica"
                          className="hidden sm:inline-flex w-2 h-2 rounded-full bg-amber-500 shrink-0"
                        />
                      )}
                    </div>

                    {/* Banda continua de vacaciones en escritorio */}
                    {hasVacaciones && vac && (
                      <div
                        className={`hidden sm:block text-[10.5px] leading-tight px-1.5 py-0.5 truncate bg-teal-600/12 text-teal-900 font-medium border-teal-500
                          ${vac.isRangeStart ? 'border-l-2 rounded-l' : '-ml-1.5 pl-2'}
                          ${vac.isRangeEnd ? 'rounded-r' : '-mr-1.5 pr-2'}
                        `}
                      >
                        {vac.isRangeStart || i % 7 === 0 ? vac.title : '\u00A0'}
                      </div>
                    )}

                    {/* Etiquetas en escritorio */}
                    <div className="hidden sm:flex flex-col gap-0.5 w-full min-w-0">
                      {holidayEvents.slice(0, 1).map((ev, j) => (
                        <div
                          key={`hol-${j}`}
                          className={`text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate font-medium ${
                            ev.isStrike ? 'bg-red-100 text-red-700 line-through' : 'bg-rose-100/80 text-rose-800'
                          }`}
                        >
                          {ev.title}
                        </div>
                      ))}

                      {examEvents.slice(0, 1).map((ev, j) => (
                        <div key={`ex-${j}`} className="text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate bg-red-100 text-red-800 font-semibold">
                          {ev.title}
                        </div>
                      ))}

                      {planesEvents.slice(0, 1).map((pl, j) => (
                        <div key={`pl-${j}`} className="text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate bg-indigo-50 text-indigo-800 border border-indigo-200/70 font-medium">
                          {pl.title}
                        </div>
                      ))}

                      {otherEvents.slice(0, hasVacaciones || planesEvents.length ? 1 : 2).map((ev, j) => (
                        <div
                          key={`ot-${j}`}
                          className={`text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate ${
                            ev.status === 'completado'
                              ? 'bg-emerald-50 text-emerald-700 line-through opacity-75'
                              : ev.color === 'blue'
                                ? 'bg-blue-50 text-blue-800'
                                : ev.color === 'violet'
                                  ? 'bg-violet-50 text-violet-800'
                                  : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {ev.title}
                        </div>
                      ))}

                      {events.length > 3 && (
                        <span className="text-[10px] text-zinc-500 px-1 tabular-nums">+{events.length - 3} más</span>
                      )}
                    </div>

                    {/* Puntos compactos en móvil */}
                    {(events.length > 0 || hasConflict) && (
                      <div className="sm:hidden flex items-center justify-center gap-1 mt-auto pb-0.5 w-full">
                        {events.slice(0, 3).map((ev, j) => (
                          <span
                            key={j}
                            className={`w-1.5 h-1.5 rounded-full ${
                              ev.isVacaciones
                                ? 'bg-teal-600'
                                : ev.isPlan || ev.type === 'event'
                                  ? 'bg-indigo-500'
                                  : ev.color === 'rose' || ev.color === 'red'
                                    ? 'bg-rose-500'
                                    : ev.color === 'emerald'
                                      ? 'bg-emerald-500'
                                      : 'bg-amber-500'
                            }`}
                          />
                        ))}
                        {hasConflict && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-amber-700/40" />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Leyenda sobria */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 px-1">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-600/25 border border-teal-500" /> Vacaciones</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-300" /> Planes</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" /> Tareas</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-300" /> Festivo / Examen</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Conflicto</span>
          </div>

          {/* Paneles secundarios plegados (no compiten con la cuadrícula) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <details className="surface-card group min-w-0">
              <summary className="px-4 py-3 text-sm font-medium text-zinc-800 cursor-pointer list-none flex items-center justify-between gap-2 select-none">
                <span className="flex items-center gap-2">
                  <CalendarDays size={15} className="text-zinc-500" aria-hidden="true" />
                  Próximos eventos ({upcomingEvents.length})
                </span>
                <ChevronDown size={15} className="text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-3 pt-1 border-t border-surface-100">
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">No hay eventos registrados.</p>
                ) : (
                  <ul className="divide-y divide-surface-100">
                    {upcomingEvents.slice(0, 8).map((ev) => (
                      <li key={ev.id} className="py-2 flex items-baseline justify-between gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const key = String(ev.inicio).slice(0, 10)
                            const d = new Date(`${key}T12:00:00`)
                            if (!Number.isNaN(d.getTime())) {
                              setCurrentYear(d.getFullYear())
                              setCurrentMonth(d.getMonth())
                              setSelectedDate(key)
                            }
                          }}
                          className="text-left text-zinc-800 hover:text-primary-600 font-medium truncate"
                        >
                          {ev.titulo}
                        </button>
                        <span className="text-zinc-500 tabular-nums whitespace-nowrap shrink-0">
                          {formatShortDate(ev.inicio)} · {formatEventTime(ev.inicio, ev.fin, ev.es_dia_completo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>

            <details className="surface-card group">
              <summary className="px-4 py-3 text-sm font-medium text-zinc-800 cursor-pointer list-none flex items-center justify-between gap-2 select-none">
                <span className="flex items-center gap-2">
                  <PartyPopper size={15} className="text-zinc-500" aria-hidden="true" />
                  Festivos de {currentYear} ({yearHolidays.length})
                </span>
                <ChevronDown size={15} className="text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-3 pt-2 border-t border-surface-100">
                {yearHolidays.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-1">No hay festivos cargados para {currentYear}.</p>
                ) : (
                  <ul className="divide-y divide-surface-100">
                    {yearHolidays.map((h) => (
                      <li key={`${h.date}-${h.name}`} className="py-1.5 flex items-baseline justify-between gap-2 text-xs">
                        <span className={h.isStrike ? 'text-red-700 font-medium' : 'text-zinc-700'}>{h.name}</span>
                        <span className="text-zinc-500 tabular-nums whitespace-nowrap">{formatShortDate(h.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </div>
        </div>

        {/* ── Inspector del día seleccionado ── */}
        <aside aria-label="Detalle del día seleccionado" className="xl:sticky xl:top-6">
          {cargando && !selectedDate ? (
            <div className="surface-card p-5 text-sm text-zinc-500">Cargando calendario…</div>
          ) : (
            <DayDetail
              dateKey={selectedDate || todayKey}
              events={eventsMap[selectedDate || todayKey] || []}
              classes={selectedDayClasses}
              isStrike={strikeDates.has(selectedDate || todayKey)}
              onEditarEvento={abrirModalEditarEvento}
              onBorrarEvento={(ev) => setEventoAEliminar(ev)}
              onNuevoEvento={() => abrirModalNuevoEvento(selectedDate || todayKey)}
            />
          )}
        </aside>
      </div>

      {/* ── Diálogo nativo <dialog>: Crear / Editar Evento, Plan o Vacaciones ── */}
      <AppDialog
        open={modalEventoAbierto}
        onClose={() => {
          setModalEventoAbierto(false)
          setEventoEditandoId(null)
        }}
        title={
          eventoEditandoId
            ? 'Editar evento'
            : formularioEvento.categoria === 'vacaciones'
              ? 'Registrar período de vacaciones'
              : 'Nuevo evento o plan'
        }
        maxWidth="32rem"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setModalEventoAbierto(false)
                setEventoEditandoId(null)
              }}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={`${fieldPrefix}-evento-form`}
              disabled={ocupadoEvento}
              className="btn-primary"
            >
              {ocupadoEvento ? 'Guardando…' : eventoEditandoId ? 'Guardar cambios' : 'Guardar'}
            </button>
          </>
        }
      >
        {errorEvento && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {errorEvento}
          </div>
        )}

        <form id={`${fieldPrefix}-evento-form`} onSubmit={guardarEvento} className="space-y-4">
          <div>
            <label htmlFor={`${fieldPrefix}-cat`} className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Categoría
            </label>
            <select
              id={`${fieldPrefix}-cat`}
              value={formularioEvento.categoria}
              onChange={(e) => setFormularioEvento({ ...formularioEvento, categoria: e.target.value })}
              className="input-field"
            >
              <option value="plan">Plan (cita, ocio o compromiso puntual)</option>
              <option value="vacaciones">Vacaciones (período de días completos)</option>
              <option value="general">Evento general</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${fieldPrefix}-titulo`} className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Título
            </label>
            <input
              id={`${fieldPrefix}-titulo`}
              type="text"
              required
              placeholder={formularioEvento.categoria === 'vacaciones' ? 'Ej. Escapada de puente' : 'Ej. Comida familiar, cita médica…'}
              value={formularioEvento.titulo}
              onChange={(e) => setFormularioEvento({ ...formularioEvento, titulo: e.target.value })}
              className="input-field"
            />
          </div>

          {formularioEvento.categoria === 'vacaciones' ? (
            <div className="space-y-3 bg-teal-50/70 p-3.5 rounded-xl border border-teal-200">
              <div className="text-xs text-teal-900 font-medium flex items-center gap-1.5">
                <Sun size={14} className="text-teal-700 shrink-0" aria-hidden="true" />
                <span>Período de descanso en días completos</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${fieldPrefix}-v-ini`} className="block text-xs font-medium text-zinc-700 mb-1">
                    Fecha de inicio
                  </label>
                  <input
                    id={`${fieldPrefix}-v-ini`}
                    type="date"
                    required
                    value={formularioEvento.fecha_inicio}
                    onChange={(e) =>
                      setFormularioEvento({
                        ...formularioEvento,
                        fecha_inicio: e.target.value,
                        fecha_fin: formularioEvento.fecha_fin < e.target.value ? e.target.value : formularioEvento.fecha_fin,
                      })
                    }
                    className="input-field tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldPrefix}-v-fin`} className="block text-xs font-medium text-zinc-700 mb-1">
                    Fecha de fin
                  </label>
                  <input
                    id={`${fieldPrefix}-v-fin`}
                    type="date"
                    required
                    min={formularioEvento.fecha_inicio}
                    value={formularioEvento.fecha_fin}
                    onChange={(e) => setFormularioEvento({ ...formularioEvento, fecha_fin: e.target.value })}
                    className="input-field tabular-nums"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label htmlFor={`${fieldPrefix}-allday`} className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                <input
                  id={`${fieldPrefix}-allday`}
                  type="checkbox"
                  checked={formularioEvento.es_dia_completo}
                  onChange={(e) => setFormularioEvento({ ...formularioEvento, es_dia_completo: e.target.checked })}
                  className="rounded border-surface-300 text-primary-600 h-4 w-4"
                />
                <span>Evento de día completo</span>
              </label>

              {formularioEvento.es_dia_completo ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${fieldPrefix}-ad-ini`} className="block text-xs font-medium text-zinc-700 mb-1">
                      Fecha inicio
                    </label>
                    <input
                      id={`${fieldPrefix}-ad-ini`}
                      type="date"
                      required
                      value={formularioEvento.fecha_inicio}
                      onChange={(e) =>
                        setFormularioEvento({
                          ...formularioEvento,
                          fecha_inicio: e.target.value,
                          fecha_fin: formularioEvento.fecha_fin < e.target.value ? e.target.value : formularioEvento.fecha_fin,
                        })
                      }
                      className="input-field tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fieldPrefix}-ad-fin`} className="block text-xs font-medium text-zinc-700 mb-1">
                      Fecha fin
                    </label>
                    <input
                      id={`${fieldPrefix}-ad-fin`}
                      type="date"
                      min={formularioEvento.fecha_inicio}
                      value={formularioEvento.fecha_fin}
                      onChange={(e) => setFormularioEvento({ ...formularioEvento, fecha_fin: e.target.value })}
                      className="input-field tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`${fieldPrefix}-f-ini`} className="block text-xs font-medium text-zinc-700 mb-1">
                        Fecha inicio
                      </label>
                      <input
                        id={`${fieldPrefix}-f-ini`}
                        type="date"
                        required
                        value={formularioEvento.fecha_inicio}
                        onChange={(e) =>
                          setFormularioEvento({ ...formularioEvento, fecha_inicio: e.target.value, fecha_fin: e.target.value })
                        }
                        className="input-field tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${fieldPrefix}-h-ini`} className="block text-xs font-medium text-zinc-700 mb-1">
                        Hora inicio
                      </label>
                      <input
                        id={`${fieldPrefix}-h-ini`}
                        type="time"
                        required
                        value={formularioEvento.hora_inicio}
                        onChange={(e) => setFormularioEvento({ ...formularioEvento, hora_inicio: e.target.value })}
                        className="input-field tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`${fieldPrefix}-f-fin`} className="block text-xs font-medium text-zinc-700 mb-1">
                        Fecha fin
                      </label>
                      <input
                        id={`${fieldPrefix}-f-fin`}
                        type="date"
                        value={formularioEvento.fecha_fin}
                        onChange={(e) => setFormularioEvento({ ...formularioEvento, fecha_fin: e.target.value })}
                        className="input-field tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${fieldPrefix}-h-fin`} className="block text-xs font-medium text-zinc-700 mb-1">
                        Hora fin
                      </label>
                      <input
                        id={`${fieldPrefix}-h-fin`}
                        type="time"
                        value={formularioEvento.hora_fin}
                        onChange={(e) => setFormularioEvento({ ...formularioEvento, hora_fin: e.target.value })}
                        className="input-field tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor={`${fieldPrefix}-ubic`} className="block text-xs font-medium text-zinc-700 mb-1">
                  Ubicación (opcional)
                </label>
                <input
                  id={`${fieldPrefix}-ubic`}
                  type="text"
                  placeholder="Ej. Campus Moncloa UCM, Madrid"
                  value={formularioEvento.ubicacion}
                  onChange={(e) => setFormularioEvento({ ...formularioEvento, ubicacion: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`${fieldPrefix}-desc`} className="block text-xs font-medium text-zinc-700 mb-1">
              Notas (opcional)
            </label>
            <textarea
              id={`${fieldPrefix}-desc`}
              rows={2}
              placeholder="Detalles adicionales…"
              value={formularioEvento.descripcion}
              onChange={(e) => setFormularioEvento({ ...formularioEvento, descripcion: e.target.value })}
              className="input-field"
            />
          </div>
        </form>
      </AppDialog>

      <ConfirmDialog
        open={Boolean(eventoAEliminar)}
        onCancel={() => setEventoAEliminar(null)}
        onConfirm={confirmarBorradoEvento}
        title="Eliminar evento"
        message={eventoAEliminar ? `¿Seguro que quieres eliminar «${eventoAEliminar.title}»?` : ''}
        confirmLabel="Eliminar"
        destructive
        busy={ocupadoEvento}
      />
    </div>
  )
}

function DayDetail({ dateKey, events, classes, isStrike, onEditarEvento, onBorrarEvento, onNuevoEvento }) {
  const dayName = formatLongDate(dateKey)
  const vacaciones = events.filter((e) => e.isVacaciones)
  const planesYEventos = events.filter((e) => e.isPlan || e.type === 'event')
  const holidays = events.filter((e) => e.type === 'holiday')
  const uniTasks = events.filter((e) => e.type === 'task')
  const personalTasks = events.filter((e) => e.type === 'agenda')

  const hasVacaciones = vacaciones.length > 0
  const hasConflict = hasVacaciones && (classes.length > 0 || uniTasks.length > 0 || personalTasks.some((e) => e.isExam))
  const hasContent = events.length > 0 || classes.length > 0

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-surface-200">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">{dayName}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {isStrike && (
              <span className="badge bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle size={11} aria-hidden="true" /> Huelga
              </span>
            )}
            {hasVacaciones && (
              <span className="badge bg-teal-50 text-teal-800 border border-teal-200">
                <Sun size={11} aria-hidden="true" /> Vacaciones
              </span>
            )}
          </div>
        </div>
        {onNuevoEvento && (
          <button
            type="button"
            onClick={onNuevoEvento}
            className="btn-ghost text-xs text-primary-700 hover:bg-primary-50 px-2.5 py-1.5 shrink-0"
          >
            <Plus size={14} aria-hidden="true" /> Añadir
          </button>
        )}
      </div>

      {hasConflict && (
        <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Conflicto de programación</p>
            <p className="mt-0.5 text-amber-800">
              Coincide un período de vacaciones con {classes.length > 0 ? `${classes.length} clase(s)` : 'actividad académica'}. Ambos registros se conservan intactos.
            </p>
          </div>
        </div>
      )}

      {!hasContent && (
        <p className="text-sm text-zinc-500 py-3">Sin actividades registradas para este día.</p>
      )}

      {vacaciones.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sun size={12} aria-hidden="true" /> Vacaciones
          </h4>
          {vacaciones.map((ev) => (
            <div key={ev.id} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 text-teal-950">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{ev.title}</p>
                <p className="text-xs text-teal-800 mt-0.5 tabular-nums">
                  {formatEventTime(ev.inicio, ev.fin, true)}
                </p>
                {ev.descripcion && <p className="text-xs text-teal-700 mt-1">{ev.descripcion}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onEditarEvento(ev)}
                  className="p-1.5 text-teal-700 hover:bg-teal-100 rounded-lg"
                  aria-label={`Editar ${ev.title}`}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onBorrarEvento(ev)}
                  className="p-1.5 text-teal-700 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  aria-label={`Eliminar ${ev.title}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {planesYEventos.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
            Planes y eventos
          </h4>
          {planesYEventos.map((ev) => (
            <div key={ev.id} className="flex items-start justify-between gap-2 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/70 text-indigo-950">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ev.title}</p>
                <p className="text-xs text-indigo-700 mt-0.5 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{formatEventTime(ev.inicio, ev.fin, ev.esDiaCompleto)}</span>
                  {ev.ubicacion && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin size={11} aria-hidden="true" /> {ev.ubicacion}
                    </span>
                  )}
                </p>
                {ev.descripcion && <p className="text-xs text-indigo-800/80 mt-1">{ev.descripcion}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onEditarEvento(ev)}
                  className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg"
                  aria-label={`Editar ${ev.title}`}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onBorrarEvento(ev)}
                  className="p-1.5 text-indigo-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  aria-label={`Eliminar ${ev.title}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {classes.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <Clock size={12} aria-hidden="true" /> Clases
          </h4>
          <ul className="space-y-1.5">
            {classes.map((cls) => (
              <li key={cls.id} className="px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
                <p className="text-sm font-medium text-zinc-900 truncate">{cls.subject}</p>
                <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
                  {String(cls.startHour).padStart(2, '0')}:00–{String(cls.endHour).padStart(2, '0')}:00
                  {cls.room ? ` · ${cls.room}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isStrike && classes.length === 0 && (
        <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle size={13} aria-hidden="true" /> Clases suspendidas por huelga.
        </div>
      )}

      {holidays.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <CalendarHeart size={12} aria-hidden="true" /> Festivos
          </h4>
          {holidays.map((ev, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                ev.isStrike ? 'bg-red-50 border-red-200 text-red-800' : 'bg-rose-50/70 border-rose-200/80 text-rose-900'
              }`}
            >
              {ev.isStrike ? <AlertTriangle size={14} aria-hidden="true" /> : <PartyPopper size={14} aria-hidden="true" />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{ev.title}</p>
                <p className="text-xs opacity-80">{ev.subtitle}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {uniTasks.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <GraduationCap size={12} aria-hidden="true" /> Tareas Universidad
          </h4>
          {uniTasks.map((ev, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-950">
              <ClipboardList size={14} className="shrink-0 text-amber-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ev.title}</p>
                {ev.subtitle && <p className="text-xs text-amber-800 truncate">{ev.subtitle}</p>}
              </div>
            </div>
          ))}
        </section>
      )}

      {personalTasks.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <ListTodo size={12} aria-hidden="true" /> Agenda personal
          </h4>
          {personalTasks.map((ev, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                ev.status === 'completado'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : ev.isExam
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-surface-50 border-surface-200 text-zinc-800'
              }`}
            >
              {ev.status === 'completado' ? (
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
              ) : (
                <ListTodo size={14} className="text-zinc-500 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ev.title}</p>
                <p className="text-xs opacity-75">
                  {ev.subtitle}
                  {ev.asignatura ? ` · ${ev.asignatura}` : ''}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1)
  let startDay = firstDay.getDay() - 1
  if (startDay < 0) startDay = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
