# Archivos excluidos y justificación

## Excluidos del paquete

| Ruta / patrón | Motivo |
|---|---|
| `server/data/agenda_sami.sqlite` | Base real; nunca se empaqueta |
| `server/data/backups_auto/` | Backups personales |
| `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm` | Datos persistentes |
| `.env`, `.env.*` (excepto `.env.example`) | Secretos |
| `node_modules/` | Dependencias instalables; no se versionan |
| `dist/` | Se reconstruye con `npm run build` |
| `public/sprites-backup-20261114/` | Copia antigua de sprites |
| `public/sprites/preview.html` | Herramienta de revisión, no runtime |
| `public/mascots/v4/` | Recursos antiguos no referenciados por el cliente actual |
| `public/logo.app.jpg` | Fuente de diseño; el runtime usa `logo.png` |
| `public/vite.svg`, `public/favicon.svg` | No referenciados por el cliente actual |
| `mascots-art/` | Arte fuente y paquetes de revisión; no runtime |
| `referencias/` | Referencias artísticas |
| `visual-review/`, `visual-review-modernizacion/` | Revisiones y capturas |
| `docs/` de desarrollo, `INFORME_MASCOTAS.md` | Documentación no necesaria para ejecutar |
| `tests/`, `scripts/audit-*`, `scripts/verify-*` | Herramientas de desarrollo/QA |
| `Calendario/` | Proyecto original independiente; sin dependencia de ejecución |
| `Agents/`, `.agents/` | No referenciados por el código de Agenda Sami |
| `.backup_safety_reference_20261116/`, `.build_src/` | Copias de seguridad/scratch |
| `.vscode/`, capturas, logs, cachés | Entorno local |

## Dependencias externas encontradas

### Runtime del servidor

Sólo módulos nativos de Node:

- `node:http`, `node:fs`, `node:path`, `node:url`
- `node:crypto`
- `node:sqlite`
- `node:os`
- `node:readline` (sólo script de inicialización)

No hay paquetes npm importados por `server/`.

### Cliente/compilación

- `react`, `react-dom`, `react-router-dom`
- `lucide-react`
- `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`
- `tailwindcss`, `postcss`, `autoprefixer`
- `eslint` y plugins (sólo si se usa lint; no necesario para build)
- `sharp` (dev; no se usa en runtime)

### Servicios externos opcionales

- DeepSeek API, sólo si `DEEPSEEK_API_KEY` está configurada.
- Google Gemini API, sólo si `GEMINI_API_KEY` está configurada.
- Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) desde el HTML.

Sin claves, la aplicación usa el modo heurístico local.

### Sin dependencia de

- `Agents/`, `.agents/`, Skills.
- `Calendario/` original.
- `mascots-art/`, `referencias/` ni scripts de generación.
- Base de datos de demostración.

## Recursos incluidos

- `public/sprites/`: hojas actuales de Pibble/Capilámpara, lámpara, luz,
  partículas, suelo, bocadillo y `manifest.json`.
- `public/mascots/pixel-v5/`: frames pixel art actuales referenciados por
  `src/components/mascots/pixelManifest.js`.
- Iconos/logo: `logo.png`, `pwa-192x192.png`, `pwa-512x512.png`,
  `apple-touch-icon.png`, `favicon.png`, `favicon.ico`.
