'use client'

import { useState } from 'react'
import { fmtFecha } from '@/lib/ads-analizador/format'

export interface Punto { fecha: string; valor: number }

/**
 * Columnas diarias de una sola serie. Un gráfico por medida: gasto y ventas
 * tienen escalas distintas y juntarlas pediría un segundo eje.
 *
 * Tooltip al pasar el cursor (o tocar) cada columna; el objetivo de toque es la
 * franja entera del día, no solo la columna.
 */
export function BarrasDiarias({ puntos, formato, titulo }: {
  puntos: Punto[]
  formato: (n: number) => string
  titulo: string
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const max = Math.max(...puntos.map(p => p.valor), 0)

  if (puntos.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--ads-ink-3)]">Sin datos en este rango.</p>
  }

  const tope = max > 0 ? max : 1
  const p = activo != null ? puntos[activo] : null

  return (
    <figure aria-label={titulo}>
      <div className="relative">
        {/* Grilla: tope y base, hairline, recesiva. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-[var(--ads-hairline)]" />
        <span className="pointer-events-none absolute right-0 top-0 -translate-y-full pb-0.5 text-[11px] text-[var(--ads-ink-3)] tabular-nums">{formato(max)}</span>

        <div className="flex h-36 items-end gap-[2px] border-b border-[var(--ads-hairline-2)]" onMouseLeave={() => setActivo(null)}>
          {puntos.map((pt, i) => (
            <button
              key={pt.fecha}
              type="button"
              aria-label={`${fmtFecha(pt.fecha)}: ${formato(pt.valor)}`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onClick={() => setActivo(i)}
              className="flex h-full flex-1 items-end justify-center outline-none"
            >
              <span
                className="block w-full max-w-6 rounded-t-[4px] transition-colors"
                style={{
                  height: pt.valor > 0 ? `${Math.max(2, (pt.valor / tope) * 100)}%` : '0%',
                  backgroundColor: activo === null || activo === i ? 'var(--ads-accent)' : '#B7C6F7',
                }}
              />
            </button>
          ))}
        </div>

        {p && activo != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[var(--ads-ink)] px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: `clamp(3rem, ${((activo + 0.5) / puntos.length) * 100}%, calc(100% - 3rem))` }}
          >
            <span className="text-white/70">{fmtFecha(p.fecha)}</span> · <strong>{formato(p.valor)}</strong>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ads-ink-3)]">
        <span>{fmtFecha(puntos[0].fecha)}</span>
        <span>{fmtFecha(puntos[puntos.length - 1].fecha)}</span>
      </div>
    </figure>
  )
}
