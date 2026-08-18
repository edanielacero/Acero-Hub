import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { requireProjectAccess } from '@/lib/access'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-tj',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Registro y análisis de operaciones de trading',
}

export default async function TradingLayout({ children }: { children: React.ReactNode }) {
  // El tema sale de `profiles`, así que acá la consulta no se puede evitar —
  // pero el gate ya no cuesta un getUser() ni una query a `projects` aparte.
  const { profile } = await requireProjectAccess('trading-journal', {
    profileFields: ['accent_color', 'color_mode'],
  })

  const accent = profile?.accent_color ?? 'blue'
  const mode   = profile?.color_mode   ?? 'dark'

  return (
    <div id="tj-root" data-accent={accent} data-mode={mode} className={`${inter.variable} font-[family-name:var(--font-tj)] min-h-screen`}>
      {children}
    </div>
  )
}
