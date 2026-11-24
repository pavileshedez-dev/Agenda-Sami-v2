import { mascotAsset } from './assets'

// Dibuja un frame concreto de una hoja de sprites a escala entera y sin suavizado.
export default function PixelSprite({
  sheet,
  state = 'idle',
  frame = 0,
  scale = 2,
  flip = false,
  file,
  className = '',
  style,
  ...rest
}) {
  const stateMeta = sheet.states?.[state] || sheet.states?.idle || Object.values(sheet.states || {})[0]
  if (!stateMeta) return null
  const frames = stateMeta.frames
  const safeFrame = ((Math.trunc(frame) % frames) + frames) % frames
  const width = sheet.frameWidth * scale
  const height = sheet.frameHeight * scale
  const source = file || sheet.file

  return (
    <div
      {...rest}
      aria-hidden="true"
      className={`pixel-sprite ${className}`}
      data-state={state}
      data-frame={safeFrame}
      style={{
        width,
        height,
        backgroundImage: `url("${mascotAsset(source)}")`,
        backgroundSize: `${sheet.columns * sheet.frameWidth * scale}px ${sheet.rows * sheet.frameHeight * scale}px`,
        backgroundPosition: `${-safeFrame * width}px ${-stateMeta.row * height}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        transform: flip ? 'scaleX(-1)' : undefined,
        flex: 'none',
        ...style,
      }}
    />
  )
}

// Igual que PixelSprite pero para tiras de frames (lámpara, brillo, Zzz...).
export function PixelStrip({ sheet, frame = 0, scale = 2, className = '', style, ...rest }) {
  const frames = sheet.frames
  const safeFrame = ((Math.trunc(frame) % frames) + frames) % frames
  const width = sheet.frameWidth * scale
  const height = sheet.frameHeight * scale
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={`pixel-sprite ${className}`}
      data-frame={safeFrame}
      style={{
        width,
        height,
        backgroundImage: `url("${mascotAsset(sheet.file)}")`,
        backgroundSize: `${frames * width}px ${height}px`,
        backgroundPosition: `${-safeFrame * width}px 0px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        flex: 'none',
        ...style,
      }}
    />
  )
}
