import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { Shell } from './components/shell'
import './theme.css'

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales',
}

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Mini-app personal: no hay chequeo de project_access porque no hay nada que
  // compartir. El único gate es ser admin.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return (
    <div id="fz-root">
      <Shell>{children}</Shell>
    </div>
  )
}
