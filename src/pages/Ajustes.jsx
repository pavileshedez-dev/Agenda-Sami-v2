import { useState, useEffect, useCallback, useId } from 'react'
import {
  Settings,
  Key,
  Brain,
  Download,
  Upload,
  Trash2,
  Check,
  AlertCircle,
  Shield,
  User,
  MapPin,
  GraduationCap,
  Plus,
  Database,
  CheckCircle2,
} from 'lucide-react'
import { apiIA, apiBackup } from '../lib/apiAgendaSami'
import PageHeader from '../components/ui/PageHeader'
import AppDialog, { ConfirmDialog } from '../components/ui/AppDialog'

export default function Ajustes() {
  const [config, setConfig] = useState(null)
  const [memorias, setMemorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [mensajeExito, setMensajeExito] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [estadoIntegridad, setEstadoIntegridad] = useState(null)

  // Preferencias de memoria
  const [compartirMemoria, setCompartirMemoria] = useState(true)

  // Nueva memoria manual
  const [modalMemoria, setModalMemoria] = useState(false)
  const [confirmLimpiarMem, setConfirmLimpiarMem] = useState(false)
  const fid = useId()
  const [nuevaMemoria, setNuevaMemoria] = useState({
    categoria: 'preferencias',
    asistente: 'compartida',
    clave: '',
    valor: '',
  })

  const cargarTodo = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [conf, mem] = await Promise.all([
        apiIA.obtenerConfig(),
        apiIA.listarMemorias(),
      ])
      setConfig(conf)
      setCompartirMemoria(conf.compartirMemoria)
      setMemorias(mem)
    } catch (e) {
      setError(e.message || 'Error al cargar ajustes.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  const actualizarCompartirMemoria = async (checked) => {
    setError(null)
    setMensajeExito('')
    setCompartirMemoria(checked)
    try {
      await apiIA.guardarConfig({ compartirMemoria: checked })
      setMensajeExito('Preferencia de memoria actualizada.')
      setTimeout(() => setMensajeExito(''), 3000)
    } catch (e) {
      setError(e.message || 'Error al guardar ajustes.')
      setCompartirMemoria(!checked)
    }
  }

  const crearMemoria = async (e) => {
    e.preventDefault()
    if (!nuevaMemoria.clave || !nuevaMemoria.valor) return
    try {
      await apiIA.crearMemoria(nuevaMemoria)
      setModalMemoria(false)
      setNuevaMemoria({ categoria: 'preferencias', asistente: 'compartida', clave: '', valor: '' })
      await cargarTodo()
    } catch (e) {
      setError(e.message || 'Error al guardar memoria.')
    }
  }

  const borrarMemoria = async (id) => {
    try {
      await apiIA.borrarMemoria(id)
      await cargarTodo()
    } catch (e) {
      setError(e.message || 'Error al borrar recuerdo.')
    }
  }

  const limpiarTodasMemorias = () => {
    setConfirmLimpiarMem(true)
  }

  const confirmarLimpiarMemorias = async () => {
    try {
      await apiIA.limpiarMemorias()
      setConfirmLimpiarMem(false)
      await cargarTodo()
    } catch (e) {
      setError(e.message || 'Error al limpiar memorias.')
      setConfirmLimpiarMem(false)
    }
  }

  const verificarIntegridad = async () => {
    setVerificando(true)
    setError(null)
    try {
      const res = await apiBackup.verificar()
      setEstadoIntegridad(res)
    } catch (e) {
      setError(e.message || 'Error al verificar la base de datos.')
    } finally {
      setVerificando(false)
    }
  }

  const importarBackup = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        setError(null)
        const json = JSON.parse(event.target.result)
        const res = await apiBackup.importar(json)
        setMensajeExito('Copia de seguridad restaurada correctamente. ' + (res.message || ''))
        setTimeout(() => window.location.reload(), 900)
      } catch (err) {
        setError('Error al importar archivo: ' + (err.message || 'archivo no válido'))
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="page-enter max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Ajustes"
        subtitle="Perfil, conexión con modelos de IA, memoria compartida y copias de seguridad."
      />

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle size={18} className="shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {cargando && !config && (
        <div className="p-4 text-center text-sm text-gray-400">
          Cargando configuración del sistema…
        </div>
      )}

      {mensajeExito && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
          <Check size={18} className="shrink-0 text-emerald-500" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {/* ── 1. Identidad del Usuario ── */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <User size={18} className="text-primary-600" /> Perfil de Usuario
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-surface-50 rounded-xl border border-surface-200">
            <span className="text-gray-400 block mb-1">Propietaria</span>
            <span className="font-semibold text-gray-800 text-sm">Sami</span>
          </div>
          <div className="p-3 bg-surface-50 rounded-xl border border-surface-200">
            <span className="text-gray-400 block mb-1 flex items-center gap-1">
              <GraduationCap size={13} /> Universidad
            </span>
            <span className="font-semibold text-gray-800 text-sm">UCM · Grado en Logopedia</span>
          </div>
          <div className="p-3 bg-surface-50 rounded-xl border border-surface-200">
            <span className="text-gray-400 block mb-1 flex items-center gap-1">
              <MapPin size={13} /> Ubicación Laboral
            </span>
            <span className="font-semibold text-gray-800 text-sm">Guadalajara (CLM)</span>
          </div>
        </div>
      </section>

      {/* ── 2. Claves API de Asistentes IA (solo entorno de servidor) ── */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Key size={18} className="text-amber-500" /> Conexión con Modelos de IA
          </h2>
          <span className="text-xs text-gray-400">Pibble (DeepSeek) & Capilámpara (Gemini)</span>
        </div>
        <p className="text-xs text-gray-500">
          Por seguridad, las claves API se configuran exclusivamente mediante variables de entorno del servidor (<code className="px-1 py-0.5 bg-surface-100 rounded text-[11px]">DEEPSEEK_API_KEY</code> y <code className="px-1 py-0.5 bg-surface-100 rounded text-[11px]">GEMINI_API_KEY</code>) y nunca se almacenan en SQLite ni se envían al navegador. Sin claves configuradas, ambos asistentes funcionan en modo heurístico seguro.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-3.5 bg-surface-50 rounded-xl border border-surface-200 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-800">DeepSeek (Pibble)</p>
              <p className="text-[11px] text-gray-500 font-mono">DEEPSEEK_API_KEY</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${config?.deepseekConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {config?.deepseekConfigured ? 'Conectada (entorno)' : 'No configurada'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-50 rounded-xl border border-surface-200 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-800">Google Gemini (Capilámpara)</p>
              <p className="text-[11px] text-gray-500 font-mono">GEMINI_API_KEY</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${config?.geminiConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {config?.geminiConfigured ? 'Conectada (entorno)' : 'No configurada'}
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. Memoria Compartida de mis Asistentes ── */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Brain size={18} className="text-violet-600" /> Memoria de mis Asistentes
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Conocimiento compartido entre Pibble y Capilámpara para coordinar estudios y trabajo
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setModalMemoria(true)}
              className="btn-ghost border border-surface-200 text-xs px-3 py-1.5 flex items-center gap-1"
            >
              <Plus size={14} /> Añadir dato
            </button>
            {memorias.length > 0 && (
              <button
                onClick={limpiarTodasMemorias}
                className="btn-ghost text-xs text-rose-600 hover:bg-rose-50 px-2.5 py-1.5"
              >
                Vaciar
              </button>
            )}
          </div>
        </div>

        {/* Toggle de memoria compartida */}
        <label className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl cursor-pointer border border-surface-200">
          <input
            type="checkbox"
            checked={compartirMemoria}
            onChange={(e) => actualizarCompartirMemoria(e.target.checked)}
            className="w-4 h-4 text-primary-600 rounded"
          />
          <div className="text-xs">
            <span className="font-semibold text-gray-800 block">Permitir memoria contextual compartida</span>
            <span className="text-gray-500">Pibble tendrá en cuenta tus entregas de Logopedia y Capilámpara conocerá tus turnos en Guadalajara.</span>
          </div>
        </label>

        {/* Lista de memorias */}
        {memorias.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400 bg-white rounded-xl border border-surface-100">
            No hay recuerdos almacenados todavía. Tus asistentes guardarán datos clave automáticamente o puedes añadirlos tú.
          </div>
        ) : (
          <div className="divide-y divide-surface-100 max-h-60 overflow-y-auto pr-1">
            {memorias.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                <div>
                  <span className="font-semibold text-gray-800">{m.clave}: </span>
                  <span className="text-gray-600">{m.valor}</span>
                  <span className="ml-2 text-[10px] text-gray-400 uppercase bg-surface-100 px-1.5 py-0.5 rounded">
                    {m.categoria} · {m.asistente}
                  </span>
                </div>
                <button
                  onClick={() => borrarMemoria(m.id)}
                  className="text-gray-400 hover:text-rose-600 p-1"
                  title="Eliminar este recuerdo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Copias de Seguridad y Persistencia Segura ── */}
      <section className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Shield size={18} className="text-emerald-600" /> Copias de Seguridad y Persistencia
        </h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          Tus datos se almacenan en una base de datos local SQLite independiente del código frontend. Esto garantiza que las actualizaciones futuras de la aplicación jamás sobrescriban tus tareas, horarios ni turnos.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href={apiBackup.exportarUrl()}
            download
            className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2 shadow-sm"
          >
            <Download size={15} /> Exportar JSON con Checksum
          </a>

          <a
            href={apiBackup.exportarSqliteUrl()}
            download
            className="btn-ghost border border-surface-200 text-xs px-4 py-2.5 flex items-center gap-2 hover:bg-surface-100"
          >
            <Database size={15} /> Descargar Archivo .sqlite
          </a>

          <label className="btn-ghost border border-surface-200 text-xs px-4 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-surface-100">
            <Upload size={15} /> Restaurar Backup JSON
            <input
              type="file"
              accept=".json"
              onChange={importarBackup}
              className="hidden"
            />
          </label>

          <button
            onClick={verificarIntegridad}
            disabled={verificando}
            className="btn-ghost text-xs px-3 py-2.5 text-primary-600 hover:bg-primary-50 border border-primary-200 rounded-xl"
          >
            {verificando ? 'Comprobando…' : 'Comprobar Integridad SQLite'}
          </button>
        </div>

        {estadoIntegridad && (
          <div className="p-3 bg-surface-50 border border-surface-200 rounded-xl text-xs space-y-1 mt-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-700">
              <CheckCircle2 size={15} /> Estado de la base de datos: {estadoIntegridad.ok ? 'Íntegra y coherente (OK)' : 'Problemas detectados'}
            </div>
            <div className="text-gray-500 text-[11px]">
              Verificación PRAGMA: {JSON.stringify(estadoIntegridad.integrity_check)} · Claves foráneas: {estadoIntegridad.foreign_key_violations.length === 0 ? 'Sin violaciones' : JSON.stringify(estadoIntegridad.foreign_key_violations)}
            </div>
          </div>
        )}
      </section>

      {/* ── Diálogo nativo <dialog>: Nueva Memoria Manual ── */}
      <AppDialog
        open={modalMemoria}
        onClose={() => setModalMemoria(false)}
        title="Añadir recuerdo a los asistentes"
        maxWidth="28rem"
        footer={
          <>
            <button type="button" onClick={() => setModalMemoria(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" form={`${fid}-mem`} className="btn-primary">
              Guardar recuerdo
            </button>
          </>
        }
      >
        <form id={`${fid}-mem`} onSubmit={crearMemoria} className="space-y-3.5">
          <div>
            <label htmlFor={`${fid}-clave`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Concepto o clave
            </label>
            <input
              id={`${fid}-clave`}
              type="text"
              required
              placeholder="Ej. Preferencia de estudio, horario habitual…"
              value={nuevaMemoria.clave}
              onChange={(e) => setNuevaMemoria({ ...nuevaMemoria, clave: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor={`${fid}-valor`} className="block text-xs font-semibold text-zinc-700 mb-1">
              Detalle o valor
            </label>
            <textarea
              id={`${fid}-valor`}
              required
              rows={2}
              placeholder="Ej. Prefiero no tener turnos los viernes por la tarde para repasar Logopedia…"
              value={nuevaMemoria.valor}
              onChange={(e) => setNuevaMemoria({ ...nuevaMemoria, valor: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fid}-cat`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Categoría
              </label>
              <select
                id={`${fid}-cat`}
                value={nuevaMemoria.categoria}
                onChange={(e) => setNuevaMemoria({ ...nuevaMemoria, categoria: e.target.value })}
                className="input-field"
              >
                <option value="preferencias">Preferencias</option>
                <option value="laboral">Laboral</option>
                <option value="academico">Académico</option>
                <option value="habitos">Hábitos</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${fid}-asist`} className="block text-xs font-semibold text-zinc-700 mb-1">
                Asistente
              </label>
              <select
                id={`${fid}-asist`}
                value={nuevaMemoria.asistente}
                onChange={(e) => setNuevaMemoria({ ...nuevaMemoria, asistente: e.target.value })}
                className="input-field"
              >
                <option value="compartida">Compartida</option>
                <option value="pibble">Pibble</option>
                <option value="capilampara">Capilámpara</option>
              </select>
            </div>
          </div>
        </form>
      </AppDialog>

      <ConfirmDialog
        open={confirmLimpiarMem}
        onCancel={() => setConfirmLimpiarMem(false)}
        onConfirm={confirmarLimpiarMemorias}
        title="Borrar recuerdos"
        message="¿Seguro que quieres eliminar todos los recuerdos guardados por Pibble y Capilámpara?"
        confirmLabel="Borrar todos"
        destructive
      />
    </div>
  )
}
