import { useState, useEffect, useCallback, useId, useMemo } from 'react'
import {
  Clock,
  Calendar,
  AlertCircle,
  Plus,
  Trash2,
  MapPin,
  Sparkles,
} from 'lucide-react'
import { apiTrabajo } from '../lib/apiAgendaSami'
import { formatShortDate } from '../lib/formatters'
import PageHeader from '../components/ui/PageHeader'
import AppDialog, { ConfirmDialog } from '../components/ui/AppDialog'

export default function Trabajo() {
  const [jornadas, setJornadas] = useState([])
  const [turnos, setTurnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const formId = useId()

  // Modales
  const [modalTurnoAbierto, setModalTurnoAbierto] = useState(false)
  const [nuevoTurno, setNuevoTurno] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    hora_inicio: '09:00',
    hora_fin: '17:00',
    tipo_turno: 'ordinario',
    notas: '',
  })

  const [modalJornadaManual, setModalJornadaManual] = useState(false)
  const [nuevaJornada, setNuevaJornada] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    hora_entrada: '09:00:00',
    hora_salida: '17:00:00',
    pausa_minutos: 30,
    notas: '',
  })

  // Confirmación accesible (reemplaza window.confirm)
  const [itemAEliminar, setItemAEliminar] = useState(null) // { tipo: 'turno' | 'jornada', id, label }

  // Selector y Diálogo de Discontinuidad Horaria (DST Europe/Madrid)
  const [dstModal, setDstModal] = useState({
    abierto: false,
    tipo: null, // 'HORA_INEXISTENTE_DST' | 'HORA_AMBIGUA_DST'
    frontera: null, // 'entrada' | 'salida'
    mensaje: '',
    opciones: [],
    seleccion: null, // Selección explícita obligatoria por usuario (sin auto-selección)
    datosJornada: null,
  })
  const [notificacionDst, setNotificacionDst] = useState(null)

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [jor, tur] = await Promise.all([
        apiTrabajo.listarJornadas(),
        apiTrabajo.listarTurnos(),
      ])
      setJornadas(jor)
      setTurnos(tur)
    } catch (e) {
      setError(e.message || 'Error al cargar los datos de trabajo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const resumenTrabajo = useMemo(() => {
    const horasPrevistas = turnos.reduce((acc, t) => acc + (Number(t.horas_previstas) || 0), 0)
    const horasReales = jornadas.reduce((acc, j) => acc + (Number(j.horas_reales) || 0), 0)
    const horasExtra = jornadas.reduce((acc, j) => acc + (Number(j.horas_extra) || 0), 0)
    return {
      horasPrevistas: Math.round(horasPrevistas * 100) / 100,
      horasReales: Math.round(horasReales * 100) / 100,
      horasExtra: Math.round(horasExtra * 100) / 100,
    }
  }, [turnos, jornadas])

  const crearTurno = async (e) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      await apiTrabajo.crearTurno(nuevoTurno)
      setModalTurnoAbierto(false)
      await cargarDatos()
    } catch (e) {
      setError(e.message || 'Error al programar turno.')
    } finally {
      setOcupado(false)
    }
  }

  const crearJornadaManual = async (e) => {
    if (e) e.preventDefault()
    setOcupado(true)
    setError(null)
    setNotificacionDst(null)
    try {
      const res = await apiTrabajo.crearJornada(nuevaJornada)
      setModalJornadaManual(false)
      if (res && res.info_dst && res.info_dst.esTransicionDst) {
        setNotificacionDst({
          tipo: 'info',
          mensaje: `Jornada guardada con ajuste DST. Horas reales trabajadas: ${res.horas_reales}h · Horas contractuales nominales: ${res.horas_contractuales}h.`,
        })
      }
      await cargarDatos()
    } catch (e) {
      if (e.code === 'HORA_INEXISTENTE_DST' || e.code === 'HORA_AMBIGUA_DST') {
        setDstModal({
          abierto: true,
          tipo: e.code,
          frontera: e.frontera || (e.detalles && e.detalles.frontera) || 'entrada',
          mensaje: (e.detalles && e.detalles.mensaje) || e.message,
          opciones: (e.detalles && e.detalles.opciones) || [],
          seleccion: null,
          datosJornada: { ...nuevaJornada },
        })
      } else {
        setError(e.message || 'Error al registrar jornada manual.')
      }
    } finally {
      setOcupado(false)
    }
  }

  const confirmarEleccionDst = async () => {
    if (!dstModal.seleccion || !dstModal.datosJornada) return
    setOcupado(true)
    setError(null)
    try {
      const payload = {
        ...dstModal.datosJornada,
      }
      if (dstModal.frontera === 'entrada') {
        payload.dst_eleccion_entrada = dstModal.seleccion
      } else if (dstModal.frontera === 'salida') {
        payload.dst_eleccion_salida = dstModal.seleccion
      } else {
        payload.dst_eleccion = dstModal.seleccion
      }

      const res = await apiTrabajo.crearJornada(payload)
      setDstModal({
        abierto: false,
        tipo: null,
        frontera: null,
        mensaje: '',
        opciones: [],
        seleccion: null,
        datosJornada: null,
      })
      setModalJornadaManual(false)
      if (res) {
        setNotificacionDst({
          tipo: 'success',
          mensaje: `Fichaje confirmado con ajuste horario. Duración real: ${res.horas_reales}h · Duración contractual: ${res.horas_contractuales}h.`,
        })
      }
      await cargarDatos()
    } catch (e) {
      if (e.code === 'HORA_INEXISTENTE_DST' || e.code === 'HORA_AMBIGUA_DST') {
        setDstModal({
          abierto: true,
          tipo: e.code,
          frontera: e.frontera || (e.detalles && e.detalles.frontera) || 'salida',
          mensaje: (e.detalles && e.detalles.mensaje) || e.message,
          opciones: (e.detalles && e.detalles.opciones) || [],
          seleccion: null,
          datosJornada: {
            ...dstModal.datosJornada,
            ...(dstModal.frontera === 'entrada' ? { dst_eleccion_entrada: dstModal.seleccion } : {}),
            ...(dstModal.frontera === 'salida' ? { dst_eleccion_salida: dstModal.seleccion } : {}),
          },
        })
      } else {
        setError(e.message || 'Error al confirmar el ajuste horario.')
      }
    } finally {
      setOcupado(false)
    }
  }

  const cancelarDstDialog = () => {
    setDstModal({
      abierto: false,
      tipo: null,
      frontera: null,
      mensaje: '',
      opciones: [],
      seleccion: null,
      datosJornada: null,
    })
  }

  const confirmarBorrado = async () => {
    if (!itemAEliminar) return
    setOcupado(true)
    try {
      if (itemAEliminar.tipo === 'turno') {
        await apiTrabajo.borrarTurno(itemAEliminar.id)
      } else {
        await apiTrabajo.borrarJornada(itemAEliminar.id)
      }
      setItemAEliminar(null)
      await cargarDatos()
    } catch (e) {
      setError(e.message || 'No se pudo eliminar el registro.')
      setItemAEliminar(null)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Jornadas y turnos"
        documentTitle="Trabajo"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-zinc-400" aria-hidden="true" />
            Guadalajara, Castilla-La Mancha
          </span>
        }
        actions={
          <>
            <button type="button" onClick={() => setModalJornadaManual(true)} className="btn-secondary">
              <Clock size={15} aria-hidden="true" />
              <span>Registrar jornada</span>
            </button>
            <button type="button" onClick={() => setModalTurnoAbierto(true)} className="btn-primary">
              <Plus size={16} aria-hidden="true" />
              <span>Planificar turno</span>
            </button>
          </>
        }
      />

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2.5">
          <AlertCircle size={17} className="shrink-0 text-red-600" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {cargando && jornadas.length === 0 && turnos.length === 0 && (
        <div role="status" className="py-2 text-xs text-zinc-500">
          Sincronizando turnos y jornadas…
        </div>
      )}

      {/* ── Resumen compacto (sin temporizador en vivo) ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Resumen laboral">
        <div className="surface-card px-4 py-3.5">
          <p className="text-xs font-medium text-zinc-500">Turnos previstos</p>
          <p className="text-xl font-semibold text-zinc-900 tabular-nums mt-0.5">
            {turnos.length} <span className="text-xs font-normal text-zinc-500">· {resumenTrabajo.horasPrevistas}h</span>
          </p>
        </div>
        <div className="surface-card px-4 py-3.5">
          <p className="text-xs font-medium text-zinc-500">Jornadas registradas</p>
          <p className="text-xl font-semibold text-zinc-900 tabular-nums mt-0.5">
            {jornadas.length} <span className="text-xs font-normal text-zinc-500">· {resumenTrabajo.horasReales}h reales</span>
          </p>
        </div>
        <div className="surface-card px-4 py-3.5">
          <p className="text-xs font-medium text-zinc-500">Horas extra acumuladas</p>
          <p className="text-xl font-semibold text-zinc-900 tabular-nums mt-0.5">
            {resumenTrabajo.horasExtra > 0 ? `+${resumenTrabajo.horasExtra}h` : '0h'}
          </p>
        </div>
      </section>

      {/* ── Turnos Previstos y Jornadas Completadas en 2 columnas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="space-y-3" aria-labelledby="trabajo-turnos">
          <div className="flex items-center justify-between">
            <h2 id="trabajo-turnos" className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <Calendar size={17} className="text-primary-600" aria-hidden="true" /> Turnos previstos
            </h2>
            <span className="text-xs text-zinc-500 tabular-nums">{turnos.length} registrados</span>
          </div>

          {turnos.length === 0 ? (
            <div className="surface-card p-6 text-center text-sm text-zinc-500">
              No tienes turnos programados. Pulsa «Planificar turno» para añadir uno.
            </div>
          ) : (
            <div className="surface-card divide-y divide-surface-100 overflow-hidden">
              {turnos.slice(0, 10).map((t) => (
                <div key={t.id} className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-surface-50/70 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-900 text-sm tabular-nums">{formatShortDate(t.fecha, { forceYear: true })}</span>
                      <span className="badge bg-primary-50 text-primary-700 uppercase tracking-wide text-[10.5px]">
                        {t.tipo_turno}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                      {t.hora_inicio} – {t.hora_fin} ({t.horas_previstas}h)
                      {t.notas ? ` · ${t.notas}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItemAEliminar({ tipo: 'turno', id: t.id, label: `el turno del ${t.fecha}` })}
                    className="btn-ghost p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    aria-label={`Eliminar turno del ${t.fecha}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="trabajo-jornadas">
          <div className="flex items-center justify-between">
            <h2 id="trabajo-jornadas" className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <Clock size={17} className="text-emerald-600" aria-hidden="true" /> Jornadas completadas
            </h2>
            <span className="text-xs text-zinc-500 tabular-nums">{jornadas.length} fichajes</span>
          </div>

          {notificacionDst && (
            <div role="status" aria-live="polite" className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-600 shrink-0" aria-hidden="true" />
                <span>{notificacionDst.mensaje}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotificacionDst(null)}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {jornadas.length === 0 ? (
            <div className="surface-card p-6 text-center text-sm text-zinc-500">
              No hay jornadas completadas registradas.
            </div>
          ) : (
            <div className="surface-card divide-y divide-surface-100 overflow-hidden">
              {jornadas.slice(0, 10).map((j) => (
                <div key={j.id} className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-surface-50/70 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-zinc-900 text-sm tabular-nums mr-1">{formatShortDate(j.fecha, { forceYear: true })}</span>
                      <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                        {j.horas_reales ?? j.horas_trabajadas}h reales
                      </span>
                      {j.horas_contractuales !== undefined && j.horas_contractuales !== null && (
                        <span className="badge bg-surface-100 text-zinc-700 border border-surface-200 tabular-nums">
                          {j.horas_contractuales}h contractuales
                        </span>
                      )}
                      {j.dst_eleccion && (
                        <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200">
                          DST: {j.dst_eleccion}
                        </span>
                      )}
                      {j.horas_extra > 0 && (
                        <span className="badge bg-amber-50 text-amber-800 border border-amber-200 tabular-nums">
                          +{j.horas_extra}h extra
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                      {j.hora_entrada} → {j.hora_salida || 'En curso'} · Pausa: {j.pausa_minutos || 0} min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItemAEliminar({ tipo: 'jornada', id: j.id, label: `la jornada del ${j.fecha}` })}
                    className="btn-ghost p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    aria-label={`Eliminar jornada del ${j.fecha}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Diálogo nativo <dialog>: Planificar Turno ── */}
      <AppDialog
        open={modalTurnoAbierto}
        onClose={() => setModalTurnoAbierto(false)}
        title="Planificar turno de trabajo"
        maxWidth="28rem"
        footer={
          <>
            <button type="button" onClick={() => setModalTurnoAbierto(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" form={`${formId}-turno`} disabled={ocupado} className="btn-primary">
              {ocupado ? 'Guardando…' : 'Guardar turno'}
            </button>
          </>
        }
      >
        <form id={`${formId}-turno`} onSubmit={crearTurno} className="space-y-3.5">
          <div>
            <label htmlFor={`${formId}-t-fecha`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Fecha
            </label>
            <input
              id={`${formId}-t-fecha`}
              type="date"
              required
              value={nuevoTurno.fecha}
              onChange={(e) => setNuevoTurno({ ...nuevoTurno, fecha: e.target.value })}
              className="input-field tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-t-hi`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Hora inicio
              </label>
              <input
                id={`${formId}-t-hi`}
                type="time"
                required
                value={nuevoTurno.hora_inicio}
                onChange={(e) => setNuevoTurno({ ...nuevoTurno, hora_inicio: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-t-hf`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Hora fin
              </label>
              <input
                id={`${formId}-t-hf`}
                type="time"
                required
                value={nuevoTurno.hora_fin}
                onChange={(e) => setNuevoTurno({ ...nuevoTurno, hora_fin: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-t-tipo`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Tipo de turno
            </label>
            <select
              id={`${formId}-t-tipo`}
              value={nuevoTurno.tipo_turno}
              onChange={(e) => setNuevoTurno({ ...nuevoTurno, tipo_turno: e.target.value })}
              className="input-field"
            >
              <option value="ordinario">Ordinario</option>
              <option value="mañana">Mañana</option>
              <option value="tarde">Tarde</option>
              <option value="noche">Noche</option>
              <option value="guardia">Guardia</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-t-notas`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Notas (opcional)
            </label>
            <input
              id={`${formId}-t-notas`}
              type="text"
              placeholder="Centro de trabajo u observaciones…"
              value={nuevoTurno.notas}
              onChange={(e) => setNuevoTurno({ ...nuevoTurno, notas: e.target.value })}
              className="input-field"
            />
          </div>
        </form>
      </AppDialog>

      {/* ── Diálogo nativo <dialog>: Jornada Manual ── */}
      <AppDialog
        open={modalJornadaManual}
        onClose={() => setModalJornadaManual(false)}
        title="Registrar fichaje pasado"
        maxWidth="28rem"
        footer={
          <>
            <button type="button" onClick={() => setModalJornadaManual(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" form={`${formId}-jornada`} disabled={ocupado} className="btn-primary">
              {ocupado ? 'Guardando…' : 'Guardar fichaje'}
            </button>
          </>
        }
      >
        <form id={`${formId}-jornada`} onSubmit={crearJornadaManual} className="space-y-3.5">
          <div>
            <label htmlFor={`${formId}-j-fecha`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Fecha
            </label>
            <input
              id={`${formId}-j-fecha`}
              type="date"
              required
              value={nuevaJornada.fecha}
              onChange={(e) => setNuevaJornada({ ...nuevaJornada, fecha: e.target.value })}
              className="input-field tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-j-hi`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Hora entrada
              </label>
              <input
                id={`${formId}-j-hi`}
                type="time"
                step="1"
                required
                value={nuevaJornada.hora_entrada}
                onChange={(e) => setNuevaJornada({ ...nuevaJornada, hora_entrada: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-j-hf`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Hora salida
              </label>
              <input
                id={`${formId}-j-hf`}
                type="time"
                step="1"
                required
                value={nuevaJornada.hora_salida}
                onChange={(e) => setNuevaJornada({ ...nuevaJornada, hora_salida: e.target.value })}
                className="input-field tabular-nums"
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-j-pausa`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Pausa (minutos)
            </label>
            <input
              id={`${formId}-j-pausa`}
              type="number"
              min="0"
              value={nuevaJornada.pausa_minutos}
              onChange={(e) => setNuevaJornada({ ...nuevaJornada, pausa_minutos: Number(e.target.value) })}
              className="input-field tabular-nums"
            />
          </div>
        </form>
      </AppDialog>

      {/* ── Diálogo nativo <dialog>: Selector DST (Europe/Madrid) ── */}
      <AppDialog
        open={dstModal.abierto}
        onClose={cancelarDstDialog}
        closeOnBackdrop={false}
        title="Resolución de cambio horario (Europe/Madrid)"
        subtitle={dstModal.mensaje}
        maxWidth="33rem"
        icon={
          <div
            className={`p-2 rounded-xl ${
              dstModal.tipo === 'HORA_INEXISTENTE_DST'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            <Clock size={20} aria-hidden="true" />
          </div>
        }
        footer={
          <>
            <button type="button" onClick={cancelarDstDialog} className="btn-secondary">
              Volver y corregir
            </button>
            <button
              type="button"
              disabled={!dstModal.seleccion || ocupado}
              onClick={confirmarEleccionDst}
              className="btn-primary"
            >
              Confirmar y guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`badge font-semibold ${
                dstModal.tipo === 'HORA_INEXISTENTE_DST'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-indigo-100 text-indigo-900'
              }`}
            >
              {dstModal.tipo === 'HORA_INEXISTENTE_DST'
                ? 'Transición de primavera · Hora inexistente'
                : 'Transición de otoño · Hora ambigua'}
            </span>
            {dstModal.frontera && (
              <span className="badge bg-surface-100 text-zinc-700 border border-surface-200">
                {dstModal.frontera === 'entrada' ? 'Hora de entrada' : 'Hora de salida'}
              </span>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-zinc-700 mb-2">
              Selecciona cómo registrar esta jornada:
            </legend>
            {dstModal.opciones.map((op) => {
              const seleccionada = dstModal.seleccion === op.clave
              return (
                <label
                  key={op.clave}
                  className={`block cursor-pointer p-3.5 rounded-xl border transition-colors flex items-start gap-3 ${
                    seleccionada
                      ? 'border-primary-600 bg-primary-50/60 ring-1 ring-primary-600'
                      : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="dst-choice"
                    value={op.clave}
                    checked={seleccionada}
                    onChange={() => setDstModal((prev) => ({ ...prev, seleccion: op.clave }))}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-surface-300"
                  />
                  <div className="flex-1 text-xs min-w-0">
                    <div className="font-semibold text-zinc-900 capitalize flex flex-wrap items-center gap-2">
                      <span>{op.clave}</span>
                      {op.horaAjustada && (
                        <span className="font-mono tabular-nums text-primary-700 bg-primary-100/80 px-1.5 py-0.5 rounded text-[11px]">
                          Ajuste a: {op.horaAjustada}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-600 mt-0.5 leading-snug">{op.descripcion}</p>
                  </div>
                </label>
              )
            })}
          </fieldset>

          <div className="bg-surface-50 p-3 rounded-xl border border-surface-200 text-xs text-zinc-600 flex items-start gap-2">
            <AlertCircle size={15} className="text-zinc-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Esta elección es vinculante para el cálculo exacto de horas reales en nómina y registro horario oficial.
            </span>
          </div>
        </div>
      </AppDialog>

      <ConfirmDialog
        open={Boolean(itemAEliminar)}
        onCancel={() => setItemAEliminar(null)}
        onConfirm={confirmarBorrado}
        title={itemAEliminar?.tipo === 'turno' ? 'Eliminar turno' : 'Eliminar jornada'}
        message={itemAEliminar ? `¿Seguro que quieres eliminar ${itemAEliminar.label}?` : ''}
        confirmLabel="Eliminar"
        destructive
        busy={ocupado}
      />
    </div>
  )
}
