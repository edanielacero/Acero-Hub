'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  IconArrowBackUp, IconChartHistogram, IconChevronLeft, IconCornerDownRight,
} from '@tabler/icons-react'
import type { BudgetHistoryPayload, BudgetLineHistory, Currency } from '@/lib/finanzas/types'
import { formatAmount, HIDDEN } from '@/lib/finanzas/money'
import { monthLabel, todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from '../components/data-context'
import { FzLink } from '../components/router'
import { CategoryIcon } from '../components/category-icon'
import { fzFetch } from '../components/fz-fetch'
import { PageHeader } from '../components/tx-row'
import { Btn, DropdownField, EmptyState, ErrorNote, Panel, SectionTitle, Skeleton } from '../components/ui'

const TODOS = '__todos__'

/**
 * El mes a mes de los presupuestos: cuánto se presupuestó, cuánto se gastó y
 * cuánto sobró o se gastó de más.
 *
 * Los datos NO viajan en `/bootstrap` —son dos años de meses que casi nunca
 * se miran— así que esta pantalla los pide ella misma al entrar. `version`
 * del contexto la vuelve a pedir cuando algo cambió en otro lado (cerrar un
 * mes, editar un monto), y así no queda mostrando números viejos.
 */
export function PresupuestoHistorialScreen() {
  const { hidden, categories, version } = useFinanzas()
  const [data, setData] = useState<BudgetHistoryPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lineFilter, setLineFilter] = useState<string>(TODOS)
  const [undoing, setUndoing] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError('')
    const res = await fzFetch(`/api/finanzas/budgets/history?today=${todayISO()}`)
    if (!res.ok) {
      setLoading(false)
      return setError('No se pudo cargar el historial')
    }
    setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar, version])

  const lines = data?.lines ?? []
  const visibles = lineFilter === TODOS ? lines : lines.filter(l => l.line_id === lineFilter)
  const iconFor = (line: BudgetLineHistory) =>
    categories.find(c => c.id === line.category_ids[0])?.icon ?? null

  /**
   * Deshace (o rehace) la decisión de cierre de un mes. No recalcula nada: el
   * sobrante congelado sigue siendo el mismo, lo único que cambia es si el mes
   * siguiente lo suma o no — o sea, vuelve a su presupuesto original.
   */
  async function cambiarCierre(lineId: string, period: string, carried: boolean) {
    setUndoing(`${lineId}:${period}`)
    const res = await fzFetch(`/api/finanzas/budgets/${lineId}/close`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, carried }),
    })
    setUndoing(null)
    if (!res.ok) return setError('No se pudo cambiar esa decisión')
    await cargar()
  }

  // Los meses ya terminados van primero y el mes en curso arriba de todo, con
  // su etiqueta: sus números todavía se mueven y no son un resultado.
  const meses = data?.months ?? []

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      {/* Igual que las hojas de Ajustes: el enlace de vuelta va arriba del
          título, porque en móvil no hay barra superior donde colgarlo. */}
      <FzLink
        href="/finanzas/presupuesto"
        className="inline-flex items-center gap-0.5 -ml-1 mb-2 text-[13px] font-semibold text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]"
      >
        <IconChevronLeft size={16} stroke={2.2} />
        Presupuesto
      </FzLink>
      <PageHeader title="Historial" subtitle="Meses cerrados, uno por uno" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        {loading ? (
          <Panel className="flex flex-col gap-3">
            <Skeleton w="40%" h={16} />
            <Skeleton w="100%" h={48} />
            <Skeleton w="100%" h={48} />
          </Panel>
        ) : lines.length === 0 ? (
          <Panel>
            <EmptyState
              icon={IconChartHistogram}
              title="Todavía no hay historial"
              description="Acá aparecen los meses que ya terminaron: cuánto presupuestaste, cuánto gastaste y cuánto sobró o te pasaste. El mes en curso lo ves en Presupuesto."
            />
          </Panel>
        ) : (
          <>
            {lines.length > 1 && (
              <DropdownField
                label="Filtrar por presupuesto"
                value={lineFilter}
                placeholder="Todos"
                onChange={setLineFilter}
                options={[
                  { value: TODOS, label: 'Todos los presupuestos' },
                  ...lines.map(l => ({
                    value: l.line_id,
                    label: l.name ?? l.category_names.join(', '),
                  })),
                ]}
              />
            )}

            {meses.map(mes => {
              const filas = visibles
                .map(line => ({ line, entry: line.entries.find(e => e.period === mes.period) }))
                .filter((f): f is { line: BudgetLineHistory; entry: NonNullable<typeof f.entry> } => !!f.entry)
              if (filas.length === 0) return null

              return (
                <div key={mes.period}>
                  <SectionTitle
                    action={hidden ? null : <Resultado value={mes.result_usd} currency="USD" />}
                  >
                    {monthLabel(mes.period.slice(0, 7))}
                  </SectionTitle>

                  <Panel pad={false} className="mt-2">
                    <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
                      {filas.map(({ line, entry }) => {
                        const cur = line.input_currency
                        const fmt = (n: number) => formatAmount(n, cur)
                        const key = `${line.line_id}:${entry.period}`
                        return (
                          <div key={line.line_id} className="px-4 py-3.5 flex flex-col gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CategoryIcon
                                slug={iconFor(line)}
                                name={line.name ?? line.category_names.join(', ')}
                                size={28}
                              />
                              <p className="text-[14.5px] font-semibold truncate min-w-0 flex-1">
                                {line.name ?? line.category_names.join(', ')}
                                {line.archived && (
                                  <span className="ml-1.5 text-[12px] font-medium text-[var(--fz-ink-3)]">archivado</span>
                                )}
                              </p>
                              {!hidden && <Resultado value={entry.result} currency={cur} />}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--fz-ink-3)] fz-num">
                              <span>Presupuestado {hidden ? HIDDEN : fmt(entry.budgeted)}</span>
                              <span>Gastado {hidden ? HIDDEN : fmt(entry.spent)}</span>
                              {entry.carried_in !== 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <IconCornerDownRight size={13} stroke={2} />
                                  {entry.carried_in > 0 ? 'Vino del mes anterior' : 'Restado del mes anterior'}{' '}
                                  {hidden ? HIDDEN : fmt(Math.abs(entry.carried_in))}
                                </span>
                              )}
                            </div>

                            <Cierre
                              entry={entry}
                              busy={undoing === key}
                              onChange={carried => cambiarCierre(line.line_id, entry.period, carried)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </Panel>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Qué pasó con el sobrante de ese mes, y el botón para cambiar de idea.
 *
 * Un mes sin cerrar no ofrece deshacer nada: la pregunta sigue viva en la
 * pantalla de Presupuesto, que es donde se responde por primera vez.
 */
function Cierre({ entry, busy, onChange }: {
  entry: { closed: boolean; carried_out: boolean | null; result: number }
  busy: boolean
  onChange: (carried: boolean) => void
}) {
  if (!entry.closed) {
    return (
      <p className="text-[12.5px] text-[var(--fz-out-text)] font-medium">
        Sin cerrar — decide si pasa al próximo mes
      </p>
    )
  }

  const paso = entry.carried_out === true
  const sobro = entry.result >= 0

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12.5px] text-[var(--fz-ink-2)]">
        {paso
          ? (sobro ? 'Pasó al mes siguiente' : 'Se restó del mes siguiente')
          : 'No pasó al mes siguiente'}
      </p>
      <Btn size="sm" variant="ghost" onClick={() => onChange(!paso)} disabled={busy}>
        {paso ? <><IconArrowBackUp size={15} stroke={2} /> Deshacer</> : (sobro ? 'Pasarlo' : 'Restarlo')}
      </Btn>
    </div>
  )
}

/**
 * Lo que sobró (verde, +) o lo que se gastó de más (rojo, −).
 *
 * El signo va siempre, no solo el color (§9 del documento de UI) — y con el
 * menos U+2212 de `formatSigned`, no un guion. Se formatea sobre el valor
 * absoluto porque el signo ya lo pone esta función.
 */
function Resultado({ value, currency }: { value: number; currency: Currency }) {
  const sobro = value >= 0
  const monto = formatAmount(Math.abs(value), currency)
  return (
    <span
      className={`shrink-0 text-[13px] font-bold fz-num ${sobro ? 'text-[var(--fz-in-text)]' : 'text-[var(--fz-out-text)]'}`}
      aria-label={`${sobro ? 'Sobró' : 'Se gastó de más'} ${monto}`}
    >
      {sobro ? '+' : '−'}{monto}
    </span>
  )
}
