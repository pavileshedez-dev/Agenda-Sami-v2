#!/usr/bin/env node
/**
 * Migración segura de claves API heredadas desde SQLite (ajustes_usuario) hacia .env.
 * - No imprime nunca los valores de las claves en consola ni en logs.
 * - Solo escribe variables que no existan todavía en el archivo .env destino.
 * - Aplica permisos restrictivos (0600 en sistemas POSIX) al archivo .env.
 * - Elimina las claves API en claro de la tabla ajustes_usuario tras guardarlas.
 *
 * Uso:
 *   npm run secrets:migrate
 *   node scripts/migrate-secrets-to-env.mjs [--target-env /ruta/a/.env] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/env.js';
import { initDatabase, db, closeDatabase } from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..');

loadEnv({ cwd: PROJECT_ROOT });

function parseArgs(argv) {
  const args = {
    envFile: path.join(PROJECT_ROOT, '.env'),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--target-env' || argv[i] === '--out') && argv[i + 1]) {
      args.envFile = path.resolve(argv[++i]);
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

const KEY_MAP = [
  { dbKey: 'deepseek_api_key', envKey: 'DEEPSEEK_API_KEY' },
  { dbKey: 'gemini_api_key', envKey: 'GEMINI_API_KEY' },
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  initDatabase();

  try {
    const found = [];
    for (const item of KEY_MAP) {
      const row = db.prepare("SELECT clave, valor FROM ajustes_usuario WHERE clave = ? AND valor IS NOT NULL AND TRIM(valor) != ''").get(item.dbKey);
      if (row) {
        found.push({ ...item, value: String(row.valor).trim() });
      }
    }

    if (found.length === 0) {
      console.log('No se encontraron claves API heredadas en ajustes_usuario. No se requiere migración.');
      return;
    }

    console.log(`Se detectaron ${found.length} clave(s) API heredada(s) en SQLite: ${found.map((f) => f.envKey).join(', ')}.`);
    if (args.dryRun) {
      console.log('Modo --dry-run activo: no se ha modificado ningún archivo ni tabla.');
      return;
    }

    let envContent = '';
    if (fs.existsSync(args.envFile)) {
      envContent = fs.readFileSync(args.envFile, 'utf8');
    }

    const linesToAdd = [];
    for (const item of found) {
      const regex = new RegExp(`^\\s*(?:export\\s+)?${item.envKey}\\s*=`, 'm');
      if (!regex.test(envContent)) {
        const escaped = item.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        linesToAdd.push(`${item.envKey}="${escaped}"`);
      }
    }

    if (linesToAdd.length > 0) {
      const dir = path.dirname(args.envFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const prefix = envContent && !envContent.endsWith('\n') ? '\n' : '';
      const nextContent = `${envContent}${prefix}${linesToAdd.join('\n')}\n`;
      fs.writeFileSync(args.envFile, nextContent, { mode: 0o600 });
      try { fs.chmodSync(args.envFile, 0o600); } catch { /* Windows NTFS */ }
      console.log(`Variables añadidas de forma segura a ${args.envFile} (sin mostrar valores).`);
    } else {
      console.log(`Las variables ya existían en ${args.envFile}; se conservaron sin sobrescribir.`);
    }

    const del = db.prepare("DELETE FROM ajustes_usuario WHERE clave IN ('deepseek_api_key', 'gemini_api_key')");
    const info = del.run();
    console.log(`Claves API en claro eliminadas de SQLite (filas borradas: ${info.changes}).`);
  } finally {
    closeDatabase();
  }
}

try {
  main();
} catch (err) {
  console.error('Error migrando claves:', err.message);
  try { closeDatabase(); } catch { /* ignore */ }
  process.exit(1);
}
