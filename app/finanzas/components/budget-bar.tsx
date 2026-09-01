'use client'

import type { BudgetBarView } from '@/lib/finanzas/budgets'

/**
 * La barra de progreso de un presupuesto — la misma en la Home, en el card
 * general y en cada card por categoría, así los tres no pueden divergir.
 *
 * Lo que pinta sale entero de `budgetBarView`:
 *
 *   · `fillPct` — el relleno, siempre desde la izquierda.
 *   · `reservedPct` — pegado a su derecha, en el mismo color pero tenue: los
 *     fijos del mes que todavía no se pagaron. El número grande ya los
 *     descuenta, así que sin este tramo la card mostraba menos disponible que
 *     lo presupuestado sin decir por qué.
 *   · `tickPct` — la marca del día, o sea por dónde va el mes. Es la misma
 *     posición en los dos modos y avanza hacia el tope, que es lo que la
 *     vuelve legible como "se está acabando el presupuesto".
 *
 * El `marginLeft: -1px` es para que el tick no se pierda: son 2px dentro de un
 * carril con `overflow-hidden`, así que en el día 1 (0%) o el último (100%)
 * quedaba justo sobre el borde y no se veía ninguno de los dos días.
 */
const BAR_HEIGHT = { xs: 'h-1.5', sm: 'h-2', md: 'h-3' } as const

export function BudgetBar({ view, onDark = false, size = 'md', tick = true, reserved = true }: {
  view: BudgetBarView
  /** Sobre el hero oscuro: carril y tick en blancos translúcidos. */
  onDark?: boolean
  size?: keyof typeof BAR_HEIGHT
  /** Las barritas del carrusel de la Home son de 6px y no llevan tick — a esa
      altura la marca es un punto que no se lee. */
  tick?: boolean
  /** Igual que `tick`: en la barrita de 6px el tramo reservado no se lee. */
  reserved?: boolean
}) {
  const trackClass = onDark ? 'bg-white/12' : 'bg-[var(--fz-hairline)]'
  const tickClass = onDark ? 'bg-white/45' : 'bg-[var(--fz-ink-3)]'
  const color = view.danger ? 'var(--fz-out)' : 'var(--fz-accent)'

  return (
    <div
      className={`relative ${BAR_HEIGHT[size]} rounded-full ${trackClass} overflow-hidden`}
      title={tick ? `Al día de hoy deberías ir por el ${Math.round(view.tickPct)}% del mes` : undefined}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${view.fillPct}%`, background: color }}
      />
      {/* Mismo color que el relleno, a menos de la mitad de opacidad: se lee
          como "de la misma familia, pero todavía no gastado". Un color propio
          lo habría convertido en una tercera cosa que hay que aprender. */}
      {reserved && view.reservedPct > 0 && (
        <div
          className="absolute inset-y-0"
          style={{ left: `${view.fillPct}%`, width: `${view.reservedPct}%`, background: color, opacity: 0.38 }}
        />
      )}
      {tick && (
        <div
          className={`absolute inset-y-0 w-[2px] ${tickClass}`}
          style={{ left: `${view.tickPct}%`, marginLeft: '-1px' }}
          aria-hidden
        />
      )}
    </div>
  )
}
