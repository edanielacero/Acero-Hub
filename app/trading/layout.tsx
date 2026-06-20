import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Registro y análisis de operaciones de trading',
}

export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', 'trading-journal')
      .single()

    if (project) {
      const { data: access } = await supabase
        .from('project_access')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', project.id)
        .maybeSingle()

      if (!access) redirect('/')
    } else {
      redirect('/')
    }
  }

  return <>{children}</>
}
