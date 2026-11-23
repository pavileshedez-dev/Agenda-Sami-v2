# Pruebas E2E reales

Las pruebas están fuera del paquete de producción, en:

```text
tests/e2e/
```

No se incluyen en `deployment-package/` porque no son necesarias para ejecutar
la aplicación y añadirían Playwright al servidor.

## Preparación

Desde la raíz de Agenda Sami:

```bash
npm ci
npm run build
npm --prefix tests/e2e ci
npm --prefix tests/e2e exec playwright install chromium
```

En Linux/ARM64, el navegador debe ser el binario de Playwright para esa
arquitectura; no se ha validado todavía.

## Ejecución

```bash
npm --prefix tests/e2e test
```

El `webServer` de Playwright arranca `tests/e2e/support/server.mjs`, que:

- crea una SQLite temporal en el directorio temporal del sistema;
- establece una contraseña E2E conocida solo en esa base;
- arranca el servidor real con `NODE_ENV=test`;
- sirve el `dist` real;
- **nunca abre `server/data/agenda_sami.sqlite`**.

## Cobertura actual

15 pruebas:

1. Login inválido, login válido y logout.
2. Persistencia de sesión y redirección de ruta privada sin cookie.
3. Crear Plan desde el diálogo real y persistirlo.
4. Crear Vacaciones con rango y persistirlas.
5. Opciones exactas del selector de categorías.
6. DST de primavera: hora inexistente, selector y persistencia.
7. Cancelar el selector DST sin crear jornada.
8. Render de Pibble/Capilámpara y cambio de frames.
9. Caricias, mensaje aprobado y Pibblino.
10. Mandarina, atuendo y accesibilidad básica de imagen.
11. Momento juntos de 4 actos y retorno al estado inicial.
12. Navegación móvil y ausencia de desbordamiento horizontal.
13. Diálogo, labels y retorno de foco.
14. Crear tarea desde Hoy y persistirla.
15. Navegar a Agenda conservando la sesión.

## Resultado

En Windows 11, Node.js v24.22.1, Chromium de Playwright:

```text
15 passed
```

No se ha ejecutado esta suite en Linux ARM64 ni contra Cloudflare Tunnel.
