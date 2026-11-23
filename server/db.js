import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runMigrations, getExpectedSchemaVersion } from './migrator.js';
import { getEnvInt } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, 'data');

let currentDb = null;
let currentDbPath = null;

export function getDbPath() {
  return currentDbPath;
}

export function isDatabaseOpen() {
  return currentDb !== null;
}

function ensureParentDir(filePath) {
  if (!filePath || filePath === ':memory:') return;
  const parentDir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

export function openDatabase(customPath) {
  if (currentDb) {
    try { currentDb.close(); } catch (_err) { void _err; }
    currentDb = null;
  }
  const targetPath = customPath || process.env.AGENDA_DB_PATH || path.join(DEFAULT_DATA_DIR, 'agenda_sami.sqlite');
  ensureParentDir(targetPath);

  currentDbPath = targetPath;
  currentDb = new DatabaseSync(currentDbPath);
  currentDb.exec('PRAGMA foreign_keys = ON;');
  currentDb.exec('PRAGMA busy_timeout = 5000;');
  try {
    currentDb.exec('PRAGMA journal_mode = WAL;');
    currentDb.exec('PRAGMA synchronous = NORMAL;');
  } catch (_err) {
    void _err;
  }
  return currentDb;
}

/**
 * Cierre ordenado y seguro de SQLite con checkpoint WAL.
 */
export function closeDatabase() {
  if (!currentDb) return;
  try {
    currentDb.exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch (_err) {
    void _err;
  }
  try {
    currentDb.close();
  } catch (_err) {
    void _err;
  }
  currentDb = null;
}

/**
 * Genera una copia SQLite atómica mediante VACUUM INTO y verifica inmediatamente
 * su integridad física, claves foráneas y checksum SHA-256.
 * Si cualquier comprobación falla, elimina el archivo temporal y lanza error.
 */
export function createVerifiedVacuumBackup(targetPath, sourceDb = null) {
  const activeDb = sourceDb || currentDb;
  if (!activeDb) {
    throw new Error('No hay ninguna conexión SQLite activa para generar backup.');
  }
  ensureParentDir(targetPath);

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  const escapedTarget = targetPath.replace(/\\/g, '/').replace(/'/g, "''");
  try {
    activeDb.exec(`VACUUM INTO '${escapedTarget}';`);
  } catch (err) {
    try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* ignore */ }
    throw new Error(`Fallo en VACUUM INTO: ${err.message}`);
  }

  // Verificar integridad y claves foráneas sobre la copia recién creada
  let verifyConn = null;
  try {
    verifyConn = new DatabaseSync(targetPath, { readOnly: true });
    const intCheck = verifyConn.prepare('PRAGMA integrity_check;').all();
    const integrityOk = intCheck.length > 0 && intCheck[0].integrity_check === 'ok';
    const fkCheck = verifyConn.prepare('PRAGMA foreign_key_check;').all();
    verifyConn.close();
    verifyConn = null;

    if (!integrityOk) {
      throw new Error(`PRAGMA integrity_check falló en el backup: ${JSON.stringify(intCheck)}`);
    }
    if (fkCheck.length > 0) {
      throw new Error(`PRAGMA foreign_key_check detectó ${fkCheck.length} violaciones en el backup.`);
    }

    const fileBuf = fs.readFileSync(targetPath);
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

    return {
      path: targetPath,
      sha256,
      sizeBytes: fileBuf.length,
      integrityOk: true,
      foreignKeyViolations: 0,
      createdAt: new Date().toISOString(),
    };
  } catch (verifyErr) {
    if (verifyConn) {
      try { verifyConn.close(); } catch { /* ignore */ }
    }
    try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* ignore */ }
    throw verifyErr;
  }
}

/**
 * Política de retención para evitar crecimiento indefinido de backups automáticos.
 * Mantiene únicamente los `maxFiles` ficheros .sqlite más recientes por prefijo.
 */
export function pruneOldBackups(backupDir, { maxFiles = null, prefix = '' } = {}) {
  const limit = maxFiles ?? getEnvInt('BACKUP_RETENTION_COUNT', 10, { min: 1, max: 500 });
  if (!backupDir || !fs.existsSync(backupDir)) return { deleted: 0, kept: 0 };

  const entries = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite') && (!prefix || f.startsWith(prefix)))
    .map((f) => {
      const full = path.join(backupDir, f);
      const stat = fs.statSync(full);
      return { name: f, full, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  let deleted = 0;
  if (entries.length > limit) {
    for (const old of entries.slice(limit)) {
      try {
        fs.unlinkSync(old.full);
        deleted += 1;
      } catch { /* ignore */ }
    }
  }
  return { deleted, kept: Math.min(entries.length, limit) };
}

/**
 * Comprueba la salud operativa de SQLite (conectividad, quick_check y versión de esquema).
 */
export function checkDatabaseHealth() {
  try {
    if (!currentDb) {
      return { ok: false, database: 'disconnected', schemaOk: false, schemaVersion: null, expectedSchemaVersion: null };
    }
    const ping = currentDb.prepare('SELECT 1 AS ok').get();
    const qc = currentDb.prepare('PRAGMA quick_check;').all();
    const quickOk = qc.length > 0 && qc[0].quick_check === 'ok';

    const latest = currentDb.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
    const currentVersion = latest ? latest.version : null;
    const expectedVersion = getExpectedSchemaVersion();
    const schemaOk = Boolean(currentVersion && (!expectedVersion || currentVersion === expectedVersion));

    return {
      ok: Boolean(ping?.ok === 1 && quickOk && schemaOk),
      database: ping?.ok === 1 && quickOk ? 'ok' : 'error',
      schemaOk,
      schemaVersion: currentVersion,
      expectedSchemaVersion: expectedVersion || null,
    };
  } catch {
    return {
      ok: false,
      database: 'error',
      schemaOk: false,
      schemaVersion: null,
      expectedSchemaVersion: null,
    };
  }
}

// Exportar proxy transparente de db (apertura diferida para no tocar la BD real al importar en tests)
export const db = new Proxy({}, {
  get(target, prop) {
    if (!currentDb) openDatabase();
    const val = currentDb[prop];
    if (typeof val === 'function') {
      return val.bind(currentDb);
    }
    return val;
  },
});

export function openTestDatabase(prefix = 'test_agenda') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}_`));
  const tempPath = path.join(tempDir, `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.sqlite`);
  openDatabase(tempPath);
  initDatabase();
  return {
    dbPath: tempPath,
    dbDir: tempDir,
    cleanup: () => {
      closeDatabase();
      currentDbPath = null;
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (_err) { void _err; }
    },
  };
}

export function initDatabase() {
  if (!currentDb) {
    openDatabase();
  }

  // 1. Ejecutar migraciones estructuradas y versionadas (con backup verificado previo)
  const migResult = runMigrations(currentDb, { dbPath: currentDbPath });
  if (migResult.applied.length > 0) {
    console.log(`[DB] Migraciones aplicadas: ${migResult.applied.join(', ')} (Versión actual: ${migResult.currentVersion})`);
  }

  // 2. Crear usuario base Sami SIN contraseña predeterminada (requiere init-admin CLI para poder iniciar sesión)
  const u = currentDb.prepare('SELECT id FROM usuarios WHERE id = 1').get();
  if (!u) {
    currentDb.prepare(`
      INSERT INTO usuarios (id, username, nombre, password_hash, created_at)
      VALUES (1, 'sami', 'Sami', NULL, datetime('now'))
    `).run();
  }

  // 3. Catálogo oficial UCM Logopedia (15 asignaturas, Estadística II estrictamente excluida)
  const asignaturasCount = currentDb.prepare('SELECT COUNT(*) as count FROM asignaturas').get().count;
  if (asignaturasCount === 0) {
    const ASIGNATURAS_CATALOG = [
      { id: 'asig-adquisicion', nombre: 'Adquisición y Desarrollo del Lenguaje', color: '#2563eb', abreviatura: 'ADL' },
      { id: 'asig-neurociencia', nombre: 'Bases de la Neurociencia', color: '#0284c7', abreviatura: 'NEURO' },
      { id: 'asig-estadistica1', nombre: 'Estadística I', color: '#4f46e5', abreviatura: 'EST-1' },
      { id: 'asig-evaluacion1', nombre: 'Evaluación I', color: '#059669', abreviatura: 'EV-1' },
      { id: 'asig-evaluacion2', nombre: 'Evaluación II', color: '#0d9488', abreviatura: 'EV-2' },
      { id: 'asig-audicion-voz', nombre: 'Exploración de la Audición y de la Voz', color: '#0891b2', abreviatura: 'EAV' },
      { id: 'asig-fisiologia', nombre: 'Fisiología de los Órganos del Lenguaje', color: '#0f766e', abreviatura: 'FOL' },
      { id: 'asig-linguistica2', nombre: 'Lingüística II', color: '#7c3aed', abreviatura: 'LING-2' },
      { id: 'asig-profesion', nombre: 'Profesión del Logopeda', color: '#e11d48', abreviatura: 'PL' },
      { id: 'asig-psicologia', nombre: 'Psicología del Lenguaje', color: '#d97706', abreviatura: 'PSI' },
      { id: 'asig-trastornos-voz', nombre: 'Trastornos de la Voz y de la Audición', color: '#9333ea', abreviatura: 'TVA' },
      { id: 'asig-trastornos-des', nombre: 'Trastornos del Desarrollo y del Aprendizaje', color: '#ea580c', abreviatura: 'TDA' },
      { id: 'asig-etiologia-neuro', nombre: 'Trastornos del Lenguaje de Etiología Neurológica', color: '#dc2626', abreviatura: 'TLEN' },
      { id: 'asig-psicopatologicos', nombre: 'Trastornos del Lenguaje en Problemas Psicopatológicos', color: '#c026d3', abreviatura: 'TLPP' },
      { id: 'asig-orofaciales', nombre: 'Trastornos Estructurales de las Funciones Orofaciales', color: '#db2777', abreviatura: 'TEFO' },
    ];

    const stmt = currentDb.prepare(`
      INSERT INTO asignaturas (id, user_id, nombre, abreviatura, color, creditos, curso, cuatrimestre, activa)
      VALUES (?, 1, ?, ?, ?, 6, 1, 1, 1)
    `);

    for (const item of ASIGNATURAS_CATALOG) {
      stmt.run(item.id, item.nombre, item.abreviatura, item.color);
    }
  }

  // 4. Festivos oficiales diferenciados por ámbito: Nacional, UCM/Madrid y Guadalajara/CLM
  const festivosCount = currentDb.prepare('SELECT COUNT(*) as count FROM festivos').get().count;
  if (festivosCount === 0) {
    const FESTIVOS_INICIALES = [
      { id: 'fest-01-01', fecha: '2025-01-01', nombre: 'Año Nuevo', ambito: 'nacional' },
      { id: 'fest-01-06', fecha: '2025-01-06', nombre: 'Epifanía del Señor (Reyes)', ambito: 'nacional' },
      { id: 'fest-01-28', fecha: '2025-01-28', nombre: 'Sto. Tomás de Aquino (UCM)', ambito: 'madrid' },
      { id: 'fest-04-17', fecha: '2025-04-17', nombre: 'Jueves Santo', ambito: 'nacional' },
      { id: 'fest-04-18', fecha: '2025-04-18', nombre: 'Viernes Santo', ambito: 'nacional' },
      { id: 'fest-05-01', fecha: '2025-05-01', nombre: 'Fiesta del Trabajo', ambito: 'nacional' },
      { id: 'fest-05-02', fecha: '2025-05-02', nombre: 'Día de la Comunidad de Madrid', ambito: 'madrid' },
      { id: 'fest-05-15', fecha: '2025-05-15', nombre: 'San Isidro Labrador', ambito: 'madrid' },
      { id: 'fest-05-31', fecha: '2025-05-31', nombre: 'Día de Castilla-La Mancha', ambito: 'guadalajara' },
      { id: 'fest-06-19', fecha: '2025-06-19', nombre: 'Corpus Christi (CLM)', ambito: 'guadalajara' },
      { id: 'fest-08-15', fecha: '2025-08-15', nombre: 'Asunción de la Virgen', ambito: 'nacional' },
      { id: 'fest-09-08', fecha: '2025-09-08', nombre: 'Virgen de la Antigua (Guadalajara)', ambito: 'guadalajara' },
      { id: 'fest-10-12', fecha: '2025-10-12', nombre: 'Fiesta Nacional de España', ambito: 'nacional' },
      { id: 'fest-11-01', fecha: '2025-11-01', nombre: 'Todos los Santos', ambito: 'nacional' },
      { id: 'fest-11-09', fecha: '2025-11-09', nombre: 'Virgen de la Almudena', ambito: 'madrid' },
      { id: 'fest-12-06', fecha: '2025-12-06', nombre: 'Día de la Constitución', ambito: 'nacional' },
      { id: 'fest-12-08', fecha: '2025-12-08', nombre: 'Inmaculada Concepción', ambito: 'nacional' },
      { id: 'fest-12-25', fecha: '2025-12-25', nombre: 'Natividad del Señor', ambito: 'nacional' },
      { id: 'fest-2026-01-01', fecha: '2026-01-01', nombre: 'Año Nuevo', ambito: 'nacional' },
      { id: 'fest-2026-01-06', fecha: '2026-01-06', nombre: 'Epifanía del Señor', ambito: 'nacional' },
      { id: 'fest-2026-04-02', fecha: '2026-04-02', nombre: 'Jueves Santo', ambito: 'nacional' },
      { id: 'fest-2026-04-03', fecha: '2026-04-03', nombre: 'Viernes Santo', ambito: 'nacional' },
      { id: 'fest-2026-05-01', fecha: '2026-05-01', nombre: 'Fiesta del Trabajo', ambito: 'nacional' },
      { id: 'fest-2026-05-02', fecha: '2026-05-02', nombre: 'Día de la Comunidad de Madrid', ambito: 'madrid' },
      { id: 'fest-2026-05-31', fecha: '2026-05-31', nombre: 'Día de Castilla-La Mancha', ambito: 'guadalajara' },
      { id: 'fest-2026-09-08', fecha: '2026-09-08', nombre: 'Virgen de la Antigua (Guadalajara)', ambito: 'guadalajara' },
      { id: 'fest-2026-10-12', fecha: '2026-10-12', nombre: 'Fiesta Nacional de España', ambito: 'nacional' },
      { id: 'fest-2026-11-01', fecha: '2026-11-01', nombre: 'Todos los Santos', ambito: 'nacional' },
      { id: 'fest-2026-11-09', fecha: '2026-11-09', nombre: 'Virgen de la Almudena', ambito: 'madrid' },
      { id: 'fest-2026-12-06', fecha: '2026-12-06', nombre: 'Día de la Constitución', ambito: 'nacional' },
      { id: 'fest-2026-12-08', fecha: '2026-12-08', nombre: 'Inmaculada Concepción', ambito: 'nacional' },
      { id: 'fest-2026-12-25', fecha: '2026-12-25', nombre: 'Natividad del Señor', ambito: 'nacional' },
    ];

    const stmtFest = currentDb.prepare('INSERT INTO festivos (id, fecha, nombre, ambito) VALUES (?, ?, ?, ?)');
    for (const f of FESTIVOS_INICIALES) {
      stmtFest.run(f.id, f.fecha, f.nombre, f.ambito);
    }
  }

  // 5. Ajustes predeterminados (solo preferencias no sensibles)
  const defAjustes = [
    ['compartir_memoria', '1'],
    ['ubicacion_laboral', 'Guadalajara, Castilla-La Mancha'],
    ['universidad', 'Universidad Complutense de Madrid (UCM)'],
    ['grado', 'Logopedia'],
    ['zona_horaria', 'Europe/Madrid'],
  ];

  const stmtAjuste = currentDb.prepare('INSERT OR IGNORE INTO ajustes_usuario (clave, valor) VALUES (?, ?)');
  for (const [k, v] of defAjustes) {
    stmtAjuste.run(k, v);
  }
}
