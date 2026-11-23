import { useId } from 'react'
import MascotFigure from './MascotFigure'

// Capilámpara en versión compacta/interactiva, con lámpara propia.
export default function CapilamparaMascot({
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
      pet="capilampara"
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
