#!/usr/bin/env bash
set -euo pipefail

# Backup diario verificado de Agenda Sami.
# Se ejecuta con el usuario agenda-sami y con AGENDA_DB_PATH apuntando a /var/lib.

ENV_FILE="${AGENDA_ENV_FILE:-/etc/agenda-sami/agenda-sami.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

DB_PATH="${AGENDA_DB_PATH:-/var/lib/agenda-sami/agenda_sami.sqlite}"
BACKUP_DIR="$(dirname "$DB_PATH")/backups_auto"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/daily-$STAMP.sqlite"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

/usr/bin/node /opt/agenda-sami/current/scripts/backup-verified.mjs \
  --source "$DB_PATH" \
  --target "$TARGET"

# Borrar sólo backups diarios antiguos y sus sidecars. No tocar backups manuales.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'daily-*.sqlite*' \
    -mtime +"$RETENTION_DAYS" -delete
fi
