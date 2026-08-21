'use client'

import { IconChevronRight } from '@tabler/icons-react'
import { MORE_ITEMS, type NavItem } from '../components/nav-items'
import { useFinanzas } from '../components/data-context'
import { AmountUSD } from '../components/amount'
import { PageHeader } from '../components/tx-row'
import { IconChip } from '../components/ui'
import { FzLink } from '../components/router'

/**
 * Índice de las secciones que no entran en la tab bar. Se arma solo desde
 * MORE_ITEMS, así que una sección nueva en nav-items aparece acá sin tocar
 * esta pantalla.
 *
 * En escritorio la sidebar ya lista todo y esta ruta queda como índice
 * redundante pero válido — no se esconde: llegar por URL no debería dar 404
 * visual.
 */
export function MasScreen() {
  const { shared, recurring, loading } = useFinanzas()

  // El menú no es una lista muerta: los datos ya están en el contexto, así que
  // cada card puede decir en qué estado está su sección sin pedir nada extra.
  const meta: Record<string, React.ReactNode> = {}
  if (!loading) {
    if (recurring.pending > 0) {
      meta['/finanzas/fijos'] = (
        <span style={{ color: 'var(--fz-out-text)' }}>
          {recurring.pending} {recurring.pending === 1 ? 'pendiente' : 'pendientes'}
        </span>
      )
    } else if (recurring.total > 0) {
      meta['/finanzas/fijos'] = <span className="text-[var(--fz-ink-3)]">al día</span>
    }

    if (shared.por_cobrar_usd > 0) {
      meta['/finanzas/deudas'] = (
        <span style={{ color: 'var(--fz-out-text)' }}>
          <AmountUSD value={shared.por_cobrar_usd} />
        </span>
      )
    }
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader title="Más" subtitle="Todo lo que no entra en la barra" />

      <div className="flex flex-col gap-3 min-[600px]:grid min-[600px]:grid-cols-2 min-[600px]:items-start">
        {MORE_ITEMS.map(item => (
          <MoreCard key={item.href} item={item} meta={meta[item.href]} />
        ))}
      </div>
    </div>
  )
}

function MoreCard({ item, meta }: { item: NavItem; meta?: React.ReactNode }) {
  const { Icon } = item
  return (
    <FzLink
      href={item.href}
      className="flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 active:brightness-[0.97] hover:brightness-[0.99] transition-[filter]"
    >
      <IconChip>
        <Icon size={20} stroke={1.9} />
      </IconChip>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-[16px] font-semibold tracking-[-0.01em] truncate">{item.label}</span>
          {/* Se reserva su ancho pero no empuja al título: el meta es dato, no
              etiqueta, y con `shrink-0` un monto largo no se corta a la mitad. */}
          {meta && <span className="text-[13px] font-semibold fz-num shrink-0 ml-auto">{meta}</span>}
        </span>
        {item.description && (
          <span className="block mt-0.5 text-[13px] text-[var(--fz-ink-2)] leading-snug">
            {item.description}
          </span>
        )}
      </span>
      <IconChevronRight size={18} stroke={2} className="text-[var(--fz-ink-3)] shrink-0 self-center" />
    </FzLink>
  )
}
