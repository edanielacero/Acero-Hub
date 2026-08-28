import { ImageResponse } from 'next/og'
import { IconMark } from '../icon-mark'

/** Ícono de instalación, 512×512. El dibujo vive en `icon-mark.tsx`. */
export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<IconMark size={512} />, { width: 512, height: 512 })
}
