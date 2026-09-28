'use client'

import { IconAlertTriangle } from '@tabler/icons-react'
import { puntoDebil, type Escalon } from '@/lib/ads-analizador/calc'
import { fmtEntero, fmtPct } from '@/lib/ads-analizador/format'

/**
 * Embudo de un solo tono: las etapas son un orden, no identidades distintas.
 * El paso donde más gente se pierde es un ESTADO, así que va en ámbar con
 * ícono y texto — nunca solo con color.
 *
 * El punto débil se busca desde el segundo escalón: de impresiones a clic
 * siempre se pierde el 97-99% (es el CTR), y marcarlo no le diría nada nuevo a
 * nadie.
 */
export function FunnelChart({ escalones }: { escalones: Escalon[] }) {
  const max = Math.max(...escalones.map(e => e.valor), 1)
  const debil = puntoDebil(escalones.slice(1))
  const indiceDebil = debil ? debil.indice + 1 : -1

  return (
    <div>
      <ol className="flex flex-col gap-3">
        {escalones.map((e, i) => {
          const antes = i > 0 ? escalones[i - 1].valor : null
          const paso = antes && antes > 0 ? e.valor / antes : null
          const esDebil = i === indiceDebil
          // Escala raíz: con escala lineal, 3.000 impresiones aplastan a 6 compras
          // contra el borde y todo lo de abajo se ve igual de vacío.
          const ancho = e.valor > 0 ? Math.max(2, Math.sqrt(e.valor / max) * 100) : 0
          return (
            <li key={e.etiqueta} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[9rem_1fr_auto]">
              <span className="truncate text-sm text-[var(--ads-ink-2)]">{e.etiqueta}</span>
              <div className="h-6 rounded-r-[4px] bg-[var(--ads-surface-2)]" title={`${e.etiqueta}: ${fmtEntero(e.valor)}`}>
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500"
                  style={{ width: `${ancho}%`, backgroundColor: esDebil ? 'var(--ads-amarillo-dot)' : 'var(--ads-accent)' }}
                />
              </div>
              <span className="w-24 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                {fmtEntero(e.valor)}
                {paso != null && <span className="block text-[11px] font-normal text-[var(--ads-ink-3)]">{fmtPct(paso)} del anterior</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {debil && indiceDebil > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--ads-amarillo-tint)] px-3 py-2.5 text-sm text-[var(--ads-amarillo)] ring-1 ring-inset ring-[var(--ads-amarillo-line)]">
          <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            Acá se pierde más gente: de <strong>{escalones[indiceDebil - 1].etiqueta.toLowerCase()}</strong> a{' '}
            <strong>{escalones[indiceDebil].etiqueta.toLowerCase()}</strong> se cae el {fmtPct(debil.caida)}.
          </span>
        </p>
      )}
    </div>
  )
}
