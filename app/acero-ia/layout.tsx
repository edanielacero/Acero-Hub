import type { Metadata } from 'next'
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Shell from './components/shell'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-aia-heading',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-aia-body',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-aia-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Acero IA',
  description: 'Plataforma de inteligencia artificial con routing inteligente de modelos',
}

export default async function AceroIALayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: project }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('projects').select('id').eq('slug', 'acero-ia').single(),
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
    <div
      id="aia-root"
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      style={{
        fontFamily: 'var(--font-aia-body)',
        backgroundColor: 'var(--aia-bg-deep)',
        color: 'var(--aia-text-primary)',
      }}
    >
      <style>{`
        #aia-root {
          --aia-bg-deep: #08090a;
          --aia-bg-surface: #111214;
          --aia-bg-elevated: #1a1b1f;
          --aia-bg-hover: #222328;
          --aia-text-primary: #e8e8ed;
          --aia-text-secondary: #6b6d7b;
          --aia-text-muted: #3d3f4a;
          --aia-border: #1e1f25;
          --aia-border-active: #2a2b33;
          --aia-amber: #e5a000;
          --aia-cyan: #00b8d4;
          --aia-violet: #8b5cf6;
          --aia-magenta: #d946ef;
          --aia-success: #22c55e;
          --aia-warning: #f59e0b;
          --aia-error: #ef4444;
        }
      `}</style>
      <Shell userId={user.id}>
        {children}
      </Shell>
    </div>
  )
}
