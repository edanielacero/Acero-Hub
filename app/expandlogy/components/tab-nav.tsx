'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/expandlogy', label: 'Home' },
  { href: '/expandlogy/onboardings', label: 'Onboardings' },
  { href: '/expandlogy/ad-generator', label: 'Ad Generator' },
  { href: '/expandlogy/campanas', label: 'Campañas' },
  { href: '/expandlogy/pagos', label: 'Pagos' },
]

export function TabNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-zinc-800 mb-6 overflow-x-auto">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              active
                ? 'accent-txt border-current'
                : 'border-transparent text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
