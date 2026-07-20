import type { Metadata } from 'next'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Get Leads',
  description: 'Gestión y captura de leads',
}

export default async function GetLeadsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return <>{children}</>
}
