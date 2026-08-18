import type { Metadata } from 'next'
import { requireProjectAccess } from '@/lib/access'
import { MockDataProvider } from './components/mock-store'

export const metadata: Metadata = {
  title: 'Expandlogy',
  description: 'Organización de clientes, onboarding y generación de creativos/copys con IA',
}

// Prototipo visual: sin tablas propias ni persistencia. El único contacto con
// Supabase es el gate de acceso del Hub. El tema es fijo a propósito — no se
// lee la preferencia del perfil para que el mockup no dependa de datos de usuario.
const ACCENT = 'blue'
const MODE = 'dark'

export default async function ExpandlogyLayout({ children }: { children: React.ReactNode }) {
  await requireProjectAccess('expandlogy')

  return (
    <div id="exp-root" data-accent={ACCENT} data-mode={MODE} className="min-h-screen">
      <MockDataProvider>{children}</MockDataProvider>
    </div>
  )
}
