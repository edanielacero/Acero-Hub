'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconPlus, IconUsersGroup } from '@tabler/icons-react'
import type { Transaction, TxType } from '@/lib/finanzas/types'
import { groupByDay, lastMonths, monthRange, todayISO } from '@/lib/finanzas/transactions'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, Panel, SelectField } from '../components/ui'

type TypeFilter = TxType | 'todos'

export default function MovimientosPage() {
  const { accounts, categories, hidden } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()

  const months = useMemo(() => lastMonths(), [])
  const [month, setMonth] = useState(months[0].value)
  const [type, setType] = useState<TypeFilter>('todos')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [soloConDeuda, setSoloCompartidos] = useState(false)

  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return monthRange(new Date(y, m - 1, 1))
  }, [month])

  // `monthQuery` y no un objeto propio: sin filtros, esta consulta tiene que dar
  // exactamente la misma clave que la de la Home para reusar lo que ya se trajo.
  const { data, loading } = useTransactions({
    ...monthQuery(range),
    type: type === 'todos' ? undefined : type,
    account_id: accountId || undefined,
    category_id: categoryId || undefined,
    shared: soloConDeuda ? '1' : undefined,
  })

  const txs = data.transactions
  const totals = { gasto: data.total_gasto_usd, ingreso: data.total_ingreso_usd }
  const hayReparto = data.total_repartido_usd > 0

  const days = useMemo(() => groupByDay(txs), [txs])
  const today = todayISO()

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Movimientos"
        subtitle="Todo lo que entró y salió"
        action={
          <>
            <HideToggle />
            <Btn onClick={openQuickAdd} size="sm" className="hidden min-[900px]:inline-flex">
              <IconPlus size={18} stroke={2} /> Nuevo
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Panel>
          <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
            <SelectField value={month} onChange={e => setMonth(e.target.value)} aria-label="Mes">
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </SelectField>

            <SelectField value={type} onChange={e => setType(e.target.value as TypeFilter)} aria-label="Tipo">
              <option value="todos">Todos los tipos</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
              <option value="transferencia">Transferencias</option>
            </SelectField>

            <SelectField value={accountId} onChange={e => setAccountId(e.target.value)} aria-label="Cuenta">
              <option value="">Todas las cuentas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectField>

            <SelectField value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {categories.filter(c => !c.archived).map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </SelectField>
          </div>

          <button
            type="button"
            onClick={() => setSoloCompartidos(v => !v)}
            aria-pressed={soloConDeuda}
            className={`mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--fz-r-pill)] text-[13px] font-semibold transition-colors ${
              soloConDeuda
                ? 'bg-[var(--fz-accent)] text-white'
                : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
            }`}
          >
            <IconUsersGroup size={15} stroke={2} />
            Con deuda
          </button>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <TotalBox label="Ingresado" value={totals.ingreso} tone="in" hidden={hidden} />
            <TotalBox
              label="Gastado"
              value={totals.gasto}
              tone="out"
              hidden={hidden}
              foot={
                hayReparto
                  ? data.total_gasto_real_usd < 0
                    ? `a favor ${formatUSD(Math.abs(data.total_gasto_real_usd))}`
                    : `real ${formatUSD(data.total_gasto_real_usd)}`
                  : undefined
              }
            />
          </div>
        </Panel>

        <Panel>
          {loading ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p>
          ) : days.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="Nada en este período"
              description="Probá con otro mes o quitá algún filtro."
            />
          ) : (
            <div className="flex flex-col gap-5">
              {days.map(day => {
                const neto = day.items.reduce(
                  (s, t) => s + (t.type === 'ingreso' ? t.amount_usd : t.type === 'gasto' ? -t.amount_usd : 0),
                  0,
                )
                return (
                  <section key={day.date}>
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="text-[13px] font-semibold text-[var(--fz-ink-2)]">
                        {formatDayLabel(day.date, today)}
                      </h3>
                      <span className="text-[13px] font-medium text-[var(--fz-ink-3)] fz-num">
                        {hidden ? HIDDEN : `${neto >= 0 ? '+' : '−'}${formatUSD(Math.abs(neto)).replace('−', '')}`}
                      </span>
                    </div>
                    <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
                      {day.items.map(tx => (
                        <TxRow key={tx.id} tx={tx} accounts={accounts} categories={categories} onClick={() => openEdit(tx)} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function TotalBox({ label, value, tone, hidden, foot }: {
  label: string; value: number; tone: 'in' | 'out'; hidden: boolean; foot?: string
}) {
  return (
    <div
      className="min-w-0 rounded-[var(--fz-r-tile)] p-4"
      style={{ background: `var(--fz-${tone}-tint)` }}
    >
      <p className="text-[13px] font-medium text-[var(--fz-ink-2)] truncate">{label}</p>
      <p
        className="text-[19px] min-[400px]:text-[22px] font-bold tracking-[-0.01em] fz-num truncate"
        style={{ color: `var(--fz-${tone}-text)` }}
      >
        {hidden ? HIDDEN : formatUSD(value)}
      </p>
      {foot && (
        <p className="text-[12px] font-medium text-[var(--fz-ink-2)] fz-num truncate">
          {hidden ? HIDDEN : foot}
        </p>
      )}
    </div>
  )
}
