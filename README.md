# Agenda Sami — paquete de despliegue

Paquete mínimo para construir y ejecutar Agenda Sami en un servidor Linux, con
SQLite persistente fuera de la release y publicación privada mediante Cloudflare
Tunnel + Cloudflare Access.

## Invariantes de seguridad

- **No contiene** base de datos, `.env`, claves API, backups, `node_modules`,
  capturas, carpetas de revisión ni arte fuente.
- El servidor escucha **solo en `127.0.0.1`**; el puerto inicial es `3001`.
- La base real debe estar en `AGENDA_DB_PATH`, fuera de la release:
  `/var/lib/agenda-sami/agenda_sami.sqlite`.
- El entorno real debe estar en `/etc/agenda-sami/agenda-sami.env`, nunca en
  este directorio.
- Cloudflare Access debe estar activo **antes** de publicar el hostname.
- La autenticación propia de Agenda Sami se mantiene: Access es una capa
  adicional, no un sustituto del login.
- No hay dependencia de `Agents/`, `Calendario/` ni de módulos externos.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Instalación limpia, usuario, directorios y systemd |
| [docs/UPDATE.md](docs/UPDATE.md) | Actualización por releases y rollback |
| [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) | Transferencia verificada y restauración |
| [docs/CLOUDFLARE_TUNNEL.md](docs/CLOUDFLARE_TUNNEL.md) | Tunnel, DNS y Access |
| [docs/VPS_REQUIREMENTS.md](docs/VPS_REQUIREMENTS.md) | Ubuntu 24.04, ARM64 y tres proyectos |
| [docs/E2E.md](docs/E2E.md) | Pruebas de interfaz y su alcance |
| [docs/MASCOT_STATES.md](docs/MASCOT_STATES.md) | Estados reales de Pibble/Capilámpara |
| [docs/EXCLUDED.md](docs/EXCLUDED.md) | Qué queda fuera y por qué |
| [docs/MANIFEST.txt](docs/MANIFEST.txt) | Inventario exacto de archivos incluidos |

## Inicio rápido (resumen)

Requisito: **Node 24 LTS**. No usar Node 22.5–22.12 (`node:sqlite` requiere
flag hasta 22.13).

```bash
# En el servidor, con el paquete ya copiado a /opt/agenda-sami/releases/<version>
npm ci
npm run build
npm prune --omit=dev

sudo install -d -o agenda-sami -g agenda-sami -m 0750 /var/lib/agenda-sami
sudo install -d -o root -g agenda-sami -m 0750 /etc/agenda-sami
sudo install -m 0640 -o root -g agenda-sami .env.example /etc/agenda-sami/agenda-sami.env
# editar el archivo anterior: dominio, DB path y claves opcionales

sudo -u agenda-sami env AGENDA_ENV_FILE=/etc/agenda-sami/agenda-sami.env \
  node scripts/init-admin.mjs --username sami --password-stdin
```

Después: `systemctl enable --now agenda-sami`, verificar `/api/health` y el
smoke test. La publicación en Cloudflare se hace únicamente tras configurar
Access.

## Verificación

```bash
node scripts/verify-deployment.mjs
BASE_URL=http://127.0.0.1:3001 npm run smoke-test
```

`verify-deployment.mjs` comprueba estructura, migraciones y ausencia de
artefactos prohibidos. No abre la base real.
