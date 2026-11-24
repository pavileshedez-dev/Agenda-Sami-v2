import { useId, useState } from 'react'
import { PALETA_FAMILIAS, getSubjectColorStyles, isValidHex, normalizeHex } from '../lib/coloresAsignaturas'

const GRUPOS = [
  { id: 'todas', label: 'Todas (135)' },
  { id: 'calidos', label: 'Cálidos', familias: ['rojos', 'corales', 'naranjas', 'ambares', 'amarillos'] },
  { id: 'verdes', label: 'Verdes', familias: ['limas', 'verdes', 'mentas', 'turquesas'] },
  { id: 'azules', label: 'Azules', familias: ['azules', 'indigos'] },
  { id: 'morados', label: 'Violetas y Rosas', familias: ['violetas', 'magentas', 'rosas'] },
  { id: 'neutros', label: 'Neutros', familias: ['neutros'] },
]

export default function SelectorColor({
  valor,
  onChange,
  etiqueta = 'Color de la asignatura',
  previewLabel = '',
}) {
  const actual = normalizeHex(valor) || '#2563eb'
  const [draftHex, setDraftHex] = useState(null)
  const [grupo, setGrupo] = useState('todas')
  const [error, setError] = useState(null)
  const colorInputId = useId()
  const hexInputId = useId()

  const hexMostrado = draftHex !== null ? draftHex : actual
  const previewStyles = getSubjectColorStyles(actual)

  const familiasVisibles = grupo === 'todas'
    ? PALETA_FAMILIAS
    : PALETA_FAMILIAS.filter((f) => {
        const g = GRUPOS.find((x) => x.id === grupo)
        return g?.familias?.includes(f.id)
      })

  const elegir = (color) => {
    const limpio = normalizeHex(color)
    if (!limpio) return
    setDraftHex(null)
    setError(null)
    onChange(limpio)
  }

  const aplicarHex = () => {
    const limpio = String(hexMostrado || '').trim().toLowerCase()
    if (!isValidHex(limpio)) {
      setError('Formato no válido. Usa #RRGGBB, por ejemplo #2563eb.')
      return
    }
    setDraftHex(null)
    setError(null)
    onChange(limpio)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-700">{etiqueta}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums"
          style={previewStyles.badgeStyle}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: previewStyles.dot }}
            aria-hidden="true"
          />
          <span className="truncate max-w-[160px]">{previewLabel || actual}</span>
        </span>
      </div>

      {/* Filtro rápido por gama cromática */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar gama de colores">
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={grupo === g.id}
            onClick={() => setGrupo(g.id)}
            className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              grupo === g.id
                ? 'bg-primary-600 text-white'
                : 'bg-surface-100 text-zinc-600 hover:bg-surface-200 hover:text-zinc-900'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Paleta extensa por familias */}
      <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1 rounded-lg bg-surface-50/70 p-2 border border-surface-200">
        {familiasVisibles.map((familia) => (
          <div key={familia.id}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {familia.label}
            </p>
            <div className="grid grid-cols-9 gap-1.5">
              {familia.colores.map((color) => {
                const seleccionado = actual === color.toLowerCase()
                return (
                  <button
                    key={`${familia.id}-${color}`}
                    type="button"
                    aria-label={`${familia.label}: ${color}`}
                    aria-pressed={seleccionado}
                    title={`${familia.label} (${color})`}
                    onClick={() => elegir(color)}
                    className={
                      'h-7 w-full rounded-lg border transition-transform duration-150 hover:scale-110 ' +
                      (seleccionado
                        ? 'border-zinc-900 ring-2 ring-zinc-900/25 scale-105'
                        : 'border-black/10')
                    }
                    style={{ backgroundColor: color }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selector libre nativo + código hexadecimal */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={colorInputId}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 cursor-pointer hover:bg-surface-50"
        >
          <input
            id={colorInputId}
            type="color"
            value={actual}
            onChange={(e) => elegir(e.target.value)}
            aria-label="Selector libre de color"
            className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span>Color libre</span>
        </label>

        <input
          id={hexInputId}
          value={hexMostrado}
          onChange={(e) => setDraftHex(e.target.value)}
          onBlur={aplicarHex}
          onKeyDown={(e) => {
            if (e.nativeEvent?.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicarHex()
            }
          }}
          placeholder="#RRGGBB"
          aria-label="Código hexadecimal de color"
          className="w-28 rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-medium tabular-nums focus:border-primary-600"
        />

        <button
          type="button"
          onClick={aplicarHex}
          className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-surface-50"
        >
          Aplicar
        </button>
      </div>

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
