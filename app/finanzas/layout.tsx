import type { Metadata, Viewport } from 'next'
import { requireAdmin } from '@/lib/access'
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

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  // Mini-app personal: no hay chequeo de project_access porque no hay nada que
  // compartir. El único gate es ser admin.
  await requireAdmin()

  return (
    <div id="fz-root">
      <Shell>{children}</Shell>
    </div>
  )
}
