import { useEffect } from 'react'

/**
 * Cabecera unificada de página.
 * Garantiza un único <h1> por vista y sincroniza document.title (WCAG 2.4.2).
 */
export default function PageHeader({
  title,
  documentTitle,
  subtitle,
  badge,
  actions,
}) {
  useEffect(() => {
    const label = documentTitle || (typeof title === 'string' ? title : '')
    document.title = label ? `${label} · Agenda Sami` : 'Agenda Sami'
  }, [title, documentTitle])

  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl sm:text-[1.625rem] font-semibold text-zinc-900 tracking-tight leading-tight">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <div className="text-sm text-zinc-500 leading-relaxed">
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  )
}
