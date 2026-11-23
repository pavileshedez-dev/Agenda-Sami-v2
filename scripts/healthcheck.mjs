#!/usr/bin/env node
/**
 * Healthcheck para systemd/monitorización local.
 * Sale con código 1 si el servicio no responde o la base/esquema no está sano.
 */
const base = process.env.HEALTH_BASE_URL || 'http://127.0.0.1:3001';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);

try {
  const res = await fetch(`${base}/api/health`, { signal: controller.signal });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.status !== 'ok' || body.database !== 'ok' || body.schemaOk !== true) {
    console.error(`healthcheck fallido: HTTP ${res.status}`);
    process.exit(1);
  }
  console.log(`healthcheck OK: ${body.schemaVersion || 'schema desconocido'}`);
} catch (err) {
  console.error(`healthcheck fallido: ${err.message}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
