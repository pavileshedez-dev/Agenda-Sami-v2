#!/usr/bin/env node
/**
 * Copia verificada y consistente de una base SQLite de Agenda Sami.
 *
 * - Abre la base de origen en modo read-only.
 * - Usa VACUUM INTO, que crea una copia coherente incluyendo el WAL confirmado.
 * - Verifica integrity_check y foreign_key_check sobre la copia.
 * - Calcula SHA-256 y crea un sidecar compatible con `sha256sum -c`.
 * - Nunca escribe en la base de origen.
 *
 * Uso:
 *   node scripts/backup-verified.mjs \
 *     --source /ruta/agenda_sami.sqlite \
 *     --target /ruta/agenda_sami-transfer-2026-11-18.sqlite
 *
 * Si --source se omite, usa AGENDA_DB_PATH.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { source: null, target: null };
  for (let i = 0; i < argv.length; i += 1) {
    if ((argv[i] === '--source' || argv[i] === '-s') && argv[i + 1]) {
      out.source = argv[++i];
    } else if ((argv[i] === '--target' || argv[i] === '-t') && argv[i + 1]) {
      out.target = argv[++i];
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scripts/backup-verified.mjs --source <sqlite> --target <nuevo.sqlite>');
      process.exit(0);
    } else {
      fail(`Argumento no reconocido: ${argv[i]}`);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.source || process.env.AGENDA_DB_PATH || '');
const target = path.resolve(args.target || '');

if (!source || source === path.resolve('')) fail('Falta --source o AGENDA_DB_PATH.');
if (!target) fail('Falta --target.');
if (source === target) fail('Origen y destino no pueden ser el mismo archivo.');
if (!fs.existsSync(source)) fail(`No existe la base de origen: ${source}`);
if (fs.existsSync(target)) fail(`El destino ya existe; no se sobrescribe: ${target}`);

fs.mkdirSync(path.dirname(target), { recursive: true });

let sourceDb = null;
try {
  sourceDb = new DatabaseSync(source, { readOnly: true });
  sourceDb.exec('PRAGMA busy_timeout = 5000;');
  const escaped = target.replace(/\\/g, '/').replace(/'/g, "''");
  sourceDb.exec(`VACUUM INTO '${escaped}';`);
} catch (err) {
  fail(`No se pudo crear la copia: ${err.message}`);
} finally {
  try { sourceDb?.close(); } catch { /* ignore */ }
}

let verifyDb = null;
try {
  verifyDb = new DatabaseSync(target, { readOnly: true });
  const integrity = verifyDb.prepare('PRAGMA integrity_check;').all();
  if (!integrity.length || integrity[0].integrity_check !== 'ok') {
    throw new Error(`integrity_check falló: ${JSON.stringify(integrity)}`);
  }
  const fk = verifyDb.prepare('PRAGMA foreign_key_check;').all();
  if (fk.length > 0) {
    throw new Error(`foreign_key_check detectó ${fk.length} violaciones.`);
  }
  verifyDb.close();
  verifyDb = null;

  const bytes = fs.readFileSync(target);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const sidecar = `${digest}  ${path.basename(target)}\n`;
  fs.writeFileSync(`${target}.sha256`, sidecar, { mode: 0o600 });

  console.log(JSON.stringify({
    ok: true,
    target,
    bytes: bytes.length,
    sha256: digest,
    sidecar: `${target}.sha256`,
    integrity: 'ok',
    foreignKeyViolations: 0,
  }, null, 2));
} catch (err) {
  try { if (verifyDb) verifyDb.close(); } catch { /* ignore */ }
  try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* ignore */ }
  try { if (fs.existsSync(`${target}.sha256`)) fs.unlinkSync(`${target}.sha256`); } catch { /* ignore */ }
  fail(`La copia no superó la verificación: ${err.message}`);
}
