import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Primitiva de diálogo modal basada en el elemento nativo <dialog> + .showModal().
 * Cumple Modern Web Guidance (dialog & accessibility):
 * - Top-layer nativo (elimina colisiones z-index y fallos de margen)
 * - Inercia automática del fondo y retorno del foco al cerrar
 * - Cierre con Esc y clic en ::backdrop, overscroll-behavior: contain
 */
export default function AppDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidth = '32rem',
  closeOnBackdrop = true,
  hideCloseButton = false,
  children,
  footer,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const previousFocusRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      previousFocusRef.current = document.activeElement
      if (!dialog.open) {
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }

    return () => {
      if (!open) return
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous && previous.isConnected) {
        // El <dialog> se desmonta al cerrar; devolvemos el foco al disparador.
        requestAnimationFrame(() => previous.focus())
      }
    }
  }, [open])

  const handleCancel = (e) => {
    e.preventDefault()
    if (onClose) onClose()
  }

  const handleBackdropClick = (e) => {
    if (!closeOnBackdrop) return
    if (e.target === dialogRef.current && onClose) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      style={{ '--dialog-max-w': maxWidth }}
      aria-labelledby={title ? titleId : undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-200 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-zinc-900 leading-snug">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {!hideCloseButton && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mr-1.5 -mt-1 text-zinc-400 hover:text-zinc-700 shrink-0"
            aria-label="Cerrar diálogo"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-6 py-5 overflow-y-auto flex-1">
        {children}
      </div>

      {footer && (
        <div className="px-6 py-4 border-t border-surface-200 bg-surface-50/70 flex items-center justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </dialog>
  )
}

/**
 * Diálogo de confirmación accesible que reemplaza a window.confirm().
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  busy = false,
}) {
  return (
    <AppDialog
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      maxWidth="26rem"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              destructive
                ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors min-h-[40px] disabled:opacity-50'
                : 'btn-primary'
            }
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
    </AppDialog>
  )
}
