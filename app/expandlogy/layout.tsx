import type { Metadata } from 'next'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: project }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('projects').select('id').eq('slug', 'expandlogy').single(),
  ])

  if (profile?.role !== 'admin') {
    if (!project) redirect('/')
    const { data: access } = await admin
      .from('project_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('project_id', project.id)
      .maybeSingle()
    if (!access) redirect('/')
  }

  return (
    <div id="exp-root" data-accent={ACCENT} data-mode={MODE} className="min-h-screen">
      <MockDataProvider>{children}</MockDataProvider>
    </div>
  )
}
