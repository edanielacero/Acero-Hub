'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconPlus, IconSearch, IconUsersGroup, IconX } from '@tabler/icons-react'
import type { Transaction, TxType } from '@/lib/finanzas/types'
import { groupByDay, lastMonths, monthRange, todayISO } from '@/lib/finanzas/transactions'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { IconGasto, IconIngreso } from '../components/flow-icon'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, DropdownField, EmptyState, formatDayLabel, Panel, SectionTitle } from '../components/ui'

type TypeFilter = TxType | 'todos'

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'todos', label: 'Todos los tipos' },
  { value: 'gasto', label: 'Gastos' },
  { value: 'ingreso', label: 'Ingresos' },
  { value: 'transferencia', label: 'Transferencias' },
]

export function MovimientosScreen() {
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

  const hayFiltros = month !== months[0].value || type !== 'todos' || !!accountId || !!categoryId || soloConDeuda
  function limpiarFiltros() {
    setMonth(months[0].value)
    setType('todos')
    setAccountId('')
    setCategoryId('')
    setSoloCompartidos(false)
  }

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
          <SectionTitle
            action={
              hayFiltros && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--fz-accent)]"
                >
                  <IconX size={14} stroke={2.4} /> Limpiar
                </button>
              )
            }
          >
            Filtros
          </SectionTitle>

          <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
            <DropdownField
              label="Mes"
              placeholder="Mes"
              value={month}
              onChange={setMonth}
              options={months}
            />

            <DropdownField
              label="Tipo"
              placeholder="Todos los tipos"
              value={type}
              onChange={setType}
              options={TYPE_FILTER_OPTIONS}
            />

            <DropdownField
              label="Cuenta"
              placeholder="Todas las cuentas"
              value={accountId}
              onChange={setAccountId}
              options={accounts.map(a => ({ value: a.id, label: a.name }))}
            />

            <DropdownField
              label="Categoría"
              placeholder="Todas las categorías"
              value={categoryId}
              onChange={setCategoryId}
              options={categories.filter(c => !c.archived).map(c => ({ value: c.id, label: c.name }))}
            />
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
            <TotalBox label="Ingresado" icon={<IconIngreso size={18} stroke={2} />} value={totals.ingreso} tone="in" hidden={hidden} />
            <TotalBox
              label="Gastado"
              icon={<IconGasto size={18} stroke={2} />}
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
              icon={IconSearch}
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

function TotalBox({ label, icon, value, tone, hidden, foot }: {
  label: string; icon: ReactNode; value: number; tone: 'in' | 'out'; hidden: boolean; foot?: string
}) {
  return (
    <div
      className="min-w-0 rounded-[var(--fz-r-tile)] p-4"
      style={{ background: `var(--fz-${tone}-tint)` }}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--fz-r-chip)] bg-white/70"
        style={{ color: `var(--fz-${tone}-text)` }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="mt-3 text-[13px] font-medium text-[var(--fz-ink-2)] truncate">{label}</p>
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
