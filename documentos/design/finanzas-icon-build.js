/**
 * Rehace los PNG de instalación de Finanzas desde el original.
 *
 *   node documentos/design/finanzas-icon-build.js
 *
 * Entrada:  documentos/design/finanzas-icon-source.jpg
 * Salida:   public/finanzas/icon-{180,192,512}.png y icon-512-maskable.png
 *
 * POR QUÉ ESTO EXISTE
 *
 * El original es una ilustración generada: el cuadrado del ícono viene
 * FLOTANDO sobre un fondo crema, con sus propias esquinas redondeadas y una
 * sombra abajo. Subido tal cual, iOS le aplica encima SU máscara y quedan
 * cuatro medialunas crema en los bordes. El ícono tiene que ir a sangre.
 *
 * Recortar al cuadrado no alcanza, porque las esquinas redondeadas siguen
 * dejando crema. Y la esquina no es un arco de círculo sino un squircle —
 * medida sobre el original, la curva no cierra con ningún radio único— así que
 * tampoco sirve fabricar una máscara de `border-radius` y esperar que calce.
 *
 * Entonces la máscara se DERIVA de la propia imagen: flood fill desde el marco
 * sobre los pixeles claros y sin saturación, y lo que quede conectado al borde
 * se pinta del verde del borde del ícono. Al ir desde el marco y no por color
 * suelto, un pixel claro dentro del dibujo nunca se toca.
 */

const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'documentos/design/finanzas-icon-source.jpg')
const OUT = path.join(ROOT, 'public/finanzas')

/** El verde del borde exterior del ícono. Es el mismo `background_color` del manifest. */
const FILL = [27, 116, 72] // #1B7448
/** Cuánto se come del borde. El antialias crema→verde deja una orla clara si no; son 3px sobre una banda de ~10. */
const GROW = 3
/** Android recorta el maskable a un círculo del 80%. El dibujo llega al borde, así que entra al 78%. */
const MASKABLE = 0.78

async function main() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const N = W * H

  const px = (i) => [data[i * C], data[i * C + 1], data[i * C + 2]]

  // Claro y sin saturación: el crema del fondo y la sombra gris. El oro más
  // brillante del dibujo tiene r-b ~110, así que no entra; los verdes menos.
  const isBg = (i) => {
    const [r, g, b] = px(i)
    return Math.max(r, g, b) - Math.min(r, g, b) < 22 && r > 190
  }

  // ── Flood fill desde el marco ───────────────────────────────────────────
  const outside = new Uint8Array(N)
  const queue = new Int32Array(N)
  let head = 0, tail = 0
  const push = (i) => { if (!outside[i] && isBg(i)) { outside[i] = 1; queue[tail++] = i } }
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
  while (head < tail) {
    const i = queue[head++], x = i % W, y = (i / W) | 0
    if (x > 0) push(i - 1)
    if (x < W - 1) push(i + 1)
    if (y > 0) push(i - W)
    if (y < H - 1) push(i + W)
  }

  // ── Dilatación separable, para comerse el antialias ─────────────────────
  const grow = (src) => {
    const tmp = new Uint8Array(N), dst = new Uint8Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0
      for (let d = -GROW; d <= GROW && !v; d++) {
        const xx = x + d
        if (xx >= 0 && xx < W && src[y * W + xx]) v = 1
      }
      tmp[y * W + x] = v
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0
      for (let d = -GROW; d <= GROW && !v; d++) {
        const yy = y + d
        if (yy >= 0 && yy < H && tmp[yy * W + x]) v = 1
      }
      dst[y * W + x] = v
    }
    return dst
  }
  const mask = grow(outside)

  const rgb = Buffer.alloc(N * 3)
  for (let i = 0; i < N; i++) {
    const [r, g, b] = mask[i] ? FILL : px(i)
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b
  }

  // ── Recorte cuadrado ────────────────────────────────────────────────────
  // El cuadro se mide sobre el dibujo en vez de ir a mano, así el script
  // sobrevive a que se cambie el original por otro.
  const isGreen = (i) => { const [r, g, b] = px(i); return g > r + 18 && g > b + 12 }
  let minX = W, maxX = -1, minY = H, maxY = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isGreen(y * W + x)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  // El dibujo no es exactamente cuadrado (viene de un generador). Se toma el
  // lado mayor y se centra: lo que sobra cae en zona rellenada, que ya es del
  // color del borde, así que solo engrosa el borde un pelo. Deformar el dibujo
  // para forzar el cuadrado sería peor: los ojos son círculos.
  const side = Math.max(maxX - minX + 1, maxY - minY + 1)
  const left = Math.round((minX + maxX) / 2 - side / 2)
  const top = Math.round((minY + maxY) / 2 - side / 2)
  if (left < 0 || top < 0 || left + side > W || top + side > H) {
    throw new Error(`El cuadro ${side}px en (${left},${top}) se sale de la imagen ${W}×${H}`)
  }
  console.log(`dibujo ${maxX - minX + 1}×${maxY - minY + 1} → cuadro ${side}px en (${left},${top})`)

  const square = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .extract({ left, top, width: side, height: side })
    .png()
    .toBuffer()

  for (const size of [180, 192, 512]) {
    await sharp(square)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `icon-${size}.png`))
  }

  const inner = Math.round(512 * MASKABLE)
  const offset = Math.round((512 - inner) / 2)
  await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: FILL[0], g: FILL[1], b: FILL[2] } } })
    .composite([{ input: await sharp(square).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer(), top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'icon-512-maskable.png'))

  console.log('listo: icon-180 / icon-192 / icon-512 / icon-512-maskable')
}

main().catch((e) => { console.error(e); process.exit(1) })
