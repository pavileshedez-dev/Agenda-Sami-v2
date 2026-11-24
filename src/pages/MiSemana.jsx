import { useState, useEffect, useCallback } from 'react'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Briefcase,
  Clock,
  Sparkles,
  CheckCircle2,
  ListTodo,
  Smile,
  AlertCircle,
  Lock,
  Unlock,
} from 'lucide-react'
import { apiSemana } from '../lib/apiAgendaSami'
import MascotAvatar from '../components/mascots/MascotAvatar'
import { sinEmojis } from '../lib/texto'
import PageHeader from '../components/ui/PageHeader'
import { ConfirmDialog } from '../components/ui/AppDialog'

export default function MiSemana() {
  const [fechaRef, setFechaRef] = useState(new Date().toISOString().slice(0, 10))
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [procesandoCierre, setProcesandoCierre] = useState(false)
  const [confirmAccion, setConfirmAccion] = useState(null) // 'cerrar' | 'reabrir' | null

  const cargarResumen = useCallback(async (f) => {
    setCargando(true)
    setError(null)
    try {
      const res = await apiSemana.resumen(f)
      setDatos(res)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el resumen de la semana.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarResumen(fechaRef)
  }, [fechaRef, cargarResumen])

  const cambiarSemana = (dias) => {
    const d = new Date(fechaRef + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    setFechaRef(d.toISOString().slice(0, 10))
  }

  const irSemanaActual = () => {
    setFechaRef(new Date().toISOString().slice(0, 10))
  }

  const ejecutarCierre = async () => {
    setProcesandoCierre(true)
    try {
      await apiSemana.cerrar({ fecha: fechaRef, notas: 'Cierre completado por Sami' })
      setConfirmAccion(null)
      await cargarResumen(fechaRef)
    } catch (e) {
      setError(e.message || 'Error al congelar la semana.')
      setConfirmAccion(null)
    } finally {
      setProcesandoCierre(false)
    }
  }

  const ejecutarReapertura = async () => {
    if (!datos?.semana?.desde) return
    setProcesandoCierre(true)
    try {
      await apiSemana.reabrir(datos.semana.desde)
      setConfirmAccion(null)
      await cargarResumen(fechaRef)
    } catch (e) {
      setError(e.message || 'Error al reabrir la semana.')
      setConfirmAccion(null)
    } finally {
      setProcesandoCierre(false)
    }
  }

  const cerrarSemana = () => setConfirmAccion('cerrar')
  const reabrirSemana = () => {
    if (!datos?.semana?.desde) return
    setConfirmAccion('reabrir')
  }

  const formatearRango = (desde, hasta) => {
    if (!desde || !hasta) return ''
    const d1 = new Date(desde + 'T12:00:00')
    const d2 = new Date(hasta + 'T12:00:00')
    const mes1 = d1.toLocaleDateString('es-ES', { month: 'short' })
    const mes2 = d2.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
    return `${d1.getDate()} ${mes1} — ${d2.getDate()} ${mes2}`
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Mi Semana"
        subtitle="Balance de universidad, trabajo y tiempo personal."
        badge={
          datos?.cerrada && (
            <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
              <Lock size={12} aria-hidden="true" /> Inmutable (Cerrada)
            </span>
          )
        }
        actions={
          <>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-surface-200">
              <button
                type="button"
                onClick={() => cambiarSemana(-7)}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-surface-100 transition-colors min-w-[34px] min-h-[34px] flex items-center justify-center"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold px-2 py-1 text-zinc-800 tabular-nums min-w-[136px] text-center">
                {datos?.semana ? formatearRango(datos.semana.desde, datos.semana.hasta) : 'Cargando…'}
              </span>
              <button
                type="button"
                onClick={() => cambiarSemana(7)}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-surface-100 transition-colors min-w-[34px] min-h-[34px] flex items-center justify-center"
                aria-label="Semana siguiente"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={irSemanaActual}
                className="text-xs font-medium text-primary-700 hover:bg-primary-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                Hoy
              </button>
            </div>
            {datos && (
              datos.cerrada ? (
                <button
                  type="button"
                  disabled={procesandoCierre}
                  onClick={reabrirSemana}
                  className="btn-secondary text-xs"
                >
                  <Unlock size={14} aria-hidden="true" /> Reabrir semana
                </button>
              ) : (
                <button
                  type="button"
                  disabled={procesandoCierre}
                  onClick={cerrarSemana}
                  className="btn-primary text-xs"
                >
                  <Lock size={14} aria-hidden="true" /> Cerrar semana
                </button>
              )
            )}
          </>
        }
      />

      <ConfirmDialog
        open={Boolean(confirmAccion)}
        onCancel={() => setConfirmAccion(null)}
        onConfirm={confirmAccion === 'cerrar' ? ejecutarCierre : ejecutarReapertura}
        title={confirmAccion === 'cerrar' ? 'Cerrar semana' : 'Reabrir semana'}
        message={
          confirmAccion === 'cerrar'
            ? 'Se guardará una instantánea inmutable de esta semana en la base de datos.'
            : 'Se reabrirá esta semana para permitir cambios y recalcular el resumen.'
        }
        confirmLabel={confirmAccion === 'cerrar' ? 'Cerrar y congelar' : 'Reabrir'}
        busy={procesandoCierre}
      />

      {datos?.cerrada && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center gap-2">
          <Lock size={15} className="shrink-0 text-emerald-600" />
          <span>
            Esta retrospectiva fue congelada el {new Date(datos.cerradoEn).toLocaleString('es-ES')}. Sus métricas están preservadas de forma inmutable frente a cambios futuros.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle size={18} className="shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {cargando && !datos ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Calculando retrospectiva semanal…
        </div>
      ) : datos ? (
        <>
          {/* ── Tarjetas Principales de Métricas ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Universidad */}
            <div className="glass-card p-5 border-l-4 border-l-blue-500 space-y-3">
              <div className="flex items-center justify-between text-blue-700">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <GraduationCap size={18} /> UCM Logopedia
                </span>
                <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full font-bold">
                  {datos.academico.horasClase}h lectivas
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-100">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{datos.academico.tareasCompletadas}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={12} className="text-emerald-500" /> Completadas
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{datos.academico.tareasPendientes}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <ListTodo size={12} className="text-amber-500" /> Pendientes
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Trabajo */}
            <div className="glass-card p-5 border-l-4 border-l-emerald-500 space-y-3">
              <div className="flex items-center justify-between text-emerald-700">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <Briefcase size={18} /> Trabajo Guadalajara
                </span>
                <span className="text-xs bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                  {datos.laboral.jornadasContadas} días
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-100">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{datos.laboral.horasTrabajadas}h</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    De {datos.laboral.horasPrevistas}h planificadas
                  </p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${datos.laboral.horasExtra > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                    +{datos.laboral.horasExtra}h
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Horas extra
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Balance de Tiempo Libre */}
            <div className="glass-card p-5 border-l-4 border-l-violet-500 space-y-3">
              <div className="flex items-center justify-between text-violet-700">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <Smile size={18} /> Balance Personal
                </span>
                <span className="text-xs bg-violet-100 px-2 py-0.5 rounded-full font-bold">
                  Equilibrio
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-100">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{datos.balance.horasLibresEstimadas}h</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tiempo disponible
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{datos.balance.horasOcupadas}h</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Total ocupado
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Reflexiones de los Asistentes ── */}
          {datos.personajes && (
            <section className="glass-card p-6 bg-gradient-to-r from-surface-50 via-white to-surface-50 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" /> Reflexión Semanal de tus Asistentes
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Comentario de Pibble */}
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-surface-200 shadow-sm">
                  <MascotAvatar pet="pibble" size={56} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-800">Pibble · Análisis Laboral</span>
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-medium">Guadalajara</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {sinEmojis(datos.personajes.pibble)}
                    </p>
                  </div>
                </div>

                {/* Comentario de Capilámpara */}
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-surface-200 shadow-sm">
                  <MascotAvatar pet="capilampara" size={56} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-amber-900">Capilámpara · Apuntes Académicos</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">UCM Logopedia</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {sinEmojis(datos.personajes.capilampara)}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Tareas completadas en la semana ── */}
          {datos.academico.listaCompletadas?.length > 0 && (
            <section className="glass-card p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" /> Entregas y Tareas Completadas ({datos.academico.listaCompletadas.length})
              </h3>
              <div className="divide-y divide-surface-100">
                {datos.academico.listaCompletadas.map((t) => (
                  <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-gray-800">{t.titulo}</span>
                      {t.asignatura && (
                        <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {t.asignatura}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400">{t.fecha_entrega}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
