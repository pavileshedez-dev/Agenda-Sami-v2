#!/usr/bin/env node
/**
 * Smoke test post-actualización para Agenda Sami.
 * Comprueba que el servicio responde correctamente, la base SQLite está sana,
 * las rutas privadas rechazan acceso anónimo, las rutas /api/* desconocidas
 * devuelven 404 JSON y las cabeceras de seguridad están activas.
 *
 * Uso:
 *   BASE_URL=http://127.0.0.1:3001 npm run smoke-test
 *   (Opcional para comprobar flujo autenticado: SMOKE_USERNAME y SMOKE_PASSWORD)
 */

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

async function run() {
  const results = [];

  // 1. /api/health
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, `Expected /api/health 200, got ${healthRes.status}`);
  assert(healthJson.status === 'ok' && healthJson.database === 'ok' && healthJson.schemaOk === true, 'Health report not ok');
  assert(!JSON.stringify(healthJson).includes('.sqlite'), 'Health must not leak SQLite paths');
  assert(healthRes.headers.get('x-content-type-options') === 'nosniff', 'Missing X-Content-Type-Options');
  assert(healthRes.headers.get('x-frame-options') === 'DENY', 'Missing X-Frame-Options');
  assert(Boolean(healthRes.headers.get('content-security-policy')), 'Missing CSP');
  results.push('OK  GET /api/health (HTTP 200, SQLite + schema + security headers)');

  // 2. /api/auth/session anónimo (sin csrfToken ni datos)
  const sessRes = await fetch(`${baseUrl}/api/auth/session`);
  const sessJson = await sessRes.json();
  assert(sessRes.status === 200, `Expected /api/auth/session 200, got ${sessRes.status}`);
  assert(sessJson.authenticated === false && sessJson.csrfToken === null && sessJson.user === null, 'Anonymous session must not expose csrfToken or user');
  results.push('OK  GET /api/auth/session anónimo (authenticated=false, csrfToken=null)');

  // 3. Rutas privadas rechazadas sin sesión
  for (const ep of ['/api/calendario/tareas', '/api/backup/verify', '/api/backup/export', '/api/trabajo/estado']) {
    const r = await fetch(`${baseUrl}${ep}`);
    assert(r.status === 401, `Expected 401 for anonymous ${ep}, got ${r.status}`);
  }
  results.push('OK  Rutas privadas rechazan acceso anónimo (HTTP 401)');

  // 4. Ruta desconocida bajo /api/* -> 404 JSON
  const unknownRes = await fetch(`${baseUrl}/api/endpoint-inexistente-smoke`);
  const unknownCt = unknownRes.headers.get('content-type') || '';
  const unknownJson = await unknownRes.json();
  assert(unknownRes.status === 404, `Expected 404 for unknown /api/*, got ${unknownRes.status}`);
  assert(unknownCt.includes('application/json'), `Expected JSON content-type, got ${unknownCt}`);
  assert(unknownJson.code === 'NOT_FOUND', 'Expected NOT_FOUND code');
  results.push('OK  GET /api/endpoint-inexistente -> HTTP 404 JSON');

  // 5. Opcional: comprobación autenticada si se pasan credenciales por entorno
  if (process.env.SMOKE_USERNAME && process.env.SMOKE_PASSWORD) {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.SMOKE_USERNAME,
        password: process.env.SMOKE_PASSWORD,
      }),
    });
    assert(loginRes.status === 200, `Expected authenticated login 200, got ${loginRes.status}`);
    const loginJson = await loginRes.json();
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const cookieHeader = setCookie.split(';')[0];
    assert(Boolean(cookieHeader) && Boolean(loginJson.csrfToken), 'Missing cookie or csrfToken on login');

    const verifyRes = await fetch(`${baseUrl}/api/backup/verify`, {
      headers: { Cookie: cookieHeader },
    });
    const verifyJson = await verifyRes.json();
    assert(verifyRes.status === 200 && verifyJson.ok === true, 'Authenticated /api/backup/verify failed');

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': loginJson.csrfToken,
      },
      body: '{}',
    });
    assert(logoutRes.status === 200, 'Logout failed');
    results.push('OK  Flujo autenticado (login -> /api/backup/verify -> logout)');
  }

  for (const line of results) console.log(line);
  console.log('\nSmoke test completado con éxito.');
}

run().catch((err) => {
  console.error('SMOKE TEST FALLIDO:', err.message);
  process.exit(1);
});
