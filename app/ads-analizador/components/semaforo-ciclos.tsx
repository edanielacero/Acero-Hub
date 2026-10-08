'use client'

import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { diferenciaDias, fechaCorta, sumarDias } from '@/lib/ads-analizador/calc'
import { fmtEntero, fmtMoneda, fmtRoas } from '@/lib/ads-analizador/format'
import type { CicloPlan } from '@/lib/ads-analizador/ciclos'
import type { CicloResumen } from '@/lib/ads-analizador/load'
import type { Campana, Color, TipoCambio, Veredicto } from '@/lib/ads-analizador/types'
import { PanelCiclo, unidad } from './panel-ciclo'
import { SEMAFORO } from './ui'

const RESULTADO: Record<Color, string> = {
  verde: 'Sobre el piso',
  amarillo: 'Entre empate y piso',
  rojo: 'Bajo el empate',
}

const CAMBIO: Record<TipoCambio, string> = { presupuesto: 'Presupuesto', creativo: 'Creativo', audiencia: 'Audiencia', otro: 'Cambio' }

/** La regla del medidor en chiquito: tres zonas y un punto. */
function MiniMedidor({ r }: { r: CicloResumen }) {
  const { roasEquilibrio: eq, roasObjetivo: obj } = r.estado
  const tope = Math.max(obj * 1.5, (r.roas ?? 0) * 1.12, eq * 2)
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / tope) * 100))}%`
  return (
    <div className="relative h-1.5 w-full" aria-hidden>
      <div className="absolute inset-0 flex overflow-hidden rounded-full">
        <div style={{ width: pos(eq), backgroundColor: 'var(--ads-rojo-line)' }} />
        <div style={{ width: `calc(${pos(obj)} - ${pos(eq)})`, backgroundColor: 'var(--ads-amarillo-line)' }} />
        <div className="flex-1" style={{ backgroundColor: 'var(--ads-verde-line)' }} />
      </div>
      {r.roas != null && r.color && (
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(16,24,40,0.3)]"
          style={{ left: pos(r.roas), backgroundColor: SEMAFORO[r.color].punto }}
        />
      )}
    </div>
  )
}

function Fila({ c, r, total = false }: { c: Campana; r: CicloResumen; total?: boolean }) {
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const s = r.color ? SEMAFORO[r.color] : null
  const enCurso = !total && r.fin == null
  const nombre = total ? 'Toda la campaña' : `Ciclo ${r.numero}`
  const desde = r.estado.ciclo.inicio ?? r.inicio
  const rango = !desde
    ? 'sin gasto todavía'
    : `${fechaCorta(desde)} – ${r.fin ? fechaCorta(sumarDias(r.fin, -1)) : 'hoy'} · ${r.dias} día${r.dias === 1 ? '' : 's'}`
  const cambio = r.cambio
    ? `${CAMBIO[r.cambio.tipo]}${r.cambio.presupuesto != null ? ` → ${m$(r.cambio.presupuesto)}/día` : r.cambio.detalle ? `: ${r.cambio.detalle}` : ''}`
    : null

  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(9.5rem,auto)_7.5rem] ${total ? 'pb-4' : ''}`}>
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s?.punto ?? 'var(--ads-ink-3)' }} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          {nombre}
          {enCurso && <span className="rounded-md bg-[var(--ads-accent-tint)] px-1.5 py-px text-[11px] font-medium text-[var(--ads-accent-press)]">en curso</span>}
        </p>
        <p className="truncate text-xs text-[var(--ads-ink-3)]" title={cambio ?? undefined}>{rango}{cambio ? ` · ${cambio}` : ''}</p>
      </div>
      <div className="text-right sm:order-last">
        <p className="text-sm font-bold tabular-nums">{r.roas == null ? '—' : fmtRoas(r.roas)}</p>
        <p className="whitespace-nowrap text-[11px] font-medium" style={{ color: s?.texto ?? 'var(--ads-ink-3)' }}>{r.color ? RESULTADO[r.color] : 'Sin datos'}</p>
      </div>
      <div className="col-span-3 col-start-2 sm:col-span-1 sm:col-start-auto">
        <MiniMedidor r={r} />
      </div>
      <p className="col-span-3 col-start-2 whitespace-nowrap text-xs text-[var(--ads-ink-2)] sm:col-span-1 sm:col-start-auto sm:text-right">
        {fmtEntero(r.conversiones)} {unidad(c, r.conversiones !== 1)} · <span style={{ color: r.profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{r.profit >= 0 ? '+' : ''}{m$(r.profit)}</span>
      </p>
    </li>
  )
}

export const VEREDICTO: Record<Veredicto, string> = {
  escalar: 'Escalar',
  mantener: 'Mantener',
  cambiar: 'Probar anuncios nuevos',
  pausar: 'Pausar',
  cortado: 'Cortado',
}

/** Un ciclo con foto guardada: plegado muestra semáforo, fechas y veredicto; abierto, sus barras. */
function FilaGuardada({ c, k }: { c: Campana; k: CicloPlan }) {
  const [abierto, setAbierto] = useState(false)
  const f = k.snapshot!
  const s = SEMAFORO[f.semaforo]
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const dias = diferenciaDias(f.fin, f.inicio) + 1
  const cambio = k.cambio
    ? `${CAMBIO[k.cambio.tipo]}${k.cambio.presupuesto != null ? ` → ${m$(k.cambio.presupuesto)}/día` : k.cambio.detalle ? `: ${k.cambio.detalle}` : ''}`
    : null
  const tag = 'rounded-md px-1.5 py-px text-[11px] font-medium'

  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-3 text-left"
      >
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.punto }} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            Ciclo {k.numero}
            {k.estado === 'interrumpido' && <span className={`${tag} bg-[var(--ads-surface-2)] text-[var(--ads-ink-2)]`}>interrumpido</span>}
            {k.estado !== 'interrumpido' && !k.revisadoEn && <span className={`${tag} bg-[var(--ads-amarillo-tint)] text-[var(--ads-amarillo)]`}>sin revisar</span>}
          </span>
          <span className="block truncate text-xs text-[var(--ads-ink-3)]" title={cambio ?? undefined}>
            {fechaCorta(f.inicio)} – {fechaCorta(f.fin)} · {dias} día{dias === 1 ? '' : 's'}{cambio ? ` · ${cambio}` : ''}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-bold tabular-nums">{f.roas == null ? '—' : fmtRoas(f.roas)}</span>
          <span className="block whitespace-nowrap text-[11px] font-medium" style={{ color: s.texto }}>
            {k.estado === 'interrumpido' ? 'Interrumpido' : VEREDICTO[f.veredicto]}
          </span>
        </span>
        <IconChevronDown size={16} className={`text-[var(--ads-ink-3)] transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="mb-4 rounded-xl bg-[var(--ads-surface-2)] p-4 ring-1 ring-inset ring-[var(--ads-hairline)]">
          <PanelCiclo c={c} v={f} compacto />
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--ads-hairline)] pt-3 text-xs text-[var(--ads-ink-2)]">
            <span>Inversión <strong className="text-[var(--ads-ink)]">{m$(f.gasto)}</strong></span>
            <span>Costo por {unidad(c, false)} <strong className="text-[var(--ads-ink)]">{f.costoPorVenta == null ? '—' : m$(f.costoPorVenta)}</strong></span>
            <span>Profit <strong style={{ color: f.profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{f.profit >= 0 ? '+' : ''}{m$(f.profit)}</strong></span>
            <span>Esperabas ~<strong className="text-[var(--ads-ink)]">{fmtEntero(Math.round(f.ventasEsperadas))}</strong></span>
          </p>
          {f.nota && <p className="mt-1.5 text-xs text-[var(--ads-ink-3)]">{f.nota}</p>}
        </div>
      )}
    </li>
  )
}

/**
 * Debajo del semáforo: el resultado de toda la campaña (si no es ya el
 * semáforo grande) y, plegados, los ciclos anteriores. Los que tienen foto
 * guardada se abren con sus barras; los de antes de guardar ciclos, solo con
 * su semáforo.
 */
export function SemaforoCiclos({ c, total, anteriores, conTotal = true }: {
  c: Campana; total: CicloResumen; anteriores: CicloPlan[]; conTotal?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  if (total.estado.ciclo.inicio == null) return null
  const lista = [...anteriores].reverse()
  const color = (k: CicloPlan) => k.snapshot ? SEMAFORO[k.snapshot.semaforo].punto : k.resumen.color ? SEMAFORO[k.resumen.color].punto : 'var(--ads-ink-3)'

  return (
    <div className="border-t border-[var(--ads-hairline)] px-5">
      {conTotal && <ul><Fila c={c} r={total} total /></ul>}
      {lista.length > 0 && (
        <div className={conTotal ? 'border-t border-[var(--ads-hairline)]' : ''}>
          <button
            type="button"
            onClick={() => setAbierto(a => !a)}
            aria-expanded={abierto}
            className="flex w-full items-center justify-between gap-3 py-3 text-sm font-medium text-[var(--ads-ink-2)] transition hover:text-[var(--ads-ink)]"
          >
            <span className="flex items-center gap-2">
              Ciclos anteriores
              <span className="flex gap-1" aria-hidden>
                {lista.map(k => <span key={k.numero} className="h-2 w-2 rounded-full" style={{ backgroundColor: color(k) }} />)}
              </span>
              <span className="text-xs text-[var(--ads-ink-3)]">{lista.length}</span>
            </span>
            <IconChevronDown size={18} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
          {abierto && (
            <ul className="divide-y divide-[var(--ads-hairline)] border-t border-[var(--ads-hairline)]">
              {lista.map(k => k.snapshot
                ? <FilaGuardada key={k.numero} c={c} k={k} />
                : <Fila key={k.numero} c={c} r={k.resumen} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
