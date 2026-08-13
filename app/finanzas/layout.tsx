import type { Metadata, Viewport } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TabBar from './components/tab-bar'
import Sidebar from './components/sidebar'
import { ProfileProvider } from './components/profile-context'
import { AmountVisibilityProvider } from './components/amount-visibility'
import { QuickAddProvider } from './components/quick-add-context'
import './theme.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-voice',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Finanzas',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: project }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('projects').select('id').eq('slug', 'finanzas').single(),
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
    <div className={`fz-app ${spaceGrotesk.variable}`}>
      <ProfileProvider>
        <AmountVisibilityProvider>
          <QuickAddProvider>
            <div className="fz-shell">
              <Sidebar />
              <div className="fz-main">
                {children}
                <div className="fz-tabbar-spacer" />
              </div>
            </div>
            <TabBar />
          </QuickAddProvider>
        </AmountVisibilityProvider>
      </ProfileProvider>
    </div>
  )
}
