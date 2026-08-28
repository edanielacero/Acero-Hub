import { ImageResponse } from 'next/og'
import { IconMark } from '../icon-mark'

/** Ícono de instalación, 180×180. El dibujo vive en `icon-mark.tsx`. */
export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<IconMark size={180} />, { width: 180, height: 180 })
}
