import type { Metadata, Viewport } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { AccessGate } from '@/components/AccessGate'
import { GasRouterProvider } from './router'
import { GasProvider } from './components/data'
import './theme.css'

// Tipografía propia de la mini-app: el Hub usa Plus Jakarta Sans y Gas no la
// hereda (cada mini-app define su identidad). Space Grotesk por las cifras, que
// acá son casi todo: odómetro, bolivianos y kilómetros.
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-gas',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Gas',
  description: 'Kilometraje y gasto por auto',
  // El manifest se enlaza SOLO desde acá y no con `app/manifest.ts`, que lo
  // inyectaría en todas las páginas del Hub.
  manifest: '/gas/manifest',
  appleWebApp: {
    // Sin esto, "Agregar a inicio" en iPhone abre Safari con su barra en vez de
    // la app a pantalla completa.
    capable: true,
    // El nombre que queda bajo el ícono en la pantalla de inicio.
    title: 'Gas',
    statusBarStyle: 'default',
  },
  icons: {
    // iOS no lee los íconos del manifest: necesita `apple-touch-icon`. Sin
    // esto, agregar la app a la pantalla de inicio le saca una captura borrosa
    // a la página en vez de usar un ícono.
    apple: [{ url: '/gas/icon-180', sizes: '180x180', type: 'image/png' }],
  },
}

/**
 * Pinta la barra del navegador en iOS con el canvas de la mini-app. Sin esto
 * hereda el negro del Hub, que no existe en ninguna parte de Gas.
 */
export const viewport: Viewport = {
  themeColor: '#F2F1ED',
  viewportFit: 'cover',
}

/*
  `h-[100dvh] overflow-hidden` y no `min-h-screen`: la pantalla se divide en dos
  secciones y solo el historial scrollea. `dvh` y no `vh` porque en Safari de
  iPhone la barra de direcciones se encoge al scrollear, y con `vh` la sección
  de abajo quedaba cortada por debajo del borde visible.

  El gate vive en <AccessGate>. Este layout no toca la base a propósito: en
  cuanto lo hiciera, la ruta pasaría a dinámica y cada navegación costaría un
  viaje al servidor.
*/
export default function GasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="gas-root"
      className={`${grotesk.variable} font-[family-name:var(--font-gas)] h-[100dvh] overflow-hidden`}
    >
      <AccessGate project="gas">
        <GasRouterProvider>
          <GasProvider>{children}</GasProvider>
        </GasRouterProvider>
      </AccessGate>
    </div>
  )
}
