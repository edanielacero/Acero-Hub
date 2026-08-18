'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { NAV_ITEMS, isActive } from './nav-items'
import { useFinanzas } from './data-context'

/**
 * Sidebar del modo dashboard. Al pie va la tarjeta de tipo de cambio — el slot
 * que en la referencia de escritorio ocupaba "Upgrade to Pro".
 */
export function Sidebar() {
  const pathname = usePathname()
  const { settings } = useFinanzas()

  return (
    <aside className="hidden min-[900px]:flex flex-col w-[248px] shrink-0 bg-[var(--fz-surface)] rounded-[var(--fz-r-card)] shadow-[var(--fz-sh-rest)] p-4">
      <div className="flex items-center gap-2 px-2 py-3">
        <span className="grid place-items-center w-9 h-9 rounded-[var(--fz-r-chip)] bg-[var(--fz-hero)] text-[var(--fz-lime)] font-bold text-[15px]">
          F
        </span>
        <span className="text-[17px] font-bold tracking-[-0.01em]">Finanzas</span>
      </div>

      <nav className="flex flex-col gap-1 mt-3" aria-label="Navegación de Finanzas">
        {NAV_ITEMS.map(item => {
          const active = isActive(pathname, item.href, item.exact)
          const Glyph = active ? item.IconActive : item.Icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 h-11 px-3 rounded-[var(--fz-r-field)] text-[15px] font-semibold transition-colors ${
                active
                  ? 'bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
                  : 'text-[var(--fz-ink-2)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]'
              }`}
            >
              <Glyph size={20} stroke={1.8} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto pt-4 flex flex-col gap-3">
        <Link
          href="/finanzas/ajustes"
          className="block rounded-[var(--fz-r-tile)] bg-[var(--fz-hero)] p-4 text-white hover:brightness-110 transition-[filter]"
        >
          <span className="block text-[12px] font-medium text-white/60">Tipo de cambio</span>
          <span className="block mt-1 text-[22px] font-bold fz-num text-[var(--fz-lime)]">
            {settings.usd_bob_rate.toFixed(2)}
          </span>
          <span className="block text-[12px] text-white/50">Bs por 1 USD</span>
        </Link>

        <Link
          href="/"
          className="flex items-center gap-2 h-10 px-3 rounded-[var(--fz-r-field)] text-[13px] font-medium text-[var(--fz-ink-3)] hover:text-[var(--fz-ink-2)] hover:bg-[var(--fz-surface-sunk)] transition-colors"
        >
          <IconArrowLeft size={16} stroke={1.8} />
          Volver al Hub
        </Link>
      </div>
    </aside>
  )
}
