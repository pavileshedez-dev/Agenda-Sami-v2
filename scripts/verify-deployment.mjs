#!/usr/bin/env node
/**
 * Verificación estructural del paquete de despliegue.
 * No necesita red, no abre la base de datos y no modifica archivos.
 *
 * Uso:
 *   node scripts/verify-deployment.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  '.env.example',
  'server/index.js',
  'server/db.js',
  'server/migrator.js',
  'server/routes/auth.js',
  'server/routes/backup.js',
  'server/migrations/001_initial_schema.sql',
  'server/migrations/009_security_sessions_hardening.sql',
  'src/main.jsx',
  'src/App.jsx',
  'public/logo.png',
  'public/pwa-192x192.png',
  'public/pwa-512x512.png',
  'public/sprites/manifest.json',
  'public/sprites/pibble.png',
  'public/sprites/capilampara.png',
  'public/mascots/pixel-v5/pibble/idle/f0.png',
  'public/mascots/pixel-v5/capilampara/idle/f0.png',
  'scripts/init-admin.mjs',
  'scripts/smoke-test.mjs',
  'scripts/backup-verified.mjs',
];

const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error('Faltan archivos obligatorios:');
  for (const rel of missing) console.error(` - ${rel}`);
  process.exit(1);
}

const forbidden = [
  '.env',
  'node_modules',
  'Calendario',
  'Agents',
  'server/data/agenda_sami.sqlite',
  'server/data/backups_auto',
  'public/sprites-backup-20261114',
  'public/sprites/preview.html',
  'public/logo.app.jpg',
];
const foundForbidden = forbidden.filter((rel) => fs.existsSync(path.join(root, rel)));
if (foundForbidden.length) {
  console.error('Se encontraron elementos prohibidos en el paquete:');
  for (const rel of foundForbidden) console.error(` - ${rel}`);
  process.exit(1);
}

function countFiles(rel, predicate = () => true) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) n += countFiles(child, predicate);
    else if (predicate(entry.name)) n += 1;
  }
  return n;
}

function totalBytes(rel) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(target).reduce((sum, name) => sum + totalBytes(path.join(rel, name)), 0);
}

const migrations = fs.readdirSync(path.join(root, 'server/migrations')).filter((f) => f.endsWith('.sql')).sort();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const size = totalBytes('.');
console.log(JSON.stringify({
  ok: true,
  package: packageJson.name,
  version: packageJson.version,
  migrations,
  migrationCount: migrations.length,
  publicFileCount: countFiles('public'),
  pngCount: countFiles('public', (name) => name.toLowerCase().endsWith('.png')),
  packageBytes: size,
  packageMiB: Number((size / 1024 / 1024).toFixed(2)),
  forbidden: [],
}, null, 2));
