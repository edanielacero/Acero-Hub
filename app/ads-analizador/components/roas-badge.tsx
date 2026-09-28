'use client'

import type { EstadoCampana } from '@/lib/ads-analizador/types'
import { fmtPct, fmtRoas } from '@/lib/ads-analizador/format'

/**
 * Medidor de ROAS: una regla horizontal con tres zonas —pierde plata, colchón
 * bajo, sano— y un punto donde está la campaña hoy.
 *
 * Las zonas salen del equilibrio y el objetivo de cada campaña, nunca de un
 * número fijo (regla 2 del maestro).
 */
export function RoasMedidor({ estado, compacto = false }: { estado: EstadoCampana; compacto?: boolean }) {
  const { roasActual: actual, roasEquilibrio: eq, roasObjetivo: obj, colchon } = estado
  const tope = Math.max(obj * 1.5, (actual ?? 0) * 1.12, eq * 2)
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / tope) * 100))}%`

  const colorActual = actual == null ? 'var(--ads-ink-3)'
    : actual < eq ? 'var(--ads-rojo-dot)'
      : actual < obj ? 'var(--ads-amarillo-dot)'
        : 'var(--ads-verde-dot)'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          {actual == null ? (
            <span className={`${compacto ? 'text-lg' : 'text-xl'} font-semibold text-[var(--ads-ink-3)]`}>ROAS sin datos</span>
          ) : (
            <>
              <span className={`${compacto ? 'text-2xl' : 'text-3xl'} font-bold tracking-[-0.02em]`}>{fmtRoas(actual)}</span>
              <span className="text-xs font-medium text-[var(--ads-ink-2)]">ROAS</span>
            </>
          )}
        </div>
        {colchon != null && (
          <span className="text-xs font-semibold" style={{ color: colorActual === 'var(--ads-verde-dot)' ? 'var(--ads-verde)' : colorActual === 'var(--ads-amarillo-dot)' ? 'var(--ads-amarillo)' : 'var(--ads-rojo)' }}>
            {fmtPct(colchon, true)} vs. equilibrio
          </span>
        )}
      </div>

      <div className="relative mt-3 h-2.5" aria-hidden>
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div style={{ width: pos(eq), backgroundColor: 'var(--ads-rojo-line)' }} />
          <div style={{ width: `calc(${pos(obj)} - ${pos(eq)})`, backgroundColor: 'var(--ads-amarillo-line)' }} />
          <div className="flex-1" style={{ backgroundColor: 'var(--ads-verde-line)' }} />
        </div>
        {/* Marcas del equilibrio y el objetivo sobre la regla. */}
        {[eq, obj].map((v, i) => (
          <span key={i} className="absolute -top-1 h-[18px] w-[2px] -translate-x-1/2 rounded-full bg-[var(--ads-ink-3)]" style={{ left: pos(v) }} />
        ))}
        {actual != null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(16,24,40,0.3)]"
            style={{ left: pos(actual), backgroundColor: colorActual }}
          />
        )}
      </div>

      {/* Las etiquetas van en una fila aparte y no colgadas de cada marca: con
          equilibrio 1.00x y objetivo 1.35x las marcas quedan a pocos píxeles y
          los textos se pisaban en el celular. */}
      <div className="mt-2 flex justify-between gap-3 text-[11px] text-[var(--ads-ink-2)]">
        <span>Equilibrio <strong className="font-semibold text-[var(--ads-ink)]">{fmtRoas(eq)}</strong></span>
        <span>Objetivo <strong className="font-semibold text-[var(--ads-ink)]">{fmtRoas(obj)}</strong></span>
      </div>
      <p className="sr-only">
        ROAS actual {fmtRoas(actual)}, equilibrio {fmtRoas(eq)}, objetivo {fmtRoas(obj)}.
      </p>
    </div>
  )
}
