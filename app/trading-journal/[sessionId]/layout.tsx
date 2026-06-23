import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SessionActions } from './session-actions'

interface Props {
  children: React.ReactNode
  params: Promise<{ sessionId: string }>
}

export default async function SessionLayout({ children, params }: Props) {
  const { sessionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('tj_sessions')
    .select('id, name, type')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) redirect('/trading-journal')

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-slate-200/80 dark:border-zinc-800/60">
        <Link
          href="/trading-journal"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium uppercase tracking-wider">
            {session.type === 'backtesting' ? 'Backtesting' : 'Journal'}
          </p>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{session.name}</h1>
        </div>

        <SessionActions
          sessionId={session.id}
          sessionName={session.name}
          sessionType={session.type}
        />
      </header>

      <div className="flex-1">{children}</div>
    </div>
  )
}
