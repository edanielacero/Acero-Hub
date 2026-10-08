'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconClipboardCheck, IconFlag } from '@tabler/icons-react'
import { diferenciaDias, fechaCorta, sumarDias } from '@/lib/ads-analizador/calc'
import { proximaRevision, type Alerta, type CicloPlan, type Ventana } from '@/lib/ads-analizador/ciclos'
import { fmtEntero, fmtMoneda, fmtRoas } from '@/lib/ads-analizador/format'
import type { CicloResumen } from '@/lib/ads-analizador/load'
import type { Campana, Color, EstadoCampana } from '@/lib/ads-analizador/types'
import { PanelCiclo, unidad } from './panel-ciclo'
import { RoasMedidor } from './roas-badge'
import { SemaforoCiclos, VEREDICTO } from './semaforo-ciclos'
import { Boton, Segmentado, SEMAFORO, SIN_DATOS, Tarjeta } from './ui'

const RESULTADO: Record<Color, string> = { verde: 'Sobre el piso', amarillo: 'Entre empate y piso', rojo: 'Bajo el empate' }

/** Alertas calculadas con los datos de hoy: siguen vivas aunque la vista esté congelada. */
export function FranjaAlertas({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5 border-b border-[var(--ads-hairline)] bg-[var(--ads-surface-2)] px-5 py-3">
      {alertas.map(a => (
        <li key={a.tipo} className="flex items-start gap-2 text-xs" style={{ color: `var(--ads-${a.tono})` }}>
          <IconAlertTriangle size={15} className="mt-px shrink-0" />
          <span className="font-medium">{a.texto}</span>
        </li>
      ))}
    </ul>
  )
}

function Cifras({ c, gasto, costoPorVenta, profit, esperadas }: {
  c: Campana; gasto: number; costoPorVenta: number | null; profit: number; esperadas?: number
}) {
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ads-ink-2)]">
      <span>Inversión <strong className="text-[var(--ads-ink)]">{m$(gasto)}</strong></span>
      <span>Costo por {unidad(c, false)} <strong className="text-[var(--ads-ink)]">{costoPorVenta == null ? '—' : m$(costoPorVenta)}</strong></span>
      <span>Profit <strong style={{ color: profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{profit >= 0 ? '+' : ''}{m$(profit)}</strong></span>
      {esperadas != null && <span>Esperabas ~<strong className="text-[var(--ads-ink)]">{fmtEntero(Math.round(esperadas))}</strong></span>}
    </p>
  )
}

/**
 * Cierre de ciclo: la foto del ciclo tal como cerró, congelada hasta que el
 * usuario confirma. Las alertas de arriba sí son en vivo.
 */
export function VistaCierre({ c, k, total, anteriores, alertas, desdeCierre, hoy, onContinuar }: {
  c: Campana
  k: CicloPlan
  total: CicloResumen
  anteriores: CicloPlan[]
  alertas: Alerta[]
  desdeCierre: Ventana
  hoy: string
  onContinuar: () => Promise<void>
}) {
  const [enviando, setEnviando] = useState(false)
  const f = k.snapshot!
  const s = SEMAFORO[f.semaforo]
  const sinRevisar = Math.max(0, diferenciaDias(hoy, sumarDias(f.fin, 1)))

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-start gap-3 border-b px-5 py-4" style={{ backgroundColor: s.tinte, borderColor: s.linea }}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm" style={{ color: s.texto }}>
          <IconFlag size={20} />
        </span>
        <div className="min-w-0 flex-1 self-center">
          <h2 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: s.texto }}>
            Ciclo cerrado el {fechaCorta(f.fin)}. Revisa los resultados
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ads-ink)]">
            <strong>{k.estado === 'cortado' ? 'Cortado' : VEREDICTO[f.veredicto]}</strong>
            {f.nota ? ` · ${f.nota}` : ''}
          </p>
          {sinRevisar >= 1 && (
            <p className="mt-1 text-xs font-medium text-[var(--ads-amarillo)]">Cierre sin revisar hace {sinRevisar} día{sinRevisar === 1 ? '' : 's'}</p>
          )}
        </div>
      </div>

      <FranjaAlertas alertas={alertas} />

      <div className="p-5">
        <PanelCiclo
          c={c}
          v={f}
          titulo={`Ciclo ${k.numero}`}
          derecha={<>{fechaCorta(f.inicio)} – {fechaCorta(f.fin)}{f.roas != null && <> · ROAS <strong className="text-[var(--ads-ink)]">{f.roas.toFixed(2)}x</strong></>}</>}
        />
        <div className="mt-4 border-t border-[var(--ads-hairline)] pt-3">
          <Cifras c={c} gasto={f.gasto} costoPorVenta={f.costoPorVenta} profit={f.profit} esperadas={f.ventasEsperadas} />
          {desdeCierre.gasto > 0 && (
            <p className="mt-1.5 text-xs text-[var(--ads-ink-3)]">
              Desde el cierre: +{fmtEntero(desdeCierre.conversiones)} {unidad(c, desdeCierre.conversiones !== 1)}
              {desdeCierre.roas != null && <>, ROAS {desdeCierre.roas.toFixed(2)}x</>}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Boton
            className="w-full sm:w-auto"
            icono={<IconClipboardCheck size={18} />}
            cargando={enviando}
            onClick={async () => { setEnviando(true); await onContinuar(); setEnviando(false) }}
          >
            Continuar a Campaña en curso
          </Boton>
        </div>
      </div>

      <SemaforoCiclos c={c} total={total} anteriores={anteriores} />
    </Tarjeta>
  )
}

type Periodo = 'total' | 'cambio'

/**
 * Campaña en curso: no hay ciclo abierto. El semáforo grande es el de la
 * campaña; el selector solo cambia lo que se muestra (las alertas siempre
 * miran desde el último cambio).
 */
export function VistaEnCurso({ c, e, ultimo, total, desdeCambio, ultimos7, alertas, anteriores, hoy }: {
  c: Campana
  /** Estado desde el último cambio: alertas, probabilidades y su ROAS. */
  e: EstadoCampana
  ultimo: CicloPlan
  total: CicloResumen
  desdeCambio: { gasto: number; conversiones: number; profit: number; roas: number | null; color: Color | null }
  ultimos7: Ventana
  alertas: Alerta[]
  anteriores: CicloPlan[]
  hoy: string
}) {
  const [periodo, setPeriodo] = useState<Periodo>('total')
  const vista = periodo === 'total'
    ? { gasto: total.gasto, conversiones: total.conversiones, profit: total.profit, roas: total.roas, color: total.color, estado: total.estado }
    : { ...desdeCambio, estado: e }
  const s = vista.color ? SEMAFORO[vista.color] : SIN_DATOS
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const f = ultimo.snapshot
  const revision = ultimo.fin ? proximaRevision(ultimo.fin, hoy) : null
  const sube = ultimos7.roas != null && total.roas != null && ultimos7.roas >= total.roas

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-start gap-3 border-b px-5 py-4" style={{ backgroundColor: s.tinte, borderColor: s.linea }}>
        <span className="mt-1 h-4 w-4 shrink-0 rounded-full ring-4 ring-white" style={{ backgroundColor: s.punto }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: s.texto }}>Campaña en curso</h2>
            <span className="text-xs font-semibold" style={{ color: s.texto }}>{vista.color ? RESULTADO[vista.color] : 'Sin datos'}</span>
          </div>
          {f && (
            <p className="mt-1 text-sm text-[var(--ads-ink)]">
              Último ciclo: <strong>{ultimo.estado === 'cortado' ? 'Cortado' : VEREDICTO[f.veredicto]}</strong>{f.nota ? ` · ${f.nota}` : ''}
            </p>
          )}
        </div>
      </div>

      <FranjaAlertas alertas={alertas} />

      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1 sm:ml-auto sm:w-72">
          <Segmentado nombre="Período" valor={periodo} onChange={setPeriodo} opciones={[
            { valor: 'total', etiqueta: 'Total' },
            { valor: 'cambio', etiqueta: <span className="whitespace-nowrap">Desde el cambio</span> },
          ]} />
        </div>

        <RoasMedidor estado={vista.estado} />

        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-xs text-[var(--ads-ink-2)]">{unidad(c).replace(/^./, x => x.toUpperCase())}</p><p className="text-base font-semibold tabular-nums sm:text-lg">{fmtEntero(vista.conversiones)}</p></div>
          <div><p className="text-xs text-[var(--ads-ink-2)]">Inversión</p><p className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg">{m$(vista.gasto)}</p></div>
          <div>
            <p className="text-xs text-[var(--ads-ink-2)]">Profit</p>
            <p className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg" style={{ color: vista.profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{vista.profit >= 0 ? '+' : ''}{m$(vista.profit)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--ads-hairline)] pt-4 text-xs text-[var(--ads-ink-2)]">
          {ultimos7.roas != null && (
            <span className="inline-flex items-center gap-1">
              Últimos 7 días: <strong className="text-[var(--ads-ink)]">ROAS {fmtRoas(ultimos7.roas)}</strong>
              {sube
                ? <IconArrowUpRight size={14} className="text-[var(--ads-verde)]" />
                : <IconArrowDownRight size={14} className="text-[var(--ads-rojo)]" />}
              <span className="text-[var(--ads-ink-3)]">vs. {fmtRoas(total.roas)} total</span>
            </span>
          )}
          {revision && (
            <span>
              Próxima revisión: <strong className="text-[var(--ads-ink)]">{revision === hoy ? 'hoy' : fechaCorta(revision)}</strong>
            </span>
          )}
        </div>
      </div>

      <SemaforoCiclos c={c} total={total} anteriores={anteriores} conTotal={false} />
    </Tarjeta>
  )
}
