import { createElement, memo, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { tareas as apiTareas, festivos as apiFestivos, asignaturas as apiAsignaturas } from '../lib/apiCalendario'
import { objetivos as objetivosApi, objetivoTareas } from '../lib/apiCalendario'
import { proyectos as proyectosApi, proyectoTareas } from '../lib/apiCalendario'
import { ASIGNATURAS, normalizeText } from '../lib/asignaturas'
import PageHeader from '../components/ui/PageHeader'
import {
    CalendarHeart, PartyPopper, MapPin, Flag, Landmark, Clock,
    ChevronRight, ChevronDown, ChevronUp, Plus, CheckCircle2,
    Circle, Trash2, ListTodo, CalendarPlus, X, StickyNote,
    Sparkles, GraduationCap, AlertTriangle, BookOpen,
} from 'lucide-react'

// Festivos Comunidad de Madrid 2026
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

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const TYPE_CONFIG = {
    nacional: { label: 'Nacional', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', icon: Flag, dot: 'bg-blue-500' },
    autonomico: { label: 'Autonómico', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', icon: Landmark, dot: 'bg-purple-500' },
    local: { label: 'Local', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', icon: MapPin, dot: 'bg-amber-500' },
    personal: { label: 'Personal', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-100', icon: GraduationCap, dot: 'bg-teal-500' },
}

const CUSTOM_TYPES = [
    { key: 'personal', label: 'Huelga / Facultad / Otro' },
    { key: 'local', label: 'Festivo local' },
    { key: 'autonomico', label: 'Festivo autonómico' },
    { key: 'nacional', label: 'Festivo nacional' },
]

const FILTER_OPTIONS = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'completed', label: 'Completadas' },
    { key: 'exams', label: 'Exámenes' },
]

// Autocomplete de asignaturas tipo RENFE
function AsignaturaAutocomplete({ value, onChange, placeholder = 'Buscar asignatura…', required }) {
    const [query, setQuery] = useState(value || '')
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef(null)

    const suggestions = useMemo(() => {
        if (!query.trim()) return []
        const q = normalizeText(query)
        return ASIGNATURAS.filter(a => normalizeText(a).includes(q))
    }, [query])

    useEffect(() => {
        function handleClick(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    function select(asig) {
        setQuery(asig)
        onChange(asig)
        setOpen(false)
    }

    function handleChange(e) {
        setQuery(e.target.value)
        onChange('')    // reset valid value until selection
        setOpen(true)
    }

    function handleBlur() {
        // If typed matches exactly, accept
        const exact = ASIGNATURAS.find(a => normalizeText(a) === normalizeText(query))
        if (exact) { onChange(exact); setQuery(exact) }
    }

    return (
        <div ref={wrapperRef} className="relative">
            <BookOpen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
                type="text"
                value={query}
                onChange={handleChange}
                onFocus={() => setOpen(true)}
                onBlur={handleBlur}
                placeholder={placeholder}
                className="input-field pl-9 pr-3"
                autoComplete="off"
                required={required}
            />
            {open && suggestions.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-surface-200 rounded-xl shadow-elevated max-h-56 overflow-y-auto animate-fade-in">
                    {suggestions.map(a => (
                        <li key={a}>
                            <button
                                type="button"
                                onMouseDown={() => select(a)}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                            >
                                {a}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {open && query.length > 1 && suggestions.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-red-100 rounded-xl shadow-elevated px-4 py-3 text-sm text-red-500 animate-fade-in">
                    Aviso: no coincide con ninguna asignatura oficial
                </div>
            )}
        </div>
    )
}

// ----------------------------------------
//  COMPONENTE PRINCIPAL
// ----------------------------------------
export default function Agenda() {
    const today = useMemo(() => {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        return date
    }, [])
    const todayKey = formatDateKey(today)

    // State
    const [tasks, setTasks] = useState([])
const [customHolidays, setCustomHolidays] = useState([])
const [cargandoApi, setCargandoApi] = useState(true)
const [errorApi, setErrorApi] = useState(null)
const [asignaturasApi, setAsignaturasApi] = useState([])
const [objetivosLista, setObjetivosLista] = useState([])
const [objetivosDeTarea, setObjetivosDeTarea] = useState({})
const [taskObjetivos, setTaskObjetivos] = useState([])
const [proyectosLista, setProyectosLista] = useState([])
const [proyectosDeTarea, setProyectosDeTarea] = useState({})
const [taskProyectos, setTaskProyectos] = useState([])

// Tareas personales y festivos desde SQLite.
const cargar = useCallback(async () => {
    setCargandoApi(true)
    try {
        const [listaTareas, listaFestivos, listaAsig] = await Promise.all([
            apiTareas.listar(), apiFestivos.listar(), apiAsignaturas.listar().catch(() => []),
        ])
        const nombrePorId = new Map(listaAsig.map(a => [a.id, a.nombre]))
        setAsignaturasApi(listaAsig)
        setTasks(listaTareas.filter(x => x.ambito === 'personal').map(x => ({
            id: x.id,
            title: x.titulo,
            description: x.notas || '',
            dueDate: x.fecha_entrega || todayKey,
            completed: x.estado === 'completado',
            highPriority: Number(x.prioridad) === 1,
            isExam: x.tipo === 'examen',
            asignatura: nombrePorId.get(x.asignatura_id) || x.asignatura_id || null,
        })))
        try {
            const listaObj = await objetivosApi.listar()
            setObjetivosLista(listaObj)
            const mapa = {}
            listaObj.forEach(o => (o.tareas || []).forEach(t => {
                if (!mapa[t.id]) mapa[t.id] = []
                mapa[t.id].push({ id: o.id, titulo: o.titulo })
            }))
            setObjetivosDeTarea(mapa)
        } catch { /* la agenda sigue sin objetivos */ }
        try {
            const listaProy = await proyectosApi.listar()
            setProyectosLista(listaProy)
            const mapaProy = {}
            listaProy.forEach(pr => (pr.tareas || []).forEach(tid => {
                if (!mapaProy[tid]) mapaProy[tid] = []
                mapaProy[tid].push({ id: pr.id, titulo: pr.titulo })
            }))
            setProyectosDeTarea(mapaProy)
        } catch { /* la agenda sigue sin proyectos */ }
        setCustomHolidays(listaFestivos.map(f => { let tipo = 'nacional'; if (['madrid', 'guadalajara', 'autonomico'].includes(f.ambito)) tipo = 'autonomico'; else if (f.ambito === 'local') tipo = 'local'; else if (f.ambito === 'personal') tipo = 'personal'; return { id: f.id, date: f.fecha, name: f.nombre || 'Festivo', type: tipo, ambito: f.ambito, custom: !f.id.startsWith('fest-'), isStrike: false }; }))
        setErrorApi(null)
    } catch (e) {
        setErrorApi(e.message || 'No se pudo cargar la agenda desde la API.')
    } finally {
        setCargandoApi(false)
    }
}, [todayKey])

useEffect(() => { cargar() }, [cargar])

    // Form state
    const [showForm, setShowForm] = useState(false)
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDescription, setTaskDescription] = useState('')
    const [taskDueDate, setTaskDueDate] = useState(todayKey)
    const [taskAsig, setTaskAsig] = useState('')
    const [taskHighPriority, setTaskHighPriority] = useState(false)
    const [taskIsExam, setTaskIsExam] = useState(false)
    const [filter, setFilter] = useState('all')
    const [filtroProyecto, setFiltroProyecto] = useState('')
    const [quickText, setQuickText] = useState('')
    const [holidaysExpanded, setHolidaysExpanded] = useState(false)

    // Holiday form
    const [showHolidayForm, setShowHolidayForm] = useState(false)
    const [holidayName, setHolidayName] = useState('')
    const [holidayDate, setHolidayDate] = useState(todayKey)
    const [holidayType, setHolidayType] = useState('personal')
    const [holidayIsStrike, setHolidayIsStrike] = useState(false)

    // Festivos filtrados al año actual y sin duplicados
    const currentYearPrefix = `${today.getFullYear()}-`
    const allHolidays = useMemo(() => {
        const source = customHolidays.length > 0 ? customHolidays : HOLIDAYS
        const seen = new Map()
        for (const h of source) {
            if (!h?.date || !String(h.date).startsWith(currentYearPrefix)) continue
            const key = `${h.date}:${String(h.name || '').toLowerCase()}`
            if (!seen.has(key)) seen.set(key, h)
        }
        return Array.from(seen.values()).toSorted((a, b) => a.date.localeCompare(b.date))
    }, [customHolidays, currentYearPrefix])

    const nextHoliday = useMemo(() =>
        allHolidays.find(h => new Date(h.date + 'T00:00:00') >= today) || null
        , [allHolidays, today])

    const daysUntilNext = useMemo(() => {
        if (!nextHoliday) return null
        const target = new Date(nextHoliday.date + 'T00:00:00')
        return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
    }, [nextHoliday, today])

    const groupedByMonth = useMemo(
        () => Object.groupBy(allHolidays, (h) => parseInt(h.date.split('-')[1], 10) - 1),
        [allHolidays]
    )

    // Próximo examen
    const proximoExamen = useMemo(() => {
        return tasks
            .filter(t => t.isExam && !t.completed && t.dueDate >= todayKey)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null
    }, [tasks, todayKey])

    const diasHastaExamen = useMemo(() => {
        if (!proximoExamen) return null
        const d = new Date(proximoExamen.dueDate + 'T00:00:00')
        return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
    }, [proximoExamen, today])

    // Task helpers
    async function addTask(title, description, dueDate, asig, highPriority, isExam) {
    if (!title.trim()) return
    if (asig && !ASIGNATURAS.includes(asig)) {
        setErrorApi('La asignatura no pertenece al Plan de Logopedia.')
        return
    }
    const asignatura = asig ? asignaturasApi.find(a => String(a.nombre).toLocaleLowerCase() === asig.toLocaleLowerCase()) : null
    try {
        const creada = await apiTareas.crear({
            titulo: title.trim(),
            notas: description.trim() || null,
            fechaEntrega: dueDate || todayKey,
            ambito: 'personal',
            prioridad: highPriority ? 1 : 3,
            tipo: isExam ? 'examen' : 'tarea',
            estado: 'pendiente',
            asignaturaId: asignatura ? asignatura.id : null,
        })
        if (creada && creada.id && taskObjetivos.length) {
            for (const objetivoId of taskObjetivos) {
                try { await objetivoTareas.vincular(objetivoId, creada.id) }
                catch (e2) { setErrorApi('Tarea creada, pero un objetivo no se pudo vincular: ' + (e2.message || '')) }
            }
        }
        if (creada && creada.id && taskProyectos.length) {
            for (const proyectoId of taskProyectos) {
                try { await proyectoTareas.vincular(proyectoId, creada.id) }
                catch (e2) { setErrorApi('Tarea creada, pero un proyecto no se pudo vincular: ' + (e2.message || '')) }
            }
        }
        setTaskProyectos([])
        setTaskObjetivos([])
        await cargar()
    } catch (e) {
        setErrorApi(e.message || 'No se pudo crear la tarea.')
    }
}

    async function quitarObjetivo(objetivoId, tareaId) {
        try {
            await objetivoTareas.desvincular(objetivoId, tareaId)
            await cargar()
        } catch (e) { setErrorApi(e.message || 'No se pudo desvincular el objetivo.') }
    }

    async function quitarProyecto(proyectoId, tareaId) {
        try {
            await proyectoTareas.desvincular(proyectoId, tareaId)
            await cargar()
        } catch (e) { setErrorApi(e.message || 'No se pudo desvincular el proyecto.') }
    }

    const toggleTask = useCallback(async id => {
        const task = tasks.find(item => item.id === id)
        if (!task) return
        try {
            await apiTareas.editar(id, { estado: task.completed ? 'pendiente' : 'completado' })
            await cargar()
        } catch (e) {
            setErrorApi(e.message || 'No se pudo actualizar la tarea.')
        }
    }, [tasks, cargar])

    const deleteTask = useCallback(async id => {
    try {
        await apiTareas.borrar(id)
        await cargar()
    } catch (e) {
        setErrorApi(e.message || 'No se pudo eliminar la tarea.')
    }
}, [cargar])

    // Holiday helpers
    async function addCustomHoliday(e) {
    e.preventDefault()
    if (!holidayName.trim() || !holidayDate) return
    try {
        await apiFestivos.crear({ fecha: holidayDate, nombre: holidayName.trim() })
        setHolidayName('')
        setHolidayDate(todayKey)
        setHolidayType('personal')
        setHolidayIsStrike(false)
        setShowHolidayForm(false)
        await cargar()
    } catch (e2) {
        setErrorApi(e2.message || 'No se pudo guardar el festivo.')
    }
}

    async function deleteCustomHoliday(id) {
    try {
        await apiFestivos.borrar(id)
        await cargar()
    } catch (e) {
        setErrorApi(e.message || 'No se pudo eliminar el festivo.')
    }
}

    function handleQuickAdd(e) {
        e.preventDefault()
        if (!quickText.trim()) return
        addTask(quickText, '', todayKey, '', false, false)
        setQuickText('')
    }

    function handleFormSubmit(e) {
        e.preventDefault()
        addTask(taskTitle, taskDescription, taskDueDate, taskAsig, taskHighPriority, taskIsExam)
        setTaskTitle('')
        setTaskDescription('')
        setTaskDueDate(todayKey)
        setTaskAsig('')
        setTaskHighPriority(false)
        setTaskIsExam(false)
        setShowForm(false)
    }

    // Filtered tasks
    const { filteredTasks, todayTasks, upcomingTasks, pastTasks, pendingCount, completedCount, examCount } = useMemo(() => {
        const filtered = []
        const todayList = []
        const upcomingList = []
        const pastList = []
        let pendingTotal = 0
        let completedTotal = 0
        let examsTotal = 0

        for (const task of tasks) {
            if (task.completed) completedTotal++
            else pendingTotal++
            if (task.isExam && !task.completed) examsTotal++
            if (filter === 'pending' && task.completed) continue
            if (filter === 'completed' && !task.completed) continue
            if (filter === 'exams' && !task.isExam) continue
            filtered.push(task)
            if (task.dueDate === todayKey) todayList.push(task)
            else if (task.dueDate > todayKey) upcomingList.push(task)
            else if (task.dueDate < todayKey) pastList.push(task)
        }

        return {
            filteredTasks: filtered,
            todayTasks: todayList,
            upcomingTasks: upcomingList,
            pastTasks: pastList,
            pendingCount: pendingTotal,
            completedCount: completedTotal,
            examCount: examsTotal,
        }
    }, [tasks, filter, todayKey])

    return (
        <div className="page-enter space-y-6">
            {errorApi && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    No se pudo conectar con la API: {errorApi}
                    <button type="button" onClick={() => cargar()} className="ml-2 underline font-medium">Reintentar</button>
                </div>
            )}
            {cargandoApi && !errorApi && (
                <div role="status" className="rounded-xl bg-surface-100 px-4 py-2 text-xs text-zinc-600">Sincronizando agenda…</div>
            )}

            <PageHeader
                title="Agenda"
                subtitle="Organiza tus tareas personales, exámenes, proyectos y festivos."
            />

            {/* Próximo examen banner */}
            {proximoExamen && (
                <div role="status" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200/80">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-rose-900 truncate">
                            {proximoExamen.title}
                        </p>
                        <p className="text-xs text-rose-700 tabular-nums">
                            {diasHastaExamen === 0 ? '¡Es hoy!' : diasHastaExamen === 1 ? 'Mañana' : `en ${diasHastaExamen} días`}
                            {proximoExamen.asignatura && ` · ${proximoExamen.asignatura}`}
                        </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100">
                        <span className={`w-2.5 h-2.5 rounded-full ${diasHastaExamen === 0 ? 'bg-rose-500' : diasHastaExamen <= 3 ? 'bg-amber-500' : 'bg-yellow-400'}`} />
                    </span>
                </div>
            )}

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="surface-card p-3.5 text-center">
                    <p className="text-xl font-semibold text-zinc-900 tabular-nums">{tasks.length}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Total</p>
                </div>
                <div className="surface-card p-3.5 text-center">
                    <p className="text-xl font-semibold text-amber-600 tabular-nums">{pendingCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Pendientes</p>
                </div>
                <div className="surface-card p-3.5 text-center">
                    <p className="text-xl font-semibold text-emerald-600 tabular-nums">{completedCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Completadas</p>
                </div>
                <div className="surface-card p-3.5 text-center">
                    <p className="text-xl font-semibold text-rose-600 tabular-nums">{examCount}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Exámenes</p>
                </div>
            </div>

            {/* Quick Add */}
            <form onSubmit={handleQuickAdd} className="flex gap-2">
                <div className="relative flex-1">
                    <label htmlFor="agenda-quick-add" className="sr-only">Añadir nota rápida para hoy</label>
                    <StickyNote size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
                    <input
                        id="agenda-quick-add"
                        type="text"
                        value={quickText}
                        onChange={e => setQuickText(e.target.value)}
                        placeholder="Añadir nota rápida para hoy…"
                        className="input-field pl-10"
                    />
                </div>
                <button type="submit" className="btn-primary px-4" disabled={!quickText.trim()} aria-label="Añadir nota rápida">
                    <Plus size={18} aria-hidden="true" />
                </button>
            </form>

            {/* Detailed form toggle */}
            {!showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-gray-400 hover:border-primary-300 hover:text-primary-600 transition-all duration-200"
                >
                    <CalendarPlus size={18} />
                    <span className="text-sm font-medium">Crear tarea / examen con fecha</span>
                </button>
            )}

            {/* Detailed form */}
            {showForm && (
                <form onSubmit={handleFormSubmit} className="glass-card p-5 space-y-4 animate-slide-up">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Sparkles size={16} className="text-primary-500" />
                            Nueva tarea
                        </h3>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-ghost p-1.5">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Título */}
                    <div>
                        <label htmlFor="agenda-task-title" className="block text-xs font-medium text-zinc-600 mb-1">Título *</label>
                        <input
                            id="agenda-task-title"
                            type="text"
                            value={taskTitle}
                            onChange={e => setTaskTitle(e.target.value)}
                            placeholder="¿Qué necesitas hacer?"
                            className="input-field"
                            autoFocus
                            required
                        />
                    </div>

                    {/* Asignatura autocomplete */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-600 mb-1">Asignatura (Plan Logopedia)</label>
                        <AsignaturaAutocomplete
                            value={taskAsig}
                            onChange={setTaskAsig}
                            placeholder="Buscar asignatura oficial…"
                        />
                    </div>

                    {/* Descripción */}
                    <div>
                        <label htmlFor="agenda-task-desc" className="block text-xs font-medium text-zinc-600 mb-1">Descripción (opcional)</label>
                        <textarea
                            id="agenda-task-desc"
                            value={taskDescription}
                            onChange={e => setTaskDescription(e.target.value)}
                            placeholder="Notas o detalles adicionales…"
                            rows={2}
                            className="input-field resize-none"
                        />
                    </div>

                    {/* Fecha */}
                    <div>
                        <label htmlFor="agenda-task-date" className="block text-xs font-medium text-zinc-600 mb-1">Fecha</label>
                        <input
                            id="agenda-task-date"
                            type="date"
                            value={taskDueDate}
                            onChange={e => setTaskDueDate(e.target.value)}
                            className="input-field"
                        />
                    </div>

                    {/* Toggles */}
                    <div className="flex gap-3">
                        {/* Alta Prioridad toggle */}
                        <button
                            type="button"
                            onClick={() => setTaskHighPriority(p => !p)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${taskHighPriority
                                ? 'bg-amber-50 border-amber-300 text-amber-700'
                                : 'bg-surface-50 border-surface-200 text-gray-400 hover:border-amber-200'
                                }`}
                        >
                            <Flag size={13} className={taskHighPriority ? 'text-amber-500' : ''} />
                            Alta Prioridad
                        </button>

                        {/* Es Examen checkbox */}
                        <button
                            type="button"
                            onClick={() => setTaskIsExam(p => !p)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${taskIsExam
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-surface-50 border-surface-200 text-gray-400 hover:border-rose-200'
                                }`}
                        >
                            <AlertTriangle size={13} className={taskIsExam ? 'text-rose-500' : ''} />
                            Examen / Entrega
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Proyectos relacionados</label>
                        {proyectosLista.length === 0 ? (
                            <p className="text-xs text-gray-400">Sin proyectos en VIDA.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {proyectosLista.map(pr => {
                                    const activo = taskProyectos.includes(pr.id)
                                    return (
                                        <button key={pr.id} type="button" aria-pressed={activo}
                                            onClick={() => setTaskProyectos(prev => activo ? prev.filter(x => x !== pr.id) : [...prev, pr.id])}
                                            className={activo ? 'px-3 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200' : 'px-3 py-1 rounded-full text-xs bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}>
                                            {pr.titulo}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Objetivos relacionados</label>
                        {objetivosLista.length === 0 ? (
                            <p className="text-xs text-gray-400">Sin objetivos en VIDA.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {objetivosLista.map(o => {
                                    const activo = taskObjetivos.includes(o.id)
                                    return (
                                        <button key={o.id} type="button" aria-pressed={activo}
                                            onClick={() => setTaskObjetivos(prev => activo ? prev.filter(x => x !== o.id) : [...prev, o.id])}
                                            className={activo ? 'px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200' : 'px-3 py-1 rounded-full text-xs bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}>
                                            {o.titulo}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="submit" className="btn-primary flex-1" disabled={!taskTitle.trim()}>
                            <Plus size={16} /> Crear tarea
                        </button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {proyectosLista.length > 0 && (
                <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)} className="input-field text-sm" aria-label="Filtrar por proyecto">
                    <option value="">Todos los proyectos</option>
                    {proyectosLista.map(pr => <option key={pr.id} value={pr.id}>{pr.titulo}</option>)}
                </select>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 bg-surface-100 p-1 rounded-xl">
                {FILTER_OPTIONS.map(opt => (
                    <button
                        key={opt.key}
                        onClick={() => setFilter(opt.key)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${filter === opt.key
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Task lists */}
            {todayTasks.length > 0 && (
                <TaskSection
                    title="Hoy"
                    icon={Sparkles}
                    tasks={todayTasks}
                    onToggle={toggleTask}
                    onDelete={deleteTask} filtroProyecto={filtroProyecto} objetivosDeTarea={objetivosDeTarea} proyectosDeTarea={proyectosDeTarea} onQuitarProyecto={quitarProyecto} onQuitarObjetivo={quitarObjetivo}
                    accent="primary"
                    today={today}
                />
            )}
            {upcomingTasks.length > 0 && (
                <TaskSection
                    title="Próximas"
                    icon={CalendarPlus}
                    tasks={upcomingTasks}
                    onToggle={toggleTask}
                    onDelete={deleteTask} filtroProyecto={filtroProyecto} objetivosDeTarea={objetivosDeTarea} proyectosDeTarea={proyectosDeTarea} onQuitarProyecto={quitarProyecto} onQuitarObjetivo={quitarObjetivo}
                    accent="blue"
                    today={today}
                />
            )}
            {pastTasks.length > 0 && (
                <TaskSection
                    title="Pasadas"
                    icon={Clock}
                    tasks={pastTasks}
                    onToggle={toggleTask}
                    onDelete={deleteTask} filtroProyecto={filtroProyecto} objetivosDeTarea={objetivosDeTarea} proyectosDeTarea={proyectosDeTarea} onQuitarProyecto={quitarProyecto} onQuitarObjetivo={quitarObjetivo}
                    accent="gray"
                    today={today}
                />
            )}

            {filteredTasks.length === 0 && (
                <div className="surface-card p-8 text-center">
                    <ListTodo size={36} className="text-zinc-300 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-zinc-500">
                        {filter === 'all' ? 'Aún no tienes tareas. Añade una arriba.'
                            : filter === 'pending' ? 'No hay tareas pendientes.'
                                : filter === 'completed' ? 'No hay tareas completadas aún.'
                                    : 'No hay exámenes registrados.'}
                    </p>
                </div>
            )}

            {/* Festivos (colapsable por defecto para priorizar tareas) */}
            <section className="pt-4 border-t border-surface-200" aria-labelledby="agenda-festivos-heading">
                <button
                    type="button"
                    aria-expanded={holidaysExpanded}
                    onClick={() => setHolidaysExpanded(!holidaysExpanded)}
                    className="w-full flex items-center justify-between gap-3 py-2 text-left rounded-xl hover:bg-surface-100/70 px-2 -mx-2 transition-colors"
                >
                    <div className="min-w-0">
                        <h2 id="agenda-festivos-heading" className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                            <CalendarHeart size={20} className="text-rose-500 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            <span>Festivos {today.getFullYear()}</span>
                            <span className="text-xs font-medium text-zinc-500 bg-surface-100 px-2 py-0.5 rounded-full tabular-nums">
                                {allHolidays.length}
                            </span>
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {nextHoliday
                                ? `Próximo: ${nextHoliday.name} (${daysUntilNext === 0 ? 'hoy' : daysUntilNext === 1 ? 'mañana' : `en ${daysUntilNext} días`})`
                                : `Comunidad de Madrid · ${today.getFullYear()}`}
                        </p>
                    </div>
                    {holidaysExpanded
                        ? <ChevronUp size={18} className="text-zinc-400 shrink-0" aria-hidden="true" />
                        : <ChevronDown size={18} className="text-zinc-400 shrink-0" aria-hidden="true" />}
                </button>

                {holidaysExpanded && (
                    <div className="space-y-4 mt-4 animate-slide-up">
                        {/* Next Holiday Card */}
                        {nextHoliday && (
                            <div className="surface-card border-l-4 border-l-rose-500 p-5 flex flex-wrap items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1">
                                        <PartyPopper size={14} aria-hidden="true" /> Próximo festivo
                                    </div>
                                    <h3 className="text-lg font-bold text-zinc-900">{nextHoliday.name}</h3>
                                    <p className="text-sm text-zinc-500 mt-0.5">{formatDateLong(nextHoliday.date)}</p>
                                </div>
                                <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-xl px-3.5 py-2 shrink-0">
                                    <Clock size={15} aria-hidden="true" />
                                    <span className="font-semibold text-sm tabular-nums">
                                        {daysUntilNext === 0 ? 'Es hoy' : daysUntilNext === 1 ? 'Mañana' : `En ${daysUntilNext} días`}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Add holiday form */}
                        {!showHolidayForm ? (
                            <button
                                type="button"
                                onClick={() => setShowHolidayForm(true)}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-200 text-zinc-500 hover:border-teal-300 hover:text-teal-700 transition-colors"
                            >
                                <Plus size={18} aria-hidden="true" />
                                <span className="text-sm font-medium">Añadir festivo / huelga</span>
                            </button>
                        ) : (
                            <form onSubmit={addCustomHoliday} className="surface-card p-5 space-y-4 animate-slide-up">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                                        <GraduationCap size={16} className="text-teal-600" aria-hidden="true" />
                                        Nuevo festivo / huelga
                                    </h3>
                                    <button type="button" onClick={() => setShowHolidayForm(false)} aria-label="Cerrar formulario" className="btn-ghost p-1.5">
                                        <X size={16} />
                                    </button>
                                </div>

                                <div>
                                    <label htmlFor="holiday-name" className="block text-xs font-medium text-zinc-600 mb-1">Nombre *</label>
                                    <input
                                        id="holiday-name"
                                        type="text"
                                        value={holidayName}
                                        onChange={e => setHolidayName(e.target.value)}
                                        placeholder="Ej: Huelga General, Día sin clase…"
                                        className="input-field"
                                        autoFocus
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="holiday-date" className="block text-xs font-medium text-zinc-600 mb-1">Fecha</label>
                                        <input
                                            id="holiday-date"
                                            type="date"
                                            value={holidayDate}
                                            onChange={e => setHolidayDate(e.target.value)}
                                            className="input-field"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="holiday-type" className="block text-xs font-medium text-zinc-600 mb-1">Tipo</label>
                                        <select
                                            id="holiday-type"
                                            value={holidayType}
                                            onChange={e => setHolidayType(e.target.value)}
                                            className="input-field"
                                        >
                                            {CUSTOM_TYPES.map(t => (
                                                <option key={t.key} value={t.key}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* ¿Es huelga? */}
                                <button
                                    type="button"
                                    aria-pressed={holidayIsStrike}
                                    onClick={() => setHolidayIsStrike(s => !s)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${holidayIsStrike
                                        ? 'bg-red-50 border-red-300 text-red-700'
                                        : 'bg-surface-50 border-surface-200 text-zinc-600 hover:border-red-200'
                                        }`}
                                >
                                    <AlertTriangle size={13} className={holidayIsStrike ? 'text-red-500' : ''} aria-hidden="true" />
                                    Marcar como Huelga General (tachará clases e inmunidad de racha)
                                </button>

                                <div className="flex gap-2 pt-1">
                                    <button type="submit" className="btn-primary flex-1" disabled={!holidayName.trim()}>
                                        <Plus size={16} /> Añadir
                                    </button>
                                    <button type="button" onClick={() => setShowHolidayForm(false)} className="btn-secondary">
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Type legend */}
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                                <div key={key} className="flex items-center gap-1.5 text-xs text-zinc-500">
                                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                </div>
                            ))}
                            <div className="flex items-center gap-1.5 text-xs text-red-500">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                Huelga
                            </div>
                        </div>

                        {/* Holidays by month */}
                        <div className="space-y-4">
                            {Object.entries(groupedByMonth).map(([monthIdx, holidays]) => (
                                <div key={monthIdx} className="surface-card overflow-hidden">
                                    <div className="px-5 py-3 bg-surface-50 border-b border-surface-200">
                                        <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                                            {MONTHS[monthIdx]}
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-surface-100">
                                        {holidays.map((h, idx) => {
                                            const cfg = TYPE_CONFIG[h.type] || TYPE_CONFIG.personal
                                            const Icon = cfg.icon
                                            const d = new Date(h.date + 'T00:00:00')
                                            const isPast = d < today
                                            const isToday = d.getTime() === today.getTime()
                                            const isStrike = h.isStrike

                                            return (
                                                <div
                                                    key={h.id || h.date + idx}
                                                    className={`flex items-center gap-4 px-5 py-3.5 transition-colors
                                                        ${isStrike ? 'bg-red-50/60' : isToday ? 'bg-primary-50/60' : 'hover:bg-surface-50'}
                                                        ${isPast ? 'opacity-55' : ''}
                                                    `}
                                                >
                                                    <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center tabular-nums
                                                        ${isStrike ? 'bg-red-100 border border-red-200' : isToday ? 'bg-primary-600 text-white' : `${cfg.bg} ${cfg.border} border`}
                                                    `}>
                                                        <span className={`text-base font-bold leading-none ${isStrike ? 'text-red-700' : isToday ? '' : cfg.text}`}>
                                                            {d.getDate()}
                                                        </span>
                                                        <span className={`text-[10px] font-medium uppercase leading-none mt-0.5 ${isStrike ? 'text-red-500' : isToday ? 'text-white/80' : 'text-zinc-500'}`}>
                                                            {d.toLocaleDateString('es-ES', { weekday: 'short' })}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-semibold truncate ${isStrike ? 'text-red-700 line-through' : isToday ? 'text-primary-700' : 'text-zinc-900'}`}>
                                                            {h.name}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <Icon size={12} className={isStrike ? 'text-red-500' : cfg.text} aria-hidden="true" />
                                                            <span className={`text-xs font-medium ${isStrike ? 'text-red-500' : cfg.text}`}>
                                                                {isStrike ? 'Huelga — clases tachadas' : cfg.label}
                                                            </span>
                                                            {h.custom && <span className="text-[11px] text-teal-600 font-medium ml-1">· Personalizado</span>}
                                                        </div>
                                                    </div>

                                                    {h.custom && (
                                                        <button
                                                            type="button"
                                                            aria-label={`Eliminar festivo ${h.name}`}
                                                            title="Eliminar festivo"
                                                            onClick={() => deleteCustomHoliday(h.id)}
                                                            className="flex-shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 size={15} aria-hidden="true" />
                                                        </button>
                                                    )}

                                                    {isToday ? (
                                                        <span className="text-xs font-bold text-primary-700 bg-primary-100 px-2.5 py-1 rounded-lg whitespace-nowrap">Hoy</span>
                                                    ) : isPast ? (
                                                        <span className="text-xs text-zinc-400">Pasado</span>
                                                    ) : !h.custom ? (
                                                        <ChevronRight size={16} className="text-zinc-300 flex-shrink-0" aria-hidden="true" />
                                                    ) : null}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="text-center py-2">
                            <p className="text-xs text-zinc-400">
                                Festivos oficiales + personalizados · Comunidad de Madrid · {today.getFullYear()}
                            </p>
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
}

// Task Section + Item
const TaskSection = memo(function TaskSection({ title, icon: Icon, tasks, onToggle, onDelete, accent, today, objetivosDeTarea, proyectosDeTarea, onQuitarProyecto, onQuitarObjetivo, filtroProyecto }) {
    // Normal tasks as text list, high-priority as visual blocks
    const visibles = filtroProyecto ? tasks.filter(t => (proyectosDeTarea?.[t.id] || []).some(pr => pr.id === filtroProyecto)) : tasks
    const normalTasks = visibles.filter(t => !t.highPriority)
    const priorityTasks = visibles.filter(t => t.highPriority)

if (filtroProyecto && visibles.length === 0) {
        return (
            <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
                <div className="glass-card px-4 py-3 text-sm text-gray-500">Sin tareas para este proyecto.</div>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                {createElement(Icon, { size: 14, className: accent === 'primary' ? 'text-primary-500' : accent === 'blue' ? 'text-blue-500' : 'text-gray-400' })} {title}
            </p>

            {/* High-priority visual blocks */}
            {priorityTasks.length > 0 && (
                <div className="space-y-2">
                    {priorityTasks.map(task => (
                        <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} accent={accent} objetivos={objetivosDeTarea ? objetivosDeTarea[task.id] : undefined} proyectos={proyectosDeTarea ? proyectosDeTarea[task.id] : undefined} onQuitarProyecto={onQuitarProyecto} onQuitarObjetivo={onQuitarObjetivo} filtroProyecto={filtroProyecto} today={today} />
                    ))}
                </div>
            )}

            {/* Normal tasks as compact text list */}
            {normalTasks.length > 0 && (
                <div className="glass-card divide-y divide-surface-100 overflow-hidden">
                    {normalTasks.map(task => (
                        <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} accent={accent} objetivos={objetivosDeTarea ? objetivosDeTarea[task.id] : undefined} proyectos={proyectosDeTarea ? proyectosDeTarea[task.id] : undefined} onQuitarProyecto={onQuitarProyecto} onQuitarObjetivo={onQuitarObjetivo} filtroProyecto={filtroProyecto} today={today} compact />
                    ))}
                </div>
            )}
        </div>
    )
})

const TaskItem = memo(function TaskItem({ task, onToggle, onDelete, accent, today, compact = false, objetivos, proyectos, onQuitarProyecto, onQuitarObjetivo }) {
    const [expanded, setExpanded] = useState(false)
    const d = new Date(task.dueDate + 'T00:00:00')
    const isToday = task.dueDate === formatDateKey(today)
    const isPast = d < today && !isToday

    if (compact) {
        return (
            <div className={`flex items-center gap-3 px-4 py-2.5 ${isPast && !task.completed ? 'opacity-60' : ''}`}>
                <button
                    type="button"
                    onClick={() => onToggle(task.id)}
                    aria-label={task.completed ? `Marcar «${task.title}» como pendiente` : `Marcar «${task.title}» como completada`}
                    aria-pressed={task.completed}
                    className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-surface-300 text-transparent hover:border-emerald-500'}`}
                >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z" /></svg>
                </button>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-800'}`}>
                        {task.title}
                        {task.asignatura && <span className="ml-1 text-xs text-indigo-600">· {task.asignatura.split(' ').slice(0, 2).join(' ')}</span>}
                        {objetivos && objetivos.length > 0 && (
                            <span className="ml-1 text-xs text-emerald-700">· Objetivo: {objetivos.map(o => o.titulo).join(' · ')} <button type="button" onClick={(ev) => { ev.stopPropagation(); onQuitarObjetivo && onQuitarObjetivo(objetivos[0].id, task.id) }} aria-label="Desvincular objetivo" className="ml-1 text-zinc-400 hover:text-red-500">×</button></span>
                        )}
                        {proyectos && proyectos.length > 0 && (
                            <span className="ml-1 text-xs text-sky-700">· Proyecto: {proyectos.map(pr => pr.titulo).join(' · ')} <button type="button" onClick={(ev) => { ev.stopPropagation(); onQuitarProyecto && onQuitarProyecto(proyectos[0].id, task.id) }} aria-label="Desvincular proyecto" className="ml-1 text-zinc-400 hover:text-red-500">×</button></span>
                        )}
                    </p>
                </div>
                {task.isExam && <span className="badge bg-rose-100 text-rose-700 shrink-0">Examen</span>}
                <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap shrink-0">{isToday ? 'Hoy' : formatDateShort(task.dueDate)}</span>
                <button type="button" aria-label={`Eliminar ${task.title}`} onClick={() => onDelete(task.id)} className="flex-shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} aria-hidden="true" />
                </button>
            </div>
        )
    }

    // Visual block para alta prioridad
    const accentColors = {
        primary: { bg: task.completed ? 'bg-emerald-50' : 'bg-amber-50/70', border: task.completed ? 'border-emerald-200' : 'border-amber-200' },
        blue: { bg: task.completed ? 'bg-emerald-50' : 'bg-amber-50/70', border: task.completed ? 'border-emerald-200' : 'border-amber-200' },
        gray: { bg: task.completed ? 'bg-emerald-50' : 'bg-amber-50/50', border: task.completed ? 'border-emerald-200' : 'border-amber-200' },
    }
    const colors = accentColors[accent] || accentColors.gray

    return (
        <div className={`${colors.bg} border ${colors.border} rounded-xl transition-colors ${isPast && !task.completed ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    type="button"
                    onClick={() => onToggle(task.id)}
                    aria-label={task.completed ? `Marcar «${task.title}» como pendiente` : `Marcar «${task.title}» como completada`}
                    className="flex-shrink-0"
                >
                    {task.completed
                        ? <CheckCircle2 size={20} className="text-emerald-600" aria-hidden="true" />
                        : <Circle size={20} className="text-amber-500 hover:text-amber-600 transition-colors" aria-hidden="true" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => task.description && setExpanded(!expanded)}>
                    <div className="flex items-center gap-2">
                        <Flag size={12} className="text-amber-600 shrink-0" aria-hidden="true" />
                        <p className={`text-sm font-semibold truncate ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>
                            {task.title}
                        </p>
                        {task.isExam && <span className="badge bg-rose-100 text-rose-700 shrink-0">Examen</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-zinc-500 tabular-nums">{isToday ? 'Hoy' : formatDateShort(task.dueDate)}</span>
                        {task.asignatura && <span className="text-xs text-indigo-600 font-medium">· {task.asignatura}</span>}
                        {objetivos && objetivos.length > 0 && (
                            <span className="text-xs text-emerald-700">· Objetivo: {objetivos.map(o => o.titulo).join(' · ')} <button type="button" onClick={(ev) => { ev.stopPropagation(); onQuitarObjetivo && onQuitarObjetivo(objetivos[0].id, task.id) }} aria-label="Desvincular objetivo" className="ml-1 text-zinc-400 hover:text-red-500">×</button></span>
                        )}
                        {proyectos && proyectos.length > 0 && (
                            <span className="text-xs text-sky-700">· Proyecto: {proyectos.map(pr => pr.titulo).join(' · ')} <button type="button" onClick={(ev) => { ev.stopPropagation(); onQuitarProyecto && onQuitarProyecto(proyectos[0].id, task.id) }} aria-label="Desvincular proyecto" className="ml-1 text-zinc-400 hover:text-red-500">×</button></span>
                        )}
                        {task.description && <span className="text-xs text-zinc-400">· {expanded ? 'Ocultar' : 'Ver más'}</span>}
                    </div>
                </div>
                <button type="button" aria-label={`Eliminar ${task.title}`} onClick={() => onDelete(task.id)} className="flex-shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} aria-hidden="true" />
                </button>
            </div>
            {expanded && task.description && (
                <div className="px-4 pb-3 pl-[48px]">
                    <p className="text-xs text-zinc-600 leading-relaxed bg-white/80 rounded-lg p-2.5 border border-surface-200">{task.description}</p>
                </div>
            )}
        </div>
    )
})

// Helpers
function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateLong(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
