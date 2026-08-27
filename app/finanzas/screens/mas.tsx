'use client'

import { MORE_ITEMS, type NavItem } from '../components/nav-items'
import { useFinanzas } from '../components/data-context'
import { AmountUSD } from '../components/amount'
import { todayISO } from '@/lib/finanzas/transactions'
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
  const { shared, recurring, pasanaku, budgets, loading } = useFinanzas()

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

    const hoy = todayISO()
    const tuTurno = pasanaku.filter(p => !p.archived && !p.received && p.expected_turn <= hoy).length
    if (tuTurno > 0) {
      meta['/finanzas/pasanaku'] = (
        <span style={{ color: 'var(--fz-out-text)' }}>Te toca</span>
      )
    }

    if (budgets.pending_closures.length > 0) {
      meta['/finanzas/presupuesto'] = (
        <span style={{ color: 'var(--fz-out-text)' }}>
          {budgets.pending_closures.length} por cerrar
        </span>
      )
    }
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader title="Más" subtitle="Todo lo que no entra en la barra" />

      {/* Cuadrados y no filas: la grilla se barre de un vistazo y cada sección
          ocupa el mismo peso visual. En filas, la que tenía descripción larga
          se veía más importante que las demás. */}
      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 min-[900px]:grid-cols-4">
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
      className="aspect-square flex flex-col justify-between rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 active:brightness-[0.97] hover:brightness-[0.99] transition-[filter]"
    >
      <IconChip>
        <Icon size={20} stroke={1.9} />
      </IconChip>

      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-[-0.01em] truncate">
          {item.label}
        </span>
        {/* El estado de la sección ocupa la línea de abajo. En el cuadrado no
            compite con el título por el ancho, así que un monto largo se lee
            entero en vez de cortarse. */}
        <span className="block mt-0.5 h-[18px] text-[13px] font-semibold fz-num truncate">
          {meta ?? <span className="text-[var(--fz-ink-3)] font-normal">{item.description}</span>}
        </span>
      </span>
    </FzLink>
  )
}
