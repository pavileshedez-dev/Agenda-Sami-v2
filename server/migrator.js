import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { getEnvInt } from './env.js';

const MODULE_FILE = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(MODULE_FILE);

function resolveDefaultMigrationsDir() {
  const candidates = [
    path.join(MODULE_DIR, 'migrations'),
    path.join(process.cwd(), 'server', 'migrations'),
    path.resolve(MODULE_DIR, '..', 'server', 'migrations'),
    path.resolve(MODULE_DIR, '..', '..', 'server', 'migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(MODULE_DIR, 'migrations');
}

const DEFAULT_MIGRATIONS_DIR = resolveDefaultMigrationsDir();

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inTrigger = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inTrigger) continue;
    current += line + '\n';
    if (/CREATE\s+TRIGGER/i.test(trimmed)) {
      inTrigger = true;
    }
    if (inTrigger) {
      if (/^END;/i.test(trimmed) || /;\s*END;/i.test(trimmed) || trimmed.endsWith('END;')) {
        inTrigger = false;
        statements.push(current.trim());
        current = '';
      }
    } else if (trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length > 0) {
    statements.push(current.trim());
  }
  return statements.filter(s => s.length > 0);
}

export function listMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

export function getExpectedSchemaVersion(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const files = listMigrationFiles(migrationsDir);
  return files.length > 0 ? files[files.length - 1] : null;
}

/**
 * Backup verificado obligatorio previo a la aplicación de nuevas migraciones:
 * 1. VACUUM INTO
 * 2. PRAGMA integrity_check
 * 3. PRAGMA foreign_key_check
 * 4. Cálculo SHA-256
 * 5. Registro de auditoría y retención
 */
function createPreMigrationVerifiedBackup(db, dbPath, pendingFiles) {
  const backupDir = path.join(path.dirname(path.resolve(dbPath)), 'backups_auto');
  fs.mkdirSync(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `pre_migration_${ts}_${crypto.randomUUID().slice(0, 6)}.sqlite`;
  const backupPath = path.join(backupDir, backupFileName);
  const escaped = backupPath.replace(/\\/g, '/').replace(/'/g, "''");

  try {
    db.exec(`VACUUM INTO '${escaped}';`);
  } catch (err) {
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch { /* ignore */ }
    throw new Error(`Fallo al generar backup pre-migración con VACUUM INTO: ${err.message}`);
  }

  let verifyConn = null;
  try {
    verifyConn = new DatabaseSync(backupPath, { readOnly: true });
    const intCheck = verifyConn.prepare('PRAGMA integrity_check;').all();
    const integrityOk = intCheck.length > 0 && intCheck[0].integrity_check === 'ok';
    const fkCheck = verifyConn.prepare('PRAGMA foreign_key_check;').all();
    verifyConn.close();
    verifyConn = null;

    if (!integrityOk) {
      throw new Error(`Backup pre-migración falló PRAGMA integrity_check: ${JSON.stringify(intCheck)}`);
    }
    if (fkCheck.length > 0) {
      throw new Error(`Backup pre-migración falló PRAGMA foreign_key_check (${fkCheck.length} violaciones).`);
    }

    const buf = fs.readFileSync(backupPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    const auditRecord = {
      timestamp: new Date().toISOString(),
      type: 'pre_migration',
      file: backupFileName,
      sizeBytes: buf.length,
      sha256,
      integrityCheck: 'ok',
      foreignKeyViolations: 0,
      pendingMigrations: pendingFiles,
    };

    const logPath = path.join(backupDir, 'migration_backups.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(auditRecord) + '\n', 'utf8');

    // Política de retención de backups pre-migración
    const retention = getEnvInt('BACKUP_RETENTION_COUNT', 10, { min: 1, max: 500 });
    const allPre = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('pre_migration_') && f.endsWith('.sqlite'))
      .map(f => ({ name: f, full: path.join(backupDir, f), mtimeMs: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (allPre.length > retention) {
      for (const old of allPre.slice(retention)) {
        try { fs.unlinkSync(old.full); } catch { /* ignore */ }
      }
    }

    console.log(`[MIGRATOR] Backup pre-migración verificado: ${backupFileName} (SHA-256: ${sha256.slice(0, 16)}…, integridad OK, FK OK).`);
    return { ...auditRecord, backupPath };
  } catch (err) {
    if (verifyConn) {
      try { verifyConn.close(); } catch { /* ignore */ }
    }
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch { /* ignore */ }
    throw err;
  }
}

export function runMigrations(db, options = {}) {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const dbPath = options.dbPath || null;

  // Crear tabla de control de versiones de esquema
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const files = listMigrationFiles(migrationsDir);
  if (files.length === 0) {
    return { applied: [], currentVersion: null, preMigrationBackup: null };
  }

  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all();
  const appliedSet = new Set(appliedRows.map(r => r.version));

  // Guardia de compatibilidad: impedir arranque si la BD tiene una versión más nueva que el código
  const maxKnown = files[files.length - 1];
  const newerInDb = appliedRows.filter(r => r.version > maxKnown).map(r => r.version);
  if (newerInDb.length > 0) {
    throw new Error(
      `Versión de esquema incompatible: la base de datos contiene migraciones más recientes (${newerInDb.join(', ')}) que esta versión del código (máximo conocido: ${maxKnown}). Detenga y actualice el código o restaure el backup correspondiente.`
    );
  }

  const pendingFiles = files.filter(f => !appliedSet.has(f));
  let preMigrationBackup = null;

  // Si hay migraciones pendientes sobre una BD ya existente (con migraciones previas aplicadas y archivo físico),
  // generar y verificar backup obligatorio ANTES de tocar el esquema.
  if (pendingFiles.length > 0 && appliedRows.length > 0 && dbPath && dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    preMigrationBackup = createPreMigrationVerifiedBackup(db, dbPath, pendingFiles);
  }

  const newlyApplied = [];

  for (const file of pendingFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      db.exec('BEGIN TRANSACTION;');
      const statements = splitSqlStatements(sql);

      for (const stmt of statements) {
        try {
          db.exec(stmt);
        } catch (stmtErr) {
          if (stmtErr.message && (stmtErr.message.includes('duplicate column name') || stmtErr.message.includes('already exists'))) {
            // Columna o índice/trigger ya existente: idempotente
          } else {
            throw stmtErr;
          }
        }
      }

      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(file);
      db.exec('COMMIT;');
      newlyApplied.push(file);
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (_err) { void _err; }
      console.error(`[MIGRATOR] Error aplicando migración ${file}:`, err.message);
      throw new Error(`Fallo en migración ${file}: ${err.message}`);
    }
  }

  const latest = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
  return {
    applied: newlyApplied,
    currentVersion: latest ? latest.version : null,
    preMigrationBackup,
  };
}
