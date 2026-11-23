# Requisitos del VPS y arquitectura de tres proyectos

## Sistema

- Ubuntu 24.04 LTS, x86_64 o ARM64.
- Node.js **24 LTS** oficial. No usar Node 22.5–22.12: `node:sqlite` no está
  disponible sin flag hasta Node 22.13.
- `systemd`, `bash`, `curl` (opcional para diagnóstico), `cloudflared` si se
  publica por Tunnel.
- No se necesita Python, Docker, Nginx ni Caddy para el servicio local.

## Dimensionado

Para tres proyectos Node + SQLite similares a Agenda Sami:

| Recurso | Mínimo | Recomendado |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Swap | 2 GB | 2–4 GB |
| Disco SSD | 40 GB | 80 GB |
| Red | salida 443 | salida 443 |

Cada proceso Node en reposo suele ocupar 80–200 MB; el build de Vite puede
necesitar 1–2 GB de RAM. Si los tres proyectos se construyen en el VPS, 8 GB
es la opción segura.

## Aislamiento

```text
/opt/<proyecto>/releases/<version>
/opt/<proyecto>/current
/var/lib/<proyecto>
/etc/<proyecto>/<proyecto>.env
/var/lib/<proyecto>/backups_auto
```

Cada proyecto debe tener:

- usuario de sistema propio;
- puerto propio (3001, 3002, 3003);
- servicio systemd propio;
- base SQLite y backups propios;
- hostname y política de Cloudflare Access propios.

Un solo túnel Cloudflare puede enrutar varios hostnames. No compartir la misma
base, el mismo usuario ni el mismo entorno entre proyectos.

## ARM64

Puntos comprobados por análisis, no por ejecución real:

- Node 24 LTS tiene binarios ARM64.
- El servidor sólo usa módulos nativos de Node; SQLite va integrado.
- `esbuild` y `rollup` tienen paquetes opcionales `linux-arm64`.
- `sharp` tiene binarios `linux-arm64`, pero es devDependency y no se usa en
  runtime; puede omitirse si no se necesita.
- `cloudflared` tiene binario ARM64.

**No se ha ejecutado `npm ci`, build ni la aplicación en una máquina ARM64
real.** No se simula esa validación.
