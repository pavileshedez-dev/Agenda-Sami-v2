import { useState, useMemo, useEffect, useCallback, memo, useId } from 'react'
import { asignaturas as apiAsignaturas, tareas as apiTareas, tiposTarea as apiTipos } from '../lib/apiCalendario'
import { ASIGNATURAS } from '../lib/asignaturas'
import { getDefaultSubjectHex, getSubjectColorStyles, resolveSubjectHex } from '../lib/coloresAsignaturas'
import SelectorColor from '../components/SelectorColor'
import PageHeader from '../components/ui/PageHeader'
import AppDialog from '../components/ui/AppDialog'
import {
    Plus,
    Calendar,
    Trash2,
    GripVertical,
    Filter,
    ClipboardList,
    FileText,
    BookOpen,
    BookPlus,
    Palette,
    Check,
} from 'lucide-react'

const COLUMNS = [
    { id: 'pendiente', title: 'Pendiente', color: 'bg-amber-400' },
    { id: 'en-curso', title: 'En curso', color: 'bg-blue-400' },
    { id: 'completado', title: 'Completado', color: 'bg-emerald-400' },
]

const TIPOS = [
    { id: 'tarea', label: 'Tarea', icon: ClipboardList },
    { id: 'entrega', label: 'Entrega', icon: FileText },
    { id: 'apunte', label: 'Apunte', icon: BookOpen },
]

function getTipoLabel(tipo) {
    return TIPOS.find(t => t.id === tipo)?.label || tipo || 'Tarea'
}

function getTipoValue(label) {
    return TIPOS.find(t => t.label.toLocaleLowerCase() === label.trim().toLocaleLowerCase())?.id || label.trim()
}

export default function Universidad() {
    const [tasks, setTasks] = useState([])
    const [asignaturas, setAsignaturas] = useState([])
    const [customTypes, setCustomTypes] = useState([])
    const [idsAsignatura, setIdsAsignatura] = useState({})
    const [coloresAsignatura, setColoresAsignatura] = useState({})
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [errorApi, setErrorApi] = useState(null)
    const [showModal, setShowModal] = useState(() =>
        typeof window !== 'undefined' && Boolean(window.history.state?.usr?.openModal)
    )
    const [showSubjectsModal, setShowSubjectsModal] = useState(false)
    const [editTask, setEditTask] = useState(null)
    const [filterAsignatura, setFilterAsignatura] = useState('Todas')
    const [draggedId, setDraggedId] = useState(null)

    // Fuente de verdad: SQLite vía API.
    const cargar = useCallback(async () => {
        setCargando(true)
        setErrorApi(null)
        try {
            const [listaAsig, listaTareas, listaTipos] = await Promise.all([
                apiAsignaturas.listar(),
                apiTareas.listar(),
                apiTipos.listar().catch(() => []),
            ])
            const nombrePorId = new Map(listaAsig.map(a => [a.id, a.nombre]))
            setAsignaturas(listaAsig.map(a => a.nombre))
            setIdsAsignatura(Object.fromEntries(listaAsig.map(a => [a.nombre, a.id])))
            setColoresAsignatura(Object.fromEntries(listaAsig.map(a => [a.nombre, a.color || getDefaultSubjectHex(a.nombre)])))
            setTasks(listaTareas.map(t => ({
                id: t.id,
                title: t.titulo,
                description: t.notas || t.descripcion || '',
                asignatura: nombrePorId.get(t.asignatura_id) || t.asignatura_nombre || t.asignatura || '',
                asignaturaId: t.asignatura_id || null,
                tipo: t.tipo || 'tarea',
                status: t.estado || 'pendiente',
                dueDate: t.fecha_entrega || '',
                priority: t.prioridad || 3,
            })))
            const base = new Set(TIPOS.map(x => x.label.toLocaleLowerCase()))
            setCustomTypes(listaTipos.filter(x => !base.has(String(x.etiqueta).toLocaleLowerCase())).map(x => x.etiqueta))
        } catch (e) {
            setErrorApi(e.message || 'No se pudo cargar el calendario desde la API.')
        } finally {
            setCargando(false)
        }
    }, [])

    useEffect(() => { cargar() }, [cargar])

    const filteredTasks = useMemo(() => filterAsignatura === 'Todas'
        ? tasks
        : tasks.filter(t => t.asignatura === filterAsignatura), [tasks, filterAsignatura])

    const tasksByColumn = useMemo(() => {
        const grouped = Object.fromEntries(COLUMNS.map(column => [column.id, []]))
        for (const task of filteredTasks) {
            if (grouped[task.status]) grouped[task.status].push(task)
        }
        return grouped
    }, [filteredTasks])

    const idAsignatura = useCallback((nombre) => {
        const clave = Object.keys(idsAsignatura).find(
            (k) => k.toLocaleLowerCase() === String(nombre || '').toLocaleLowerCase(),
        )
        return clave ? idsAsignatura[clave] : null
    }, [idsAsignatura])

    const addOrUpdateTask = useCallback(async task => {
        const tipo = getTipoValue(task.tipo)
        const payload = {
            titulo: task.title,
            notas: task.description || null,
            tipo,
            estado: task.status,
            fechaEntrega: task.dueDate || null,
            prioridad: task.priority || 3,
            asignaturaId: task.asignaturaId || idAsignatura(task.asignatura),
        }
        setGuardando(true)
        setErrorApi(null)
        try {
            if (editTask) await apiTareas.editar(editTask.id, payload)
            else await apiTareas.crear(payload)
            if (!TIPOS.some(x => x.id === tipo) && !customTypes.some(c => c.toLocaleLowerCase() === tipo.toLocaleLowerCase())) {
                await apiTipos.crear({ etiqueta: tipo }).catch(() => {})
            }
            setEditTask(null)
            setShowModal(false)
            await cargar()
        } catch (e) {
            setErrorApi(e.message || 'No se pudo guardar la tarea.')
        } finally {
            setGuardando(false)
        }
    }, [editTask, customTypes, idAsignatura, cargar])

    const addSubject = useCallback(async (subject, color) => {
        const trimmedSubject = String(subject || '').trim()
        if (!trimmedSubject) return false
        if (asignaturas.some(a => a.toLocaleLowerCase() === trimmedSubject.toLocaleLowerCase())) return false
        setGuardando(true)
        setErrorApi(null)
        try {
            await apiAsignaturas.crear({ nombre: trimmedSubject, color: color || '#2563eb' })
            await cargar()
            return true
        } catch (e) {
            setErrorApi(e.message || 'No se pudo crear la asignatura.')
            return false
        } finally {
            setGuardando(false)
        }
    }, [asignaturas, cargar])

    const cambiarColor = useCallback(async (nombre, color) => {
        const id = idsAsignatura[nombre]
        if (!id) { setErrorApi('No se encontró la asignatura en la base central.'); return false }
        setGuardando(true)
        setErrorApi(null)
        try {
            await apiAsignaturas.editar(id, { color })
            await cargar()
            return true
        } catch (e) {
            setErrorApi(e.message || 'No se pudo cambiar el color.')
            return false
        } finally {
            setGuardando(false)
        }
    }, [idsAsignatura, cargar])

    const deleteTask = useCallback(async id => {
        setGuardando(true)
        setErrorApi(null)
        try {
            await apiTareas.borrar(id)
            await cargar()
        } catch (e) {
            setErrorApi(e.message || 'No se pudo eliminar la tarea.')
        } finally {
            setGuardando(false)
        }
    }, [cargar])

    const handleEditTask = useCallback(task => {
        setEditTask(task)
        setShowModal(true)
    }, [])

    const handleDragStart = useCallback(id => {
        setDraggedId(id)
    }, [])

    const handleDrop = useCallback(async targetStatus => {
        if (!draggedId) return
        setGuardando(true)
        setErrorApi(null)
        try {
            await apiTareas.editar(draggedId, { estado: targetStatus })
            setDraggedId(null)
            await cargar()
        } catch (e) {
            setErrorApi(e.message || 'No se pudo mover la tarea.')
        } finally {
            setGuardando(false)
        }
    }, [draggedId, cargar])

    return (
        <div className="page-enter space-y-6">
            {(cargando || guardando) && (<div role="status" className="rounded-xl bg-surface-100 px-4 py-2 text-xs text-zinc-600">Sincronizando datos universitarios…</div>)}
            {errorApi && (<div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{errorApi}</div>)}
            <PageHeader
                title="Universidad"
                subtitle="Organiza tus tareas, entregas y apuntes por asignatura."
                actions={
                    <>
                        <button type="button" onClick={() => setShowSubjectsModal(true)} className="btn-secondary">
                            <BookPlus size={16} aria-hidden="true" /> Asignaturas
                        </button>
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" aria-hidden="true" />
                            <select
                                aria-label="Filtrar por asignatura"
                                value={filterAsignatura}
                                onChange={e => setFilterAsignatura(e.target.value)}
                                className="input-field pl-8 pr-4 py-2 w-44"
                            >
                                <option value="Todas">Todas</option>
                                {asignaturas.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>
                        <button type="button" onClick={() => { setEditTask(null); setShowModal(true) }} className="btn-primary">
                            <Plus size={16} aria-hidden="true" /> Nueva tarea
                        </button>
                    </>
                }
            />

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {COLUMNS.map(col => (
                    <div
                        key={col.id}
                        className="space-y-3"
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(col.id)}
                    >
                        {/* Column Header */}
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                            <h3 className="text-sm font-semibold text-gray-600">{col.title}</h3>
                            <span className="badge bg-surface-100 text-gray-500">
                                {tasksByColumn[col.id].length}
                            </span>
                        </div>

                        {/* Cards */}
                        <div className="space-y-2.5 min-h-[80px] rounded-xl bg-surface-50/50 p-2">
                            {tasksByColumn[col.id].map(task => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    colorHex={resolveSubjectHex(task.asignatura, coloresAsignatura)}
                                    onEdit={handleEditTask}
                                    onDelete={deleteTask}
                                    onDragStart={handleDragStart}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <TaskModal
                    task={editTask}
                    asignaturas={asignaturas.length > 0 ? asignaturas : ASIGNATURAS}
                    customTypes={customTypes}
                    onSave={addOrUpdateTask}
                    onClose={() => { setShowModal(false); setEditTask(null) }}
                />
            )}
            {showSubjectsModal && (
                <SubjectsModal
                    colores={coloresAsignatura}
                    onColor={cambiarColor}
                    asignaturas={asignaturas.length > 0 ? asignaturas : ASIGNATURAS}
                    onAdd={addSubject}
                    onClose={() => setShowSubjectsModal(false)}
                />
            )}
        </div>
    )
}

const TaskCard = memo(function TaskCard({ task, colorHex, onEdit, onDelete, onDragStart }) {
    const TipoIcon = TIPOS.find(t => t.id === task.tipo)?.icon || ClipboardList
    const tipoLabel = getTipoLabel(task.tipo)
    const colorStyles = getSubjectColorStyles(colorHex || task.asignatura)

    return (
        <div
            draggable
            onDragStart={() => onDragStart(task.id)}
            onClick={() => onEdit(task)}
            className="glass-card-hover p-4 cursor-pointer group"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold max-w-full"
                            style={colorStyles.badgeStyle}
                        >
                            <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: colorStyles.dot }}
                                aria-hidden="true"
                            />
                            <span className="truncate">{task.asignatura || 'General'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                            <TipoIcon size={13} aria-hidden="true" />
                            <span className="truncate">{tipoLabel}</span>
                        </span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-800 truncate">{task.title}</h4>
                    {task.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                    )}
                    {task.dueDate && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                            <Calendar size={11} />
                            {new Date(task.dueDate).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                            })}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                    <GripVertical size={14} className="text-zinc-300" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onDelete(task.id) }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors"
                        aria-label={`Eliminar ${task.title}`}
                    >
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    )
})

function TaskModal({ task, asignaturas, customTypes, onSave, onClose }) {
    const [title, setTitle] = useState(task?.title || '')
    const [description, setDescription] = useState(task?.description || '')
    const [asignatura, setAsignatura] = useState(task?.asignatura || (asignaturas[0] || ASIGNATURAS[0]))
    const [tipo, setTipo] = useState(getTipoLabel(task?.tipo))
    const [status, setStatus] = useState(task?.status || 'pendiente')
    const [dueDate, setDueDate] = useState(task?.dueDate || '')
    const fid = useId()

    function handleSubmit(e) {
        e.preventDefault()
        if (!title.trim()) return
        if (!tipo.trim()) return
        onSave({ title: title.trim(), description: description.trim(), asignatura, tipo: tipo.trim(), status, dueDate })
    }

    return (
        <AppDialog
            open
            onClose={onClose}
            title={task ? 'Editar tarea' : 'Nueva tarea universitaria'}
            maxWidth="32rem"
            footer={
                <>
                    <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button type="submit" form={`${fid}-form`} className="btn-primary">
                        {task ? 'Guardar cambios' : 'Crear tarea'}
                    </button>
                </>
            }
        >
            <form id={`${fid}-form`} onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor={`${fid}-title`} className="block text-xs font-semibold text-zinc-700 mb-1">Título</label>
                    <input
                        id={`${fid}-title`}
                        type="text"
                        placeholder="Ej. Práctica audiometría tonal"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        className="input-field font-medium"
                        required
                    />
                </div>

                <div>
                    <label htmlFor={`${fid}-desc`} className="block text-xs font-semibold text-zinc-700 mb-1">Descripción (opcional)</label>
                    <textarea
                        id={`${fid}-desc`}
                        placeholder="Notas o requisitos de la entrega…"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        className="input-field resize-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor={`${fid}-asig`} className="block text-xs font-semibold text-zinc-700 mb-1">Asignatura</label>
                        <select id={`${fid}-asig`} value={asignatura} onChange={e => setAsignatura(e.target.value)} className="input-field">
                            {asignaturas.map(a => <option key={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${fid}-tipo`} className="block text-xs font-semibold text-zinc-700 mb-1">Tipo</label>
                        <input
                            id={`${fid}-tipo`}
                            type="text"
                            value={tipo}
                            onChange={e => setTipo(e.target.value)}
                            list={`${fid}-types`}
                            className="input-field"
                            placeholder="Tarea, Entrega, Apunte…"
                            required
                        />
                        <datalist id={`${fid}-types`}>
                            {[...TIPOS.map(t => t.label), ...customTypes].map(t => (
                                <option key={t} value={t} />
                            ))}
                        </datalist>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor={`${fid}-status`} className="block text-xs font-semibold text-zinc-700 mb-1">Estado</label>
                        <select id={`${fid}-status`} value={status} onChange={e => setStatus(e.target.value)} className="input-field">
                            {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${fid}-due`} className="block text-xs font-semibold text-zinc-700 mb-1">Fecha de entrega</label>
                        <input
                            id={`${fid}-due`}
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            className="input-field tabular-nums"
                        />
                    </div>
                </div>
            </form>
        </AppDialog>
    )
}

function SubjectsModal({ asignaturas, colores, onColor, onAdd, onClose }) {
    const [modo, setModo] = useState('editar') // 'editar' | 'nueva'
    const [seleccionada, setSeleccionada] = useState(asignaturas[0] || '')
    const [colorEdicion, setColorEdicion] = useState(() =>
        resolveSubjectHex(asignaturas[0] || '', colores)
    )
    const [subject, setSubject] = useState('')
    const [colorNueva, setColorNueva] = useState('#7c3aed')
    const [feedback, setFeedback] = useState('')
    const [error, setError] = useState('')
    const fid = useId()

    function elegirAsignatura(nombre) {
        setSeleccionada(nombre)
        setColorEdicion(resolveSubjectHex(nombre, colores))
        setFeedback('')
        setError('')
    }

    async function guardarColorExistente(nuevoHex) {
        setColorEdicion(nuevoHex)
        if (!seleccionada || !onColor) return
        setFeedback('')
        setError('')
        const ok = await onColor(seleccionada, nuevoHex)
        if (ok) {
            setFeedback(`Color actualizado para ${seleccionada}.`)
        }
    }

    async function handleSubmitNueva(e) {
        e.preventDefault()
        if (!subject.trim()) return
        const creada = await onAdd(subject, colorNueva)
        if (!creada) {
            setError('Esa asignatura ya está en la lista.')
            return
        }
        setFeedback(`Asignatura «${subject.trim()}» añadida.`)
        setSubject('')
        setError('')
    }

    return (
        <AppDialog open onClose={onClose} title="Asignaturas y colores" maxWidth="36rem">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-1 p-1 bg-surface-100 rounded-xl" role="tablist" aria-label="Gestión de asignaturas">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={modo === 'editar'}
                        onClick={() => { setModo('editar'); setError(''); setFeedback('') }}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                            modo === 'editar' ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                    >
                        <Palette size={14} aria-hidden="true" />
                        Personalizar colores
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={modo === 'nueva'}
                        onClick={() => { setModo('nueva'); setError(''); setFeedback('') }}
                        className={`py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                            modo === 'nueva' ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                    >
                        <Plus size={14} aria-hidden="true" />
                        Nueva asignatura
                    </button>
                </div>

                {modo === 'editar' ? (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-medium text-zinc-500 mb-2">
                                Selecciona una asignatura para cambiar su color ({asignaturas.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                                {asignaturas.map(a => {
                                    const hex = resolveSubjectHex(a, colores)
                                    const styles = getSubjectColorStyles(hex)
                                    const active = a === seleccionada
                                    return (
                                        <button
                                            key={a}
                                            type="button"
                                            onClick={() => elegirAsignatura(a)}
                                            aria-pressed={active}
                                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                                active ? 'ring-2 ring-zinc-900/25 shadow-sm scale-[1.01]' : 'opacity-90 hover:opacity-100'
                                            }`}
                                            style={styles.badgeStyle}
                                        >
                                            <span
                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: styles.dot }}
                                                aria-hidden="true"
                                            />
                                            <span className="truncate max-w-[220px]">{a}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {seleccionada && (
                            <div className="rounded-xl border border-surface-200 bg-white p-3.5">
                                <SelectorColor
                                    valor={colorEdicion}
                                    onChange={guardarColorExistente}
                                    etiqueta="Elige un color (se guarda al instante)"
                                    previewLabel={seleccionada}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <form onSubmit={handleSubmitNueva} className="space-y-2">
                            <label htmlFor={`${fid}-name`} className="block text-xs font-semibold text-zinc-700">
                                Nombre de la nueva asignatura
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id={`${fid}-name`}
                                    type="text"
                                    value={subject}
                                    onChange={e => { setSubject(e.target.value); setError('') }}
                                    placeholder="Ej. Fonética y Fonología"
                                    className="input-field"
                                    required
                                />
                                <button type="submit" className="btn-primary shrink-0">
                                    <Plus size={16} aria-hidden="true" /> Añadir
                                </button>
                            </div>
                        </form>
                        <div className="rounded-xl border border-surface-200 bg-white p-3.5">
                            <SelectorColor
                                valor={colorNueva}
                                onChange={setColorNueva}
                                etiqueta="Color de la nueva asignatura"
                                previewLabel={subject.trim() || 'Vista previa'}
                            />
                        </div>
                    </div>
                )}

                {feedback && (
                    <p role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <Check size={14} aria-hidden="true" /> {feedback}
                    </p>
                )}
                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            </div>
        </AppDialog>
    )
}
