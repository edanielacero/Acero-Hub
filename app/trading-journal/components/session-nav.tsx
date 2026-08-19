'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab { label: string; href: string; btOnly?: boolean }

const TABS: Tab[] = [
  { label: 'Dashboard',  href: '' },
  { label: 'Stats',      href: '/stats' },
  { label: 'Sweet Spot', href: '/sweetspot', btOnly: true },
]

export function SessionNav({ sessionId, sessionType }: {
  sessionId: string
  sessionType: string
}) {
  const pathname = usePathname()
  const base = `/trading-journal/${sessionId}`
  const tabs = TABS.filter(t => !t.btOnly || sessionType === 'backtesting')

  return (
    <nav className="flex border-t border-slate-200/70 dark:border-zinc-800/60 overflow-x-auto">
      {tabs.map(tab => {
        const href   = `${base}${tab.href}`
        const active = tab.href === '' ? pathname === base : pathname.startsWith(href)
        return (
          <Link
            key={tab.label}
            href={href}
            className={`shrink-0 px-4 py-2.5 text-[11.5px] font-semibold tracking-wide border-b-2 transition-colors duration-150 ${
              active
                ? 'border-[rgb(var(--a5))] text-[rgb(var(--a5))]'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
