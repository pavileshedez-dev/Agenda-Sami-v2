import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react'
import { asignaturas as apiAsignaturas, horarios as apiHorarios } from '../lib/apiCalendario'
import { ASIGNATURAS, normalizeText } from '../lib/asignaturas'
import { getDefaultSubjectHex, getSubjectColorStyles, normalizeHex } from '../lib/coloresAsignaturas'
import { Plus, Trash2, BookOpen } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import AppDialog from '../components/ui/AppDialog'
import SelectorColor from '../components/SelectorColor'

// ════════════════════════════════════════
// Autocomplete tipo RENFE para asignaturas
// ════════════════════════════════════════
function AsignaturaAutocomplete({ value, onChange, inputId }) {
    const [query, setQuery] = useState(value || '')
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef(null)
    const listId = useId()

    const suggestions = useMemo(() => {
        if (!query.trim()) return ASIGNATURAS
        const q = normalizeText(query)
        return ASIGNATURAS.filter(a => normalizeText(a).includes(q))
    }, [query])

    useEffect(() => {
        function handleClick(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
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
        onChange('')
        setOpen(true)
    }

    function handleBlur() {
        const exact = ASIGNATURAS.find(a => normalizeText(a) === normalizeText(query))
        if (exact) { onChange(exact); setQuery(exact) }
    }

    const isValid = ASIGNATURAS.includes(value)

    return (
        <div ref={wrapperRef} className="relative">
            <BookOpen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
                id={inputId}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                value={query}
                onChange={handleChange}
                onFocus={() => setOpen(true)}
                onBlur={handleBlur}
                placeholder="Buscar asignatura oficial…"
                className={`input-field pl-9 font-medium ${!isValid && query.length > 1 ? 'border-red-300' : ''}`}
                autoComplete="off"
                required
            />
            {open && (
                <ul id={listId} role="listbox" className="absolute z-50 w-full mt-1 bg-white border border-surface-200 rounded-xl shadow-elevated max-h-60 overflow-y-auto">
                    {suggestions.length > 0 ? suggestions.map(a => (
                        <li key={a}>
                            <button
                                type="button"
                                onMouseDown={() => select(a)}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                            >
                                {a}
                            </button>
                        </li>
                    )) : (
                        <li className="px-4 py-3 text-sm text-red-400">
                            Aviso: no coincide con ninguna asignatura oficial
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7:00 - 20:00

const aHora = (valor) => {
    const s = String(valor)
    if (s.includes(':')) return s.padStart(5, '0')
    return String(Number(s)).padStart(2, '0') + ':00'
}

export default function Horario() {
    const [classes, setClasses] = useState([])
    const [asignaturasApi, setAsignaturasApi] = useState([])
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [errorApi, setErrorApi] = useState(null)
    const [conflicto, setConflicto] = useState(null)
    const [showModal, setShowModal] = useState(() =>
        Boolean(typeof window !== 'undefined' && window.history.state?.usr?.openModal)
    )
    const [editClass, setEditClass] = useState(null)
    const [clickedSlot, setClickedSlot] = useState(null)

    const aClase = (h, nombrePorId, colorPorId) => {
        const subjectName = nombrePorId.get(h.asignatura_id) || h.asignatura_id || ''
        const rawColor = normalizeHex(colorPorId.get(h.asignatura_id))
        const colorHex = rawColor && rawColor !== '#6b7280' ? rawColor : getDefaultSubjectHex(subjectName)
        return {
            id: h.id,
            subject: subjectName,
            asignaturaId: h.asignatura_id,
            room: h.aula || '',
            day: Number(h.dia_semana) - 1,
            startHour: Number(String(h.hora_inicio).split(':')[0]),
            endHour: Number(String(h.hora_fin).split(':')[0]),
            horaInicioTexto: String(h.hora_inicio),
            horaFinTexto: String(h.hora_fin),
            color: colorHex,
            professor: '',
        }
    }

    const cargar = useCallback(async () => {
        setCargando(true)
        setErrorApi(null)
        try {
            const [listaAsig, listaHor] = await Promise.all([apiAsignaturas.listar(), apiHorarios.listar()])
            const nombrePorId = new Map(listaAsig.map(a => [a.id, a.nombre]))
            const colorPorId = new Map(listaAsig.map(a => [a.id, a.color]))
            setAsignaturasApi(listaAsig)
            setClasses(listaHor.map(h => aClase(h, nombrePorId, colorPorId)))
        } catch (e) {
            setErrorApi(e.message || 'No se pudo cargar el horario desde la API.')
        } finally {
            setCargando(false)
        }
    }, [])

    useEffect(() => { cargar() }, [cargar])

    const idDeAsignatura = (nombre) => {
        const a = asignaturasApi.find(x => String(x.nombre).toLocaleLowerCase() === String(nombre || '').toLocaleLowerCase())
        return a ? a.id : null
    }

    // Adaptador modelo visual -> API. El backend valida y detecta conflictos.
    const aPayload = (cls) => ({
        asignaturaId: cls.asignaturaId || idDeAsignatura(cls.subject),
        aula: cls.room || null,
        diaSemana: Number(cls.day) + 1,
        horaInicio: aHora(cls.horaInicioTexto || cls.startHour),
        horaFin: aHora(cls.horaFinTexto || cls.endHour),
    })

    async function saveClass(cls) {
        setConflicto(null)
        if (!ASIGNATURAS.includes(cls.subject)) {
            setConflicto('La asignatura no pertenece al Plan de Logopedia.')
            return false
        }
        const payload = aPayload(cls)
        if (!payload.asignaturaId) {
            setConflicto('La asignatura no existe en la base central. Créala primero en Universidad.')
            return false
        }
        setConflicto(null)
        setGuardando(true)
        setErrorApi(null)
        try {
            if (editClass) await apiHorarios.editar(editClass.id, payload)
            else await apiHorarios.crear(payload)
            if (cls.color && normalizeHex(cls.color)) {
                await apiAsignaturas.editar(payload.asignaturaId, { color: normalizeHex(cls.color) }).catch(() => {})
            }
            setEditClass(null)
            setShowModal(false)
            setClickedSlot(null)
            await cargar()
            return true
        } catch (e) {
            if (e.code === 'CONFLICTO_HORARIO') {
                setConflicto('Ese horario se solapa con otra clase. Ajusta la hora o el día y vuelve a guardar.')
            } else {
                setConflicto(e.message || 'No se pudo guardar la clase.')
            }
            return false
        } finally {
            setGuardando(false)
        }
    }

    async function deleteClass(id) {
        setConflicto(null)
        setGuardando(true)
        setErrorApi(null)
        try {
            await apiHorarios.borrar(id)
            await cargar()
        } catch (e) {
            setErrorApi(e.message || 'No se pudo eliminar la clase.')
        } finally {
            setGuardando(false)
        }
    }

function handleSlotClick(dayIdx, hour) {
        const existing = classes.find(c =>
            c.day === dayIdx && hour >= c.startHour && hour < c.endHour
        )
        if (existing) {
            setEditClass(existing)
            setClickedSlot(null)
        } else {
            setClickedSlot({ day: dayIdx, hour })
            setEditClass(null)
        }
        setShowModal(true)
    }

    return (
        <div className="page-enter space-y-6">
            {(cargando || guardando) && (
                <div role="status" className="rounded-xl bg-surface-100 px-4 py-2 text-xs text-zinc-600">Sincronizando horario…</div>
            )}
            {errorApi && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{errorApi}</div>
            )}
            <PageHeader
                title="Horario de clases"
                subtitle="Haz clic en una celda para añadir o editar una clase."
                actions={
                    <button
                        type="button"
                        onClick={() => { setEditClass(null); setClickedSlot(null); setShowModal(true) }}
                        className="btn-primary"
                    >
                        <Plus size={16} aria-hidden="true" /> Añadir clase
                    </button>
                }
            />

            {/* ── Desktop Grid View ── */}
            <div className="hidden md:block glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                        {/* Header row */}
                        <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-surface-200">
                            <div className="p-3 bg-surface-50" />
                            {DAYS.map(day => (
                                <div key={day} className="p-3 text-center text-sm font-semibold text-gray-600 bg-surface-50 border-l border-surface-200">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Time rows */}
                        {HOURS.map(hour => (
                            <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-surface-100 last:border-b-0">
                                <div className="p-2 text-xs text-gray-400 font-medium text-right pr-3 bg-surface-50/50 flex items-start justify-end pt-1">
                                    {String(hour).padStart(2, '0')}:00
                                </div>
                                {DAYS.map((_, dayIdx) => {
                                    const cls = classes.find(c =>
                                        c.day === dayIdx && hour >= c.startHour && hour < c.endHour
                                    )
                                    const isStart = cls && cls.startHour === hour
                                    const isContinuation = cls && cls.startHour !== hour

                                    if (isContinuation) return (
                                        <div key={dayIdx} className="border-l border-surface-100" />
                                    )

                                    const color = cls ? getSubjectColorStyles(cls.color || cls.subject) : null

                                    return (
                                        <div
                                            key={dayIdx}
                                            className="border-l border-surface-100 relative min-h-[48px] cursor-pointer hover:bg-primary-50/30 transition-colors"
                                            onClick={() => handleSlotClick(dayIdx, hour)}
                                        >
                                            {isStart && (
                                                <div
                                                    className="absolute inset-x-1 top-0.5 rounded-lg border px-2 py-1.5 z-10 transition-shadow hover:shadow-card-hover group"
                                                    style={{
                                                        height: `${(cls.endHour - cls.startHour) * 48 - 4}px`,
                                                        backgroundColor: color.bg,
                                                        borderColor: color.border,
                                                        color: color.text,
                                                    }}
                                                    onClick={(e) => { e.stopPropagation(); setEditClass(cls); setShowModal(true) }}
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold truncate leading-tight" style={{ color: color.text }}>
                                                                {cls.subject}
                                                            </p>
                                                            {cls.room && (
                                                                <p className="text-[10px] opacity-75 mt-0.5 truncate" style={{ color: color.text }}>
                                                                    {cls.room}
                                                                </p>
                                                            )}
                                                            <p className="text-[10px] opacity-65 mt-0.5 tabular-nums" style={{ color: color.text }}>
                                                                {String(cls.startHour).padStart(2, '0')}:00 — {String(cls.endHour).padStart(2, '0')}:00
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            aria-label={`Eliminar clase de ${cls.subject}`}
                                                            onClick={(e) => { e.stopPropagation(); deleteClass(cls.id) }}
                                                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/60 transition-all"
                                                        >
                                                            <Trash2 size={11} style={{ color: color.text }} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Mobile Card View ── */}
            <div className="md:hidden space-y-4">
                {DAYS.map((day, dayIdx) => {
                    const dayClasses = classes
                        .filter(c => c.day === dayIdx)
                        .sort((a, b) => a.startHour - b.startHour)

                    return (
                        <div key={day} className="glass-card overflow-hidden">
                            <div className="px-4 py-2.5 bg-surface-50 border-b border-surface-200">
                                <h3 className="text-sm font-semibold text-gray-600">{day}</h3>
                            </div>
                            {dayClasses.length === 0 ? (
                                <button
                                    onClick={() => { setClickedSlot({ day: dayIdx, hour: 8 }); setEditClass(null); setShowModal(true) }}
                                    className="w-full p-4 text-sm text-gray-400 text-center hover:bg-surface-50 transition-colors"
                                >
                                    + Añadir clase
                                </button>
                            ) : (
                                <div className="divide-y divide-surface-100">
                                    {dayClasses.map(cls => {
                                        const color = getSubjectColorStyles(cls.color || cls.subject)
                                        return (
                                            <div
                                                key={cls.id}
                                                onClick={() => { setEditClass(cls); setShowModal(true) }}
                                                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors group"
                                            >
                                                <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: color.dot }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-700 truncate">{cls.subject}</p>
                                                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                                        <span className="tabular-nums">{String(cls.startHour).padStart(2, '0')}:00 — {String(cls.endHour).padStart(2, '0')}:00</span>
                                                        {cls.room && <span>· {cls.room}</span>}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    aria-label={`Eliminar clase de ${cls.subject}`}
                                                    onClick={(e) => { e.stopPropagation(); deleteClass(cls.id) }}
                                                    className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )
                                    })}
                                    <button
                                        onClick={() => { setClickedSlot({ day: dayIdx, hour: 8 }); setEditClass(null); setShowModal(true) }}
                                        className="w-full p-2.5 text-xs text-gray-400 text-center hover:bg-surface-50 transition-colors"
                                    >
                                        + Añadir otra clase
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ── Legend ── */}
            {classes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {[...new Set(classes.map(c => c.subject))].map(subject => {
                        const cls = classes.find(c => c.subject === subject)
                        const color = getSubjectColorStyles(cls?.color || subject)
                        return (
                            <span
                                key={subject}
                                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                                style={color.badgeStyle}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} aria-hidden="true" />
                                <span>{subject}</span>
                            </span>
                        )
                    })}
                </div>
            )}

            {/* ── Modal ── */}
            {showModal && (
                <ClassModal
                    cls={editClass}
                    asignaturasApi={asignaturasApi}
                    defaultDay={clickedSlot?.day}
                    defaultHour={clickedSlot?.hour}
                    onSave={saveClass}
                    error={conflicto}
                    onDelete={editClass ? () => { deleteClass(editClass.id); setShowModal(false); setEditClass(null) } : null}
                    onClose={() => { setShowModal(false); setEditClass(null); setClickedSlot(null) }}
                />
            )}
        </div>
    )
}

function ClassModal({ cls, asignaturasApi, defaultDay, defaultHour, onSave, onDelete, onClose, error }) {
    const [subject, setSubject] = useState(cls?.subject || '')
    const [room, setRoom] = useState(cls?.room || '')
    const [day, setDay] = useState(cls?.day ?? defaultDay ?? 0)
    const [startHour, setStartHour] = useState(cls?.startHour ?? defaultHour ?? 8)
    const [endHour, setEndHour] = useState(cls?.endHour ?? (defaultHour ? defaultHour + 1 : 9))
    const [color, setColor] = useState(cls?.color || getDefaultSubjectHex(cls?.subject || ''))
    const [professor, setProfessor] = useState(cls?.professor || '')
    const [localError, setLocalError] = useState('')
    const fid = useId()

    function handleSubjectChange(nextSubject) {
        setSubject(nextSubject)
        setLocalError('')
        if (nextSubject) {
            const match = (asignaturasApi || []).find(
                (a) => String(a.nombre).toLocaleLowerCase() === nextSubject.toLocaleLowerCase()
            )
            const saved = normalizeHex(match?.color)
            setColor(saved && saved !== '#6b7280' ? saved : getDefaultSubjectHex(nextSubject))
        }
    }

    function handleSubmit(e) {
        e.preventDefault()
        if (!subject || !ASIGNATURAS.includes(subject)) {
            setLocalError('Selecciona una asignatura oficial del Plan de Logopedia.')
            return
        }
        if (startHour >= endHour) {
            setLocalError('La hora de fin debe ser posterior a la hora de inicio.')
            return
        }
        setLocalError('')
        onSave({ subject, room: room.trim(), day, startHour: Number(startHour), endHour: Number(endHour), color, professor: professor.trim() })
    }

    return (
        <AppDialog
            open
            onClose={onClose}
            title={cls ? 'Editar clase' : 'Nueva clase'}
            maxWidth="32rem"
            footer={
                <div className="flex items-center justify-between w-full gap-2">
                    <div>
                        {onDelete && (
                            <button type="button" onClick={onDelete} className="btn-ghost text-red-600 hover:bg-red-50">
                                <Trash2 size={14} aria-hidden="true" /> Eliminar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                        <button type="submit" form={`${fid}-form`} className="btn-primary">
                            {cls ? 'Guardar' : 'Añadir'}
                        </button>
                    </div>
                </div>
            }
        >
            <form id={`${fid}-form`} onSubmit={handleSubmit} className="space-y-4">
                {(error || localError) && (
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {error || localError}
                    </div>
                )}

                <div>
                    <label htmlFor={`${fid}-asig`} className="block text-xs font-semibold text-zinc-700 mb-1">
                        Asignatura (Plan Logopedia)
                    </label>
                    <AsignaturaAutocomplete inputId={`${fid}-asig`} value={subject} onChange={handleSubjectChange} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor={`${fid}-room`} className="block text-xs font-semibold text-zinc-700 mb-1">Aula</label>
                        <input
                            id={`${fid}-room`}
                            type="text"
                            placeholder="Ej. A-201"
                            value={room}
                            onChange={e => setRoom(e.target.value)}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor={`${fid}-prof`} className="block text-xs font-semibold text-zinc-700 mb-1">Profesor/a</label>
                        <input
                            id={`${fid}-prof`}
                            type="text"
                            placeholder="Nombre"
                            value={professor}
                            onChange={e => setProfessor(e.target.value)}
                            className="input-field"
                        />
                    </div>
                </div>

                <div>
                    <span className="block text-xs font-semibold text-zinc-700 mb-2">Día de la semana</span>
                    <div className="flex gap-1.5" role="group" aria-label="Día de la semana">
                        {DAYS_SHORT.map((d, i) => (
                            <button
                                key={i}
                                type="button"
                                aria-pressed={day === i}
                                onClick={() => setDay(i)}
                                className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${
                                    day === i ? 'bg-primary-600 text-white' : 'bg-surface-100 text-zinc-600 hover:bg-surface-200'
                                }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor={`${fid}-hi`} className="block text-xs font-semibold text-zinc-700 mb-1">Hora inicio</label>
                        <select
                            id={`${fid}-hi`}
                            value={startHour}
                            onChange={e => { setStartHour(Number(e.target.value)); if (Number(e.target.value) >= endHour) setEndHour(Number(e.target.value) + 1) }}
                            className="input-field tabular-nums"
                        >
                            {HOURS.map(h => (
                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${fid}-hf`} className="block text-xs font-semibold text-zinc-700 mb-1">Hora fin</label>
                        <select id={`${fid}-hf`} value={endHour} onChange={e => setEndHour(Number(e.target.value))} className="input-field tabular-nums">
                            {HOURS.filter(h => h > startHour).map(h => (
                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                            ))}
                            <option value={21}>21:00</option>
                        </select>
                    </div>
                </div>

                <div className="rounded-xl border border-surface-200 bg-surface-50/40 p-3">
                    <SelectorColor
                        valor={color}
                        onChange={setColor}
                        etiqueta="Color de la asignatura"
                        previewLabel={subject || 'Vista previa'}
                    />
                </div>
            </form>
        </AppDialog>
    )
}
