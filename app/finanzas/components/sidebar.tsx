'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, isActive } from './nav-items'
import { CURRENCY_META } from '@/lib/finanzas/types'
import { CurrencyIcon } from './currency-icon'
import { useFinanzas } from './data-context'

/**
 * Sidebar del modo dashboard. Al pie va la tarjeta de tipo de cambio — el slot
 * que en la referencia de escritorio ocupaba "Upgrade to Pro".
 *
 * Queda fija al alto del viewport mientras la columna derecha scrollea. Dos
 * piezas que van juntas o no funciona:
 *   - `self-start` cancela el `align-items: stretch` del flex padre. Sin esto
 *     el aside mide lo mismo que la fila entera y sticky no tiene recorrido
 *     donde pegarse: se comporta como estático.
 *   - `top-5` empata con el `p-5` (20px) del contenedor en <Shell>, así que al
 *     estar arriba del todo la sidebar ya nace en su posición final y no da el
 *     salto típico del sticky mal calzado.
 * El `overflow-x: clip` del padre es compatible a propósito — `clip` no crea
 * scroll container (a diferencia de `hidden`), que sí rompería este sticky.
 */
export function Sidebar() {
  const pathname = usePathname()
  const { rates, rateList } = useFinanzas()

  // Solo las que se mueven: mostrar "1.00 USD por 1 USDT" no le sirve a nadie.
  const volatiles = (['BOB', 'BTC'] as const).filter(c => rates[c] != null)

  return (
    <aside className="hidden min-[900px]:flex flex-col sticky top-5 self-start h-[calc(100dvh-40px)] w-[248px] shrink-0 bg-[var(--fz-surface)] rounded-[var(--fz-r-card)] shadow-[var(--fz-sh-rest)] p-4">
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
      </div>
    </aside>
  )
}
