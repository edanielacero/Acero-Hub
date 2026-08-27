import type { Metadata, Viewport } from 'next'
import { AccessGate } from '@/components/AccessGate'
import { Shell } from './components/shell'
import { ServiceWorker } from './components/service-worker'
import './theme.css'

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales',
  // El manifest se enlaza SOLO desde acá y no con `app/manifest.ts`, que lo
  // inyectaría en todas las páginas del Hub. Las notificaciones —y por lo
  // tanto la instalación— son de esta mini-app.
  manifest: '/finanzas/manifest',
  appleWebApp: {
    // Sin esto, "Agregar a inicio" en iPhone abre Safari con su barra en vez de
    // la app a pantalla completa. Y sin instalarla, iOS no entrega push.
    capable: true,
    // El nombre que queda bajo el ícono en la pantalla de inicio.
    title: 'Mis Finanzas',
    statusBarStyle: 'default',
  },
  icons: {
    // iOS no lee los íconos del manifest: necesita `apple-touch-icon`. Sin
    // esto, agregar la app a la pantalla de inicio le saca una captura borrosa
    // a la página en vez de usar un ícono.
    apple: [{ url: '/finanzas/icon-180', sizes: '180x180', type: 'image/png' }],
  },
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

// El gate vive en <AccessGate>, contra los permisos firmados en el token. Este
// layout no toca la base a propósito: en cuanto lo hiciera, la ruta pasaría a
// dinámica y cada navegación costaría un viaje al servidor.
export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="fz-root">
      <ServiceWorker />
      <AccessGate project="finanzas">
        <Shell>{children}</Shell>
      </AccessGate>
    </div>
  )
}
