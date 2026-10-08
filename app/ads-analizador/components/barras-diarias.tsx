'use client'

import { useState } from 'react'
import { fmtFecha } from '@/lib/ads-analizador/format'

export interface Punto {
  fecha: string
  valor: number
  /** Mínimo del día para recuperar la inversión (en la misma unidad que `valor`). */
  minimo?: number
  /** Hoy: el día no terminó, así que no se juzga. */
  enCurso?: boolean
}

/** Rojo bajo el mínimo, amarillo entre el mínimo y el piso, verde desde el piso. */
function colorDia(p: Punto, factorPiso: number): string {
  if (p.minimo == null) return 'var(--ads-accent)'
  if (p.enCurso) return 'var(--ads-hairline-2)'
  if (p.valor < p.minimo) return 'var(--ads-rojo-dot)'
  if (p.valor < p.minimo * factorPiso) return 'var(--ads-amarillo-dot)'
  return 'var(--ads-verde-dot)'
}

const fmtMinimo = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })

/**
 * Columnas diarias de una sola serie. Un gráfico por medida: gasto y ventas
 * tienen escalas distintas y juntarlas pediría un segundo eje.
 *
 * Tooltip al pasar el cursor (o tocar) cada columna; el objetivo de toque es la
 * franja entera del día, no solo la columna.
 *
 * Con `minimo` en los puntos, cada día lleva un tramo de línea punteada a la
 * altura de las ventas que hacían falta para recuperar lo invertido, y la
 * columna se pinta según dónde quedó.
 */
export function BarrasDiarias({ puntos, formato, titulo, factorPiso = 1.35 }: {
  puntos: Punto[]
  formato: (n: number) => string
  titulo: string
  factorPiso?: number
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const conMinimo = puntos.some(p => p.minimo != null)
  const max = Math.max(...puntos.map(p => Math.max(p.valor, p.minimo ?? 0)), 0)

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
              className="relative flex h-full flex-1 items-end justify-center outline-none"
            >
              <span
                className="block w-full max-w-6 rounded-t-[4px] transition-opacity"
                style={{
                  height: pt.valor > 0 ? `${Math.max(2, (pt.valor / tope) * 100)}%` : '0%',
                  backgroundColor: conMinimo ? colorDia(pt, factorPiso) : activo === null || activo === i ? 'var(--ads-accent)' : '#B7C6F7',
                  opacity: conMinimo && activo !== null && activo !== i ? 0.45 : 1,
                }}
              />
              {pt.minimo != null && pt.minimo > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-px border-t-2 border-dashed border-[var(--ads-ink)] opacity-60"
                  style={{ bottom: `${(pt.minimo / tope) * 100}%` }}
                />
              )}
            </button>
          ))}
        </div>

        {p && activo != null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[var(--ads-ink)] px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: `clamp(3rem, ${((activo + 0.5) / puntos.length) * 100}%, calc(100% - 3rem))` }}
          >
            <span className="text-white/70">{fmtFecha(p.fecha)}</span> · <strong>{formato(p.valor)}</strong>
            {p.minimo != null && <span className="text-white/70"> · mín. {fmtMinimo(p.minimo)}{p.enCurso ? ' · en curso' : ''}</span>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ads-ink-3)]">
        <span>{fmtFecha(puntos[0].fecha)}</span>
        <span>{fmtFecha(puntos[puntos.length - 1].fecha)}</span>
      </div>
      {conMinimo && (
        <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-[var(--ads-ink-2)]">
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[var(--ads-ink)] opacity-60" />Mínimo para recuperar la inversión</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ads-rojo-dot)]" />Debajo</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ads-amarillo-dot)]" />Justo (sin el colchón del piso)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--ads-verde-dot)]" />Encima</span>
        </figcaption>
      )}
    </figure>
  )
}
