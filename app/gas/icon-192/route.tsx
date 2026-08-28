import { ImageResponse } from 'next/og'
import { IconMark } from '../icon-mark'

/** Ícono de instalación, 192×192. El dibujo vive en `icon-mark.tsx`. */
export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<IconMark size={192} />, { width: 192, height: 192 })
}
