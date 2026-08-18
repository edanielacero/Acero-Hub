'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import type { Transaction, TxType } from '@/lib/finanzas/types'
import { groupByDay, monthRange, todayISO } from '@/lib/finanzas/transactions'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { fetchTransactions, useFinanzas } from '../components/data-context'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, Panel, SelectField } from '../components/ui'

type TypeFilter = TxType | 'todos'

/** Los últimos 12 meses como opciones de filtro, del más reciente al más viejo. */
function lastMonths(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({
      value,
      label: d.toLocaleDateString('es', { month: 'long', year: 'numeric' }),
    })
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

export default function MovimientosPage() {
  const { accounts, categories, hidden, version } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()

  const months = useMemo(() => lastMonths(), [])
  const [month, setMonth] = useState(months[0].value)
  const [type, setType] = useState<TypeFilter>('todos')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const [txs, setTxs] = useState<Transaction[]>([])
  const [totals, setTotals] = useState({ gasto: 0, ingreso: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const [y, m] = month.split('-').map(Number)
    const range = monthRange(new Date(y, m - 1, 1))
    void (async () => {
      const data = await fetchTransactions({
        from: range.from,
        to: range.to,
        type: type === 'todos' ? undefined : type,
        account_id: accountId || undefined,
        category_id: categoryId || undefined,
        limit: '500',
      })
      if (cancelled) return
      setTxs(data.transactions)
      setTotals({ gasto: data.total_gasto_usd, ingreso: data.total_ingreso_usd })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month, type, accountId, categoryId, version])

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

          <div className="grid grid-cols-2 gap-3 mt-4">
            <TotalBox label="Ingresado" value={totals.ingreso} tone="in" hidden={hidden} />
            <TotalBox label="Gastado" value={totals.gasto} tone="out" hidden={hidden} />
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
                      <h3 className="text-[13px] font-semibold text-[var(--fz-ink-2)] capitalize">
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

function TotalBox({ label, value, tone, hidden }: {
  label: string; value: number; tone: 'in' | 'out'; hidden: boolean
}) {
  return (
    <div
      className="rounded-[var(--fz-r-tile)] p-4"
      style={{ background: `var(--fz-${tone}-tint)` }}
    >
      <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">{label}</p>
      <p
        className="text-[22px] font-bold tracking-[-0.01em] fz-num"
        style={{ color: `var(--fz-${tone}-text)` }}
      >
        {hidden ? HIDDEN : formatUSD(value)}
      </p>
    </div>
  )
}
