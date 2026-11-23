# Instalación en Linux limpio

## 1. Requisitos

- Linux x86_64 o arm64 con systemd.
- **Node.js 24 LTS**. No usar Node 22.5–22.12: `node:sqlite` no está
  disponible sin flag hasta Node 22.13.
- `npm` y `git` no son necesarios en runtime; `npm` sí para construir.
- `cloudflared` solo si se publica por Cloudflare Tunnel.
- No se necesita Python, Docker, Caddy ni Nginx para el servicio local.

Comprobar:

```bash
node --version
npm --version
```

## 2. Usuario y directorios persistentes

```bash
sudo useradd --system --home /opt/agenda-sami --shell /usr/sbin/nologin agenda-sami
sudo install -d -o root -g agenda-sami -m 0755 /opt/agenda-sami
sudo install -d -o root -g agenda-sami -m 0755 /opt/agenda-sami/releases
sudo install -d -o agenda-sami -g agenda-sami -m 0750 /var/lib/agenda-sami
sudo install -d -o agenda-sami -g agenda-sami -m 0750 /var/cache/agenda-sami
sudo install -d -o root -g agenda-sami -m 0750 /etc/agenda-sami
```

La base vivirá en `/var/lib/agenda-sami/agenda_sami.sqlite`.
Los backups automáticos previos a migración se crearán en
`/var/lib/agenda-sami/backups_auto/`.

## 3. Copiar la release

Copiar **el contenido de `deployment-package/`** a una release fechada:

```bash
RELEASE=/opt/agenda-sami/releases/$(date -u +%Y%m%dT%H%M%SZ)
sudo install -d -o agenda-sami -g agenda-sami -m 0755 "$RELEASE"
sudo tar -C /ruta/al/deployment-package -cf - . | sudo tar -C "$RELEASE" -xf -
sudo chown -R agenda-sami:agenda-sami "$RELEASE"
sudo find "$RELEASE" -type d -exec chmod 0755 {} \;
sudo find "$RELEASE" -type f -exec chmod 0644 {} \;
sudo ln -sfn "$RELEASE" /opt/agenda-sami/current
```

No copiar una base SQLite, un `.env`, `node_modules` ni backups desde el equipo
de desarrollo.

## 4. Construir

```bash
cd "$RELEASE"
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm ci
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm run build
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm prune --omit=dev
```

Comprobar que existe `dist/index.html` y que el build terminó sin errores.
Si se despliega en una ruta base distinta de `/`, definir `AGENDA_BASE` antes
del build. Para el despliegue descrito se usa la raíz `/`.

## 5. Configurar entorno

```bash
sudo install -m 0640 -o root -g agenda-sami \
  "$RELEASE/.env.example" /etc/agenda-sami/agenda-sami.env
sudo editor /etc/agenda-sami/agenda-sami.env
```

Valores mínimos que deben revisarse:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
AGENDA_DB_PATH=/var/lib/agenda-sami/agenda_sami.sqlite
TRUST_PROXY=true
ALLOWED_ORIGINS=https://TU-DOMINIO-REAL
```

No guardar el archivo en la release. No commitearlo. El servidor enlaza siempre
a `127.0.0.1` aunque se intente cambiar `HOST`.

## 6. Inicializar contraseña

La base nueva se crea sin contraseña. Hay que establecerla antes de publicar:

```bash
cd /opt/agenda-sami/current
sudo -u agenda-sami env AGENDA_ENV_FILE=/etc/agenda-sami/agenda-sami.env \
  node scripts/init-admin.mjs --username sami
```

Introducir la contraseña de forma interactiva (mínimo 10 caracteres). No usar
`--password-stdin` con la contraseña en el historial de shell.

## 7. Activar el servicio

Copiar la unidad y activarla:

```bash
sudo install -m 0644 "$RELEASE/deploy/agenda-sami.service" /etc/systemd/system/agenda-sami.service
sudo install -m 0644 "$RELEASE/deploy/agenda-sami-backup.service" /etc/systemd/system/agenda-sami-backup.service
sudo install -m 0644 "$RELEASE/deploy/agenda-sami-backup.timer" /etc/systemd/system/agenda-sami-backup.timer
sudo install -m 0644 "$RELEASE/deploy/agenda-sami-health.service" /etc/systemd/system/agenda-sami-health.service
sudo install -m 0644 "$RELEASE/deploy/agenda-sami-health.timer" /etc/systemd/system/agenda-sami-health.timer
sudo systemctl daemon-reload
sudo systemctl enable --now agenda-sami
sudo systemctl enable --now agenda-sami-backup.timer agenda-sami-health.timer
sudo systemctl status agenda-sami --no-pager
sudo systemctl list-timers --all | grep agenda-sami
```

El backup diario se guarda en `/var/lib/agenda-sami/backups_auto/` y conserva
14 días por defecto (`BACKUP_RETENTION_DAYS`). El healthcheck systemd solo deja
constancia en journald; para alertas externas hace falta un monitor adicional.

Verificar que escucha solo en loopback:

```bash
ss -ltnp | grep ':3001'
# Debe mostrar 127.0.0.1:3001, no 0.0.0.0:3001
```

Comprobar salud y autenticación:

```bash
curl -fsS http://127.0.0.1:3001/api/health
BASE_URL=http://127.0.0.1:3001 npm run smoke-test
```

El smoke test comprueba `/api/health`, sesión anónima, 401 en rutas privadas,
404 JSON y cabeceras de seguridad. Sin `SMOKE_USERNAME`/`SMOKE_PASSWORD` no
prueba el login autenticado; se puede añadir para una comprobación manual.

## 8. Comprobar el enlace `current`

El servicio usa `/opt/agenda-sami/current`; ya se creó en el paso 3. Verificar:

```bash
readlink -f /opt/agenda-sami/current
# Debe coincidir con $RELEASE
```

## 9. Publicación

No abrir el hostname al público todavía. Seguir
[docs/CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md): primero Cloudflare Access,
después la ruta DNS/túnel.

## 10. Permisos y comprobaciones finales

```bash
sudo stat -c '%U:%G %a %n' /etc/agenda-sami/agenda-sami.env
sudo stat -c '%U:%G %a %n' /var/lib/agenda-sami
sudo -u agenda-sami test -w /var/lib/agenda-sami && echo writable
```

El archivo de entorno no debe ser legible por otros usuarios. La base y sus
backups deben pertenecer a `agenda-sami` y no estar dentro de la release.
