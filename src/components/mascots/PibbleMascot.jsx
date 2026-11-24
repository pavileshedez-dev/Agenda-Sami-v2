import { useId } from 'react'
import MascotFigure from './MascotFigure'

// Pibble en versión compacta/interactiva. Mantiene la API histórica
// (`size`, `onOpenChat`, `className`) para no romper las páginas existentes.
export default function PibbleMascot({
  size = 80,
  onOpenChat,
  className = '',
  showName = true,
  showStatus = false,
  interactive = true,
  origin: originProp,
}) {
  const generatedOrigin = useId()
  const origin = originProp || generatedOrigin
  return (
    <MascotFigure
      pet="pibble"
      size={size}
      origin={origin}
      onOpenChat={onOpenChat}
      className={className}
      showName={showName}
      showStatus={showStatus}
      interactive={interactive}
    />
  )
}
