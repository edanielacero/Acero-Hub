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

  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('profiles').select('role, accent_color, color_mode').eq('id', user.id).single(),
    supabase.from('projects').select('id').eq('slug', 'trading-journal').single(),
  ])

  if (profile?.role !== 'admin') {
    if (!project) redirect('/')
    const { data: access } = await supabase
      .from('project_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('project_id', project.id)
      .maybeSingle()
    if (!access) redirect('/')
  }

  const accent = profile?.accent_color ?? 'blue'
  const mode   = profile?.color_mode   ?? 'dark'

  return (
    <div id="tj-root" data-accent={accent} data-mode={mode} className="min-h-screen">
      {children}
    </div>
  )
}
