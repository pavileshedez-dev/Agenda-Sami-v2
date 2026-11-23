# Estado real de Pibble y Capilámpara

Fecha: 21/11/2026. Este documento describe **lo que la UI utiliza realmente**.
No cambia ningún diseño aprobado.

## Fuente de verdad

La UI de mascotas (`MascotFigure`, `MascotAvatar`, `MascotStage`, `Companeros`)
usa `src/components/mascots/pixelManifest.js` y los PNG de
`public/mascots/pixel-v5/`.

`spriteManifest.js` y `public/sprites/` siguen existiendo, pero **no son la
fuente que renderiza la UI actual**.

## Estados conectados

### Pibble — 7 estados

| Estado | Frames | FPS |
|---|---:|---:|
| `idle` | 4 | 3 |
| `sleep` | 4 | 2.5 |
| `belly` | 4 | 3.5 |
| `belly_rub` | 6 | 7 |
| `happy` | 4 | 6 |
| `bark` | 4 | 7 |
| `pibblino` | 4 | 4 |

### Capilámpara — 4 estados

| Estado | Frames | FPS |
|---|---:|---:|
| `idle` | 4 | 3 |
| `lamp` | 4 | 4.5 |
| `study` | 6 | 3.5 |
| `pet` | 4 | 5 |

Total conectado: **11 estados, 48 PNG**.

## Interacciones conectadas

- Acariciar a Pibble (`patPibble`) y a Capilámpara (`patCapilampara`).
- Pedir/rascar pancita (`belly`, `belly_rub`).
- Ladrido (`bark`).
- Dormir/despertar (`sleep`, wake reaction).
- Pibblino tras 5 caricias seguidas.
- Encender/apagar la mandarina (`lamp`).
- Atuendo de estudio (`study`).
- Momento juntos de 4 actos.
- Álbum de poses, con 11 entradas en `POSE_CATALOG`.

## Estados del README que no están conectados

`README.md` menciona 17 estados de Pibble y 11 de Capilámpara, a 48×48. Eso
corresponde al manifiesto antiguo y a `public/sprites`, no a la UI actual.
En el manifiesto actual no están conectados:

- `walk`, `run`, `sit`, `lie`, `play`, `scratch`, `grin/growl`, `salute`.
- Los estados de la variante universitaria de Capilámpara.
- Cualquier animación de 48×48 del paquete `sprites`.

No se han inventado ni marcado como conectados.

## Discrepancias de recursos

- Los PNG actuales de `pixel-v5` son de **96×96 y 128×128**, no 48×48.
- `pixelManifest.js` construye rutas absolutas `/mascots/...`; funciona en la
  raíz, pero no respeta `AGENDA_BASE` si se despliega en subruta.
- Las partículas de caricias están dibujadas con caracteres Unicode, no con
  sprites pixel-art.

## Pendiente de decisión de producto

1. Actualizar el README para reflejar 7 + 4 estados.
2. O conectar el repertorio antiguo y crear los estados que falten.
3. Decidir si la variante universitaria debe ser una animación o una capa
   estática.
4. Validar visualmente todos los estados con una persona, no solo por tests.

No se ha modificado ningún personaje ni sprite.
