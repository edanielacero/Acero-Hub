import type { Metadata, Viewport } from 'next'
import { Shell } from './components/shell'
import './theme.css'

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales',
}

/**
 * Pinta la barra del navegador en iOS con el canvas de la mini-app. Sin esto
 * hereda el negro del Hub, que no existe en ninguna parte de Finanzas.
 * Va acá y no en el layout raíz: es una preferencia de esta ruta, no del Hub.
 */
export const viewport: Viewport = {
  themeColor: '#F3F4F6',
  viewportFit: 'cover',
}

// El gate vive en proxy.ts, contra los permisos firmados en el token. Este
// layout no toca la base a propósito: en cuanto lo hiciera, la ruta pasaría a
// dinámica y cada navegación costaría un viaje al servidor.
export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="fz-root">
      <Shell>{children}</Shell>
    </div>
  )
}
