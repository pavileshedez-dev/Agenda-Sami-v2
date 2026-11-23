# Verificación realizada

Fecha: 2026-11-21  
Entorno: Windows 11, Node.js v24.22.1, npm 11.19.1, Chromium de Playwright.  
**No hay ejecución real en Linux ni en ARM64**; la validación es equivalente de
Node/build/navegador, no una validación del VPS definitivo.

## Instalación de dependencias

En una copia limpia del paquete:

```bash
npm ci --no-audit --no-fund
```

Resultado: **502 paquetes instalados**. npm mostró un aviso de `install-scripts`
para `esbuild@0.27.3`; no impidió instalar ni compilar.

## Lint y pruebas de proyecto

Resultados sobre el código actual:

- `npm run lint`: **0 errores**.
- `npm test`: **112 pruebas en 12 suites, 0 fallos**.
- `node scripts/mascot-logic.test.mjs`: **4/4**.
- Restauración aislada de backup: **19 tablas, 0 secretos filtrados**.

## Pruebas E2E

Se añadió Playwright en `tests/e2e/` (fuera del paquete de producción), con
servidor real y base SQLite temporal.

```bash
npm run build
npm --prefix tests/e2e test
```

Resultado final:

```text
15 passed
```

Cubre login/logout, sesión, calendario, Planes/Vacaciones, selector DST,
cancelación DST, tareas/agenda, Pibble/Capilámpara, caricias, Pibblino,
mandarina, atuendo, momento juntos, móvil, foco y accesibilidad básica.

## Build

```bash
npm run build
```

Resultado:

- Vite 7.3.1.
- **1.774 módulos transformados**.
- PWA `generateSW`.
- **120 entradas de precache (4.386,01 KiB)**.
- `dist/sw.js` generado.

## Runtime

Servidor arrancado con base temporal aislada:

```json
{"status":"ok","database":"ok","schemaOk":true,"schemaVersion":"009_security_sessions_hardening.sql"}
```

## Smoke test

`scripts/smoke-test.mjs` pasó: health 200, sesión anónima segura, 401 en rutas
privadas, 404 JSON y cabeceras de seguridad.

## Backup verificado

`scripts/backup-verified.mjs` se probó con una base temporal:

- `VACUUM INTO` desde conexión read-only.
- `integrity_check`: ok.
- `foreign_key_check`: 0 violaciones.
- SHA-256 y sidecar `.sha256`.

## Pendiente de verificación real

- `npm ci` y build en **Ubuntu 24.04 ARM64** real.
- Instalación systemd, timers y permisos en el VPS.
- Cloudflare Tunnel y Access.
- Copia offsite y alertas externas.
