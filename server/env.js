import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_FILE = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(MODULE_FILE);
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..');

let loaded = false;

/**
 * Carga determinista de variables de entorno desde .env (o AGENDA_ENV_FILE)
 * sin sobrescribir variables ya presentes en process.env.
 * Nunca imprime valores de secretos.
 */
export function loadEnv(customArg = null) {
  let customEnvPath = null;
  if (typeof customArg === 'string') {
    customEnvPath = customArg;
  } else if (customArg && typeof customArg === 'object') {
    if (customArg.path) customEnvPath = customArg.path;
    else if (customArg.cwd) customEnvPath = path.join(customArg.cwd, '.env');
  }
  if (loaded && !customEnvPath) return { loaded: false, path: null };

  const envPath = customEnvPath || process.env.AGENDA_ENV_FILE || path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    if (!customEnvPath) loaded = true;
    return { loaded: false, path: null };
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const keysLoaded = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    let key = line.slice(0, eqIdx).trim();
    if (key.startsWith('export ')) {
      key = key.slice(7).trim();
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
      keysLoaded.push(key);
    }
  }

  if (!customEnvPath) loaded = true;
  return { loaded: true, path: envPath, keysCount: keysLoaded.length };
}

export function getEnvInt(name, defaultValue, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return defaultValue;
  return parsed;
}

export function getEnvBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}
