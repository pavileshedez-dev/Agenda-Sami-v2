#!/usr/bin/env node
/**
 * Inicialización segura de contraseña de administrador / usuaria propietaria en SQLite.
 * - No contiene contraseñas por defecto ni credenciales embebidas.
 * - Exige contraseña de al menos 10 caracteres.
 * - Almacena exclusivamente el hash scrypt (sal única de 16 bytes + clave derivada de 64 bytes).
 * - Revoca sesiones previas del usuario tras establecer o rotar la contraseña.
 *
 * Uso:
 *   npm run auth:init
 *   node scripts/init-admin.mjs --username sami --name Sami [--force-reset]
 *   printf 'MiClaveSegura123!\n' | node scripts/init-admin.mjs --username sami --password-stdin [--force-reset]
 */

import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from '../server/env.js';
import { initDatabase, db, closeDatabase } from '../server/db.js';
import { hashPassword } from '../server/auth-crypto.js';
import { revokeAllUserSessions } from '../server/auth.js';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..');

loadEnv({ cwd: PROJECT_ROOT });

function parseArgs(argv) {
  const args = {
    username: 'sami',
    name: 'Sami',
    forceReset: false,
    passwordStdin: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--username' && argv[i + 1]) {
      args.username = argv[++i].trim().toLowerCase();
    } else if (token === '--name' && argv[i + 1]) {
      args.name = argv[++i].trim();
    } else if (token === '--force-reset') {
      args.forceReset = true;
    } else if (token === '--password-stdin') {
      args.passwordStdin = true;
    }
  }
  return args;
}

function readStdinAll() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
    process.stdin.on('error', reject);
  });
}

function promptHidden(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    });

    if (process.stdin.isTTY) {
      const origWrite = rl._writeToOutput.bind(rl);
      rl._writeToOutput = function (str) {
        if (str.startsWith(promptText)) {
          origWrite(promptText);
        }
      };
    }

    rl.question(promptText, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.username || !/^[a-z0-9._-]{2,40}$/.test(args.username)) {
    console.error('Error: --username debe contener entre 2 y 40 caracteres (letras minúsculas, números, ., _, -).');
    process.exit(1);
  }

  initDatabase();

  try {
    const existing = db.prepare('SELECT id, username, nombre, password_hash FROM usuarios WHERE LOWER(username) = ?').get(args.username);

    if (existing && existing.password_hash && !args.forceReset) {
      console.error(`Error: El usuario '${existing.username}' ya tiene una contraseña configurada.`);
      console.error('Si deseas rotarla explícitamente, vuelve a ejecutar con --force-reset.');
      process.exit(2);
    }

    let password;
    if (args.passwordStdin) {
      password = await readStdinAll();
    } else {
      password = await promptHidden(`Nueva contraseña para '${args.username}' (mín. 10 caracteres): `);
      const confirm = await promptHidden('Confirmar contraseña: ');
      if (password !== confirm) {
        console.error('Error: Las contraseñas no coinciden.');
        process.exit(1);
      }
    }

    if (!password || password.length < 10) {
      console.error('Error: La contraseña debe tener al menos 10 caracteres.');
      process.exit(1);
    }

    const passwordHash = hashPassword(password);

    if (existing) {
      db.prepare('UPDATE usuarios SET password_hash = ?, nombre = COALESCE(NULLIF(?, \'\'), nombre) WHERE id = ?')
        .run(passwordHash, args.name, existing.id);
      const revoked = revokeAllUserSessions(existing.id);
      console.log(`Contraseña establecida para '${existing.username}' (id=${existing.id}). Sesiones previas revocadas: ${revoked}.`);
    } else {
      const info = db.prepare("INSERT INTO usuarios (username, nombre, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(args.username, args.name || args.username, passwordHash);
      console.log(`Usuario '${args.username}' creado con contraseña segura (id=${info.lastInsertRowid}).`);
    }
  } finally {
    closeDatabase();
  }
}

main().catch((err) => {
  console.error('Error en inicialización de usuario:', err.message);
  try { closeDatabase(); } catch { /* ignore */ }
  process.exit(1);
});
