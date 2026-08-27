import { ImageResponse } from 'next/og'
import { IconMark } from '../icon-mark'

/**
 * Ícono de instalación, 180×180.
 *
 * 180 es la medida que pide iOS para `apple-touch-icon`. Sin ella, al agregar
 * la app a la pantalla de inicio el iPhone toma una captura de la página —
 * borrosa y con el fondo de la app en vez de un ícono.
 *
 * El dibujo vive en `icon-mark.tsx`, compartido por las tres medidas.
 */
export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<IconMark size={180} />, { width: 180, height: 180 })
}
