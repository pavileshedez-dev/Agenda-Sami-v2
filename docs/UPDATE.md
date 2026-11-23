# Actualización y rollback

## Principio

Cada release es un directorio completo e inmutable. La base SQLite **nunca**
se copia dentro de la release ni se reemplaza durante un build. El servicio
apunta a `current`, un enlace simbólico que se cambia sólo después de verificar
la nueva release.

## Antes de actualizar

1. Anotar la release actual:
   ```bash
   readlink -f /opt/agenda-sami/current
   ```
2. Generar un backup verificado de la base real:
   ```bash
   cd /opt/agenda-sami/current
   sudo -u agenda-sami env AGENDA_ENV_FILE=/etc/agenda-sami/agenda-sami.env \
     node scripts/backup-verified.mjs \
       --source /var/lib/agenda-sami/agenda_sami.sqlite \
       --target /var/lib/agenda-sami/backups_auto/manual-pre-update-$(date -u +%Y%m%dT%H%M%SZ).sqlite
   ```
   Guardar el `.sha256` generado.
3. Copiar la nueva release a:
   ```bash
   NEW=/opt/agenda-sami/releases/$(date -u +%Y%m%dT%H%M%SZ)
   sudo install -d -o agenda-sami -g agenda-sami -m 0755 "$NEW"
   sudo tar -C /ruta/al/deployment-package -cf - . | sudo tar -C "$NEW" -xf -
   sudo chown -R agenda-sami:agenda-sami "$NEW"
   sudo install -d -o agenda-sami -g agenda-sami -m 0750 /var/cache/agenda-sami
   ```

## Construir la nueva release

```bash
cd "$NEW"
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm ci
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm run build
sudo -u agenda-sami env npm_config_cache=/var/cache/agenda-sami/npm npm prune --omit=dev
test -f dist/index.html
```

No arrancar todavía el servicio desde la nueva release.

## Verificar antes del cambio

```bash
cd "$NEW"
node scripts/verify-deployment.mjs
```

Comprobar que:

- las migraciones están todas;
- `dist/index.html` existe;
- no hay `.env`, base SQLite, backups ni `node_modules` versionados;
- el hash de la release que se va a activar es el esperado.

## Activar

```bash
sudo ln -sfn "$NEW" /opt/agenda-sami/current
sudo systemctl restart agenda-sami
sudo systemctl status agenda-sami --no-pager
curl -fsS http://127.0.0.1:3001/api/health
BASE_URL=http://127.0.0.1:3001 npm run smoke-test
```

Si la release incluye cambios en unidades o scripts de mantenimiento, volver a
instalarlas y recargar systemd:

```bash
sudo install -m 0644 "$NEW/deploy/agenda-sami.service" /etc/systemd/system/agenda-sami.service
sudo install -m 0644 "$NEW/deploy/agenda-sami-backup.service" /etc/systemd/system/agenda-sami-backup.service
sudo install -m 0644 "$NEW/deploy/agenda-sami-backup.timer" /etc/systemd/system/agenda-sami-backup.timer
sudo install -m 0644 "$NEW/deploy/agenda-sami-health.service" /etc/systemd/system/agenda-sami-health.service
sudo install -m 0644 "$NEW/deploy/agenda-sami-health.timer" /etc/systemd/system/agenda-sami-health.timer
sudo systemctl daemon-reload
sudo systemctl restart agenda-sami-backup.timer agenda-sami-health.timer
```

Las migraciones nuevas se ejecutan al arrancar. Antes de aplicarlas, el
migrador genera un backup verificado en
`/var/lib/agenda-sami/backups_auto/`. Si la migración falla, el servicio no
debe considerarse actualizado.

## Rollback

Si falla el health check, el smoke test o una migración:

```bash
sudo ln -sfn /opt/agenda-sami/releases/<release-anterior> /opt/agenda-sami/current
sudo systemctl restart agenda-sami
```

Si la migración ya modificó el esquema y hay que volver a la base anterior:

1. Detener el servicio.
2. Conservar la base actual como evidencia.
3. Restaurar el backup verificado previo (ver `BACKUP_RESTORE.md`).
4. Arrancar la release anterior.
5. No borrar la release fallida hasta revisar logs.

## Reglas

- No actualizar con `git pull` dentro de `current`; crear una release nueva.
- No borrar releases antiguas inmediatamente; conservar al menos la anterior.
- No copiar la base de desarrollo a la release.
- No ejecutar `npm test` de desarrollo en producción; no está incluido en este
  paquete y podría tocar datos reales.
