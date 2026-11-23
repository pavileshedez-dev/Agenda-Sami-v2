# Cloudflare Tunnel + Access para Agenda Sami

Objetivo: publicar **solo** la aplicación, sin abrir puertos entrantes, con el
servicio Node escuchando en `127.0.0.1:3001` y Cloudflare Access como capa
externa adicional al login propio.

## Orden obligatorio

1. Servicio local funcionando y verificado.
2. Túnel creado y conectado.
3. **Cloudflare Access configurado para el hostname.**
4. Sólo entonces crear/publicar la ruta DNS del hostname.

No publicar el hostname antes de Access: cualquiera que lo descubra podría
llegar al login de Agenda Sami.

## 1. Servicio local

Verificar:

```bash
ss -ltnp | grep ':3001'
# 127.0.0.1:3001, no 0.0.0.0
curl -fsS http://127.0.0.1:3001/api/health
```

El servidor fija `HOST=127.0.0.1` en código. No cambiar el servicio para
escuchar en todas las interfaces.

## 2. Instalar cloudflared

Usar el paquete oficial de Cloudflare para la distribución o el binario
verificado. Comprobar:

```bash
cloudflared --version
```

No ejecutar cloudflared como root si no es necesario. El túnel necesita leer
sus credenciales y conectar por salida HTTPS/QUIC.

## 3. Crear el túnel

En una terminal con acceso al navegador:

```bash
cloudflared tunnel login
cloudflared tunnel create agenda-sami
```

Anotar el UUID que devuelve. Las credenciales se guardan normalmente en
`~/.cloudflared/<UUID>.json`; en producción deben moverse a
`/etc/cloudflared/<UUID>.json` con permisos restrictivos.

Copiar el ejemplo:

```bash
sudo install -d -o root -g cloudflared -m 0750 /etc/cloudflared
sudo install -m 0640 -o root -g cloudflared \
  deploy/cloudflared-config.yml.example /etc/cloudflared/config.yml
sudo editor /etc/cloudflared/config.yml
```

Sustituir:

- `REEMPLAZAR_TUNNEL_UUID` por el UUID real;
- `REEMPLAZAR_TUNNEL_UUID.json` por el archivo de credenciales real;
- `agenda.example.com` por el dominio real.

No incluir el archivo de credenciales en el paquete ni en git.

## 4. Probar el túnel sin publicar Access

Arrancar temporalmente:

```bash
sudo cloudflared tunnel --config /etc/cloudflared/config.yml run
```

La configuración debe apuntar a:

```yaml
service: http://127.0.0.1:3001
```

Si el túnel conecta pero el servicio no responde, revisar `systemctl status
agenda-sami` y `journalctl -u agenda-sami`.

## 5. Configurar Cloudflare Access

En el panel de Cloudflare, para la zona del dominio:

1. Zero Trust → Access → Applications → Add an application → Self-hosted.
2. Hostname: el mismo `agenda.example.com`.
3. Crear una política, por ejemplo:
   - Allow;
   - Include → Emails → el correo de Sami;
   - o Include → Emails ending in `@dominio-permitido`.
4. Sesión: duración razonable (por ejemplo 24 h o 7 días).
5. Guardar y probar en una ventana privada: debe aparecer la pantalla de
   Cloudflare Access antes de la aplicación.

No crear la ruta DNS pública hasta que Access esté guardado y probado.

## 6. Crear la ruta DNS

Cuando Access ya esté activo:

```bash
cloudflared tunnel route dns agenda-sami agenda.example.com
```

Esto crea el CNAME del hostname hacia el túnel. Comprobar en DNS que el registro
es el esperado.

## 7. Servicio systemd de cloudflared

```bash
sudo install -m 0644 deploy/cloudflared.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

La unidad de ejemplo usa `/etc/cloudflared/config.yml`. Ajustar el usuario
`cloudflared` si se usa otro.

## 8. Verificación

Desde fuera de la red local:

```bash
curl -I https://agenda.example.com
```

Esperado sin sesión de Access: redirección a la pantalla de Access, no un 200
de la aplicación. Tras autenticarse en Access, debe aparecer el login propio de
Agenda Sami; Access no sustituye ese login.

Comprobar también:

- `HOST=127.0.0.1` y `ss` no muestra `0.0.0.0:3001`;
- `ALLOWED_ORIGINS` coincide exactamente con el hostname público;
- `TRUST_PROXY=true` sólo si cloudflared está en loopback;
- cookies `Secure` y `HttpOnly` en producción;
- `/api/health` no expone rutas de SQLite;
- los backups no son accesibles desde el hostname público.

## 9. Firewall y exposición

- No abrir `3001` en el firewall.
- No publicar `server/data`, `backups_auto` ni archivos `.env`.
- Mantener el servicio Node en loopback.
- Mantener Access y el login de la aplicación activos.
- Revisar logs de Access y de `cloudflared` tras la publicación.
