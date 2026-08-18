'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { NAV_ITEMS, isActive } from './nav-items'
import { CURRENCY_META } from '@/lib/finanzas/types'
import { CurrencyIcon } from './currency-icon'
import { useFinanzas } from './data-context'

/**
 * Sidebar del modo dashboard. Al pie va la tarjeta de tipo de cambio — el slot
 * que en la referencia de escritorio ocupaba "Upgrade to Pro".
 */
export function Sidebar() {
  const pathname = usePathname()
  const { rates, rateList } = useFinanzas()

  // Solo las que se mueven: mostrar "1.00 USD por 1 USDT" no le sirve a nadie.
  const volatiles = (['BOB', 'BTC'] as const).filter(c => rates[c] != null)

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
          <span className="flex items-baseline justify-between gap-2 mb-2">
            <span className="text-[12px] font-medium text-white/60">Tipo de cambio</span>
            {rateList.some(r => r.auto) && (
              <span className="text-[10px] font-semibold text-[var(--fz-lime)] uppercase tracking-wide">Auto</span>
            )}
          </span>
          {volatiles.map(c => (
            <span key={c} className="flex items-center gap-2 mt-1.5">
              <CurrencyIcon currency={c} size={22} />
              <span className="text-[12px] text-white/50 flex-1">{CURRENCY_META[c].symbol}</span>
              <span className="text-[17px] font-bold fz-num text-[var(--fz-lime)]">
                {rates[c]!.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </span>
          ))}
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
