# Transferencia y restauración de la base SQLite

## Regla de oro

La base **no se copia en caliente con `cp`**, ni se incluye en la release.
Se genera una copia SQLite coherente con `VACUUM INTO` desde una conexión
**read-only**, se verifica su integridad y se transfiere con su hash.

La base real de producción vive en:

```text
/var/lib/agenda-sami/agenda_sami.sqlite
```

## 1. Transferir desde el equipo de desarrollo (Windows)

### 1.1. Cerrar la aplicación de origen

Detener el servidor local antes de la copia. Si queda un proceso escribiendo,
la transferencia no es válida aunque el archivo abra.

### 1.2. Crear la copia verificada

Desde `deployment-package/`, con Node >= 22.5:

```powershell
node scripts/backup-verified.mjs `
  --source "C:\ruta\a\Agenda Sami\server\data\agenda_sami.sqlite" `
  --target "$env:TEMP\agenda_sami-transfer-2026-11-18.sqlite"
```

El script:

- abre el origen en modo read-only;
- crea el destino con `VACUUM INTO`;
- ejecuta `integrity_check` y `foreign_key_check`;
- genera `<destino>.sha256`;
- no escribe en el origen.

No copiar el archivo `.sqlite` solo: hay que llevar también el `.sha256`.

### 1.3. Verificar y transferir

```powershell
Get-Content "$env:TEMP\agenda_sami-transfer-2026-11-18.sqlite.sha256"
```

Transferir por SCP/SFTP el `.sqlite` y su `.sha256` a un directorio de staging
del servidor, por ejemplo `/var/lib/agenda-sami/incoming/`.

No transferir `-wal`, `-shm`, `.env`, backups antiguos ni la carpeta
`backups_auto`.

## 2. Verificar en Linux antes de instalar

```bash
cd /var/lib/agenda-sami/incoming
sha256sum -c agenda_sami-transfer-2026-11-18.sqlite.sha256
```

Comprobar integridad y claves foráneas con Node, sin escribir:

```bash
node --input-type=module - <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/agenda-sami/incoming/agenda_sami-transfer-2026-11-18.sqlite', { readOnly: true });
console.log('integrity', db.prepare('PRAGMA integrity_check').all());
console.log('foreign_keys', db.prepare('PRAGMA foreign_key_check').all());
db.close();
NODE
```

No continuar si `integrity_check` no es `ok` o si hay violaciones de claves
foráneas.

## 3. Instalar la base por primera vez

Con el servicio detenido y sin base previa:

```bash
sudo systemctl stop agenda-sami 2>/dev/null || true
sudo install -o agenda-sami -g agenda-sami -m 0600 \
  /var/lib/agenda-sami/incoming/agenda_sami-transfer-2026-11-18.sqlite \
  /var/lib/agenda-sami/agenda_sami.sqlite
sudo systemctl start agenda-sami
```

Si ya existía una base, **no sobrescribir directamente**. Seguir el
procedimiento de restauración con backup previo.

## 4. Restaurar un backup existente

### 4.1. Detener y preservar

```bash
sudo systemctl stop agenda-sami

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo install -d -o agenda-sami -g agenda-sami -m 0750 /var/lib/agenda-sami/backups_auto
sudo mv /var/lib/agenda-sami/agenda_sami.sqlite \
  /var/lib/agenda-sami/backups_auto/pre-restore-$STAMP.sqlite
```

Conservar también, si existen, `agenda_sami.sqlite-wal` y `-shm`; no borrarlos
sin haber confirmado que no hay un proceso usándolos.

### 4.2. Verificar el backup que se va a restaurar

```bash
sha256sum -c /ruta/al/backup.sqlite.sha256
node --input-type=module - <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const p = '/ruta/al/backup.sqlite';
const db = new DatabaseSync(p, { readOnly: true });
console.log(db.prepare('PRAGMA integrity_check').all());
console.log(db.prepare('PRAGMA foreign_key_check').all());
db.close();
NODE
```

### 4.3. Copiar a staging y hacer cambio atómico

```bash
sudo install -o agenda-sami -g agenda-sami -m 0600 \
  /ruta/al/backup.sqlite /var/lib/agenda-sami/agenda_sami.sqlite.restore
sudo mv /var/lib/agenda-sami/agenda_sami.sqlite.restore \
  /var/lib/agenda-sami/agenda_sami.sqlite
sudo systemctl start agenda-sami
```

`mv` dentro del mismo sistema de archivos es atómico. No usar `cp` directamente
sobre la base activa.

### 4.4. Verificar tras restaurar

```bash
curl -fsS http://127.0.0.1:3001/api/health
BASE_URL=http://127.0.0.1:3001 npm run smoke-test
```

Si la versión restaurada tiene un esquema anterior, el servidor aplicará las
migraciones pendientes al arrancar. El migrador genera antes un backup
verificado en `backups_auto/`.

## 5. Rollback si la restauración falla

1. Detener el servicio.
2. Mover la base fallida a `backups_auto/failed-restore-<timestamp>.sqlite`.
3. Restaurar `pre-restore-<timestamp>.sqlite` con el mismo procedimiento.
4. Arrancar y verificar health/smoke.
5. Revisar logs de systemd.

## 6. Qué no hacer

- No copiar `agenda_sami.sqlite` sin su WAL con la aplicación abierta.
- No restaurar un archivo sin verificar `integrity_check`.
- No ejecutar `npm test` del proyecto de desarrollo contra esta base.
- No guardar `.env`, claves API ni backups personales en la release.
- No publicar el hostname de Cloudflare hasta que la restauración esté
  verificada y Access esté configurado.
