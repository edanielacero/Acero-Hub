'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import type { Transaction, TxType } from '@/lib/finanzas/types'
import { groupByDay, monthLabel, monthRange, todayISO } from '@/lib/finanzas/transactions'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { useFzQuery, useFzRouter } from '../components/router'
import { IconGasto, IconIngreso } from '../components/flow-icon'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, DropdownField, EmptyState, formatDayLabel, Panel, SectionTitle } from '../components/ui'

// `fijo` y `fijo_compartido` no son tipos de movimiento — son gasto + un
// recorte encima (§ TxRow "Gasto Fijo"). Viven en el mismo dropdown que
// Tipo porque hoy lo compartido SOLO existe dentro de un fijo (no hay
// gastos sueltos con reparto), así que separarlo en un control aparte era
// una dimensión extra para una distinción que en la práctica es un
// subconjunto de "gasto" (feedback del usuario).
type TypeFilter = TxType | 'todos' | 'fijo' | 'fijo_compartido'

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'todos', label: 'Todos los tipos' },
  { value: 'gasto', label: 'Todos los gastos' },
  { value: 'ingreso', label: 'Ingresos' },
  { value: 'transferencia', label: 'Transferencias' },
  { value: 'fijo', label: 'Todos los Gastos Fijos' },
  { value: 'fijo_compartido', label: 'Solo Gastos Fijos Compartidos' },
]

export function MovimientosScreen() {
  const { accounts, categories, hidden, months: monthsWithData } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()
  // Filtros que pueden venir en la URL — es como Presupuesto manda a "ver los
  // movimientos de esta categoría". Se leen una sola vez, como valor inicial:
  // a partir de ahí los dropdowns mandan, sin que la URL los vuelva a pisar.
  const query = useFzQuery()
  const { navigate } = useFzRouter()

  // Solo meses con al menos un movimiento — no tiene sentido ofrecer uno vacío
  // para elegir. `monthsWithData` llega del bootstrap, así que arranca vacío
  // hasta que el snapshot o la red lo llenan.
  const months = useMemo(
    () => monthsWithData.map(value => ({ value, label: monthLabel(value) })),
    [monthsWithData],
  )
  const defaultMonth = months[0]?.value ?? ''

  // `null` = "seguí el mes más reciente con datos". Derivado y no sincronizado
  // con un efecto: así el primer pintado ya muestra el mes correcto en vez de
  // arrancar vacío y corregirse un frame después.
  const [monthOverride, setMonthOverride] = useState<string | null>(() => query.get('month'))
  const month = monthOverride ?? defaultMonth

  const [type, setType] = useState<TypeFilter>(
    () => (TYPE_FILTER_OPTIONS.some(o => o.value === query.get('type')) ? query.get('type') as TypeFilter : 'todos'),
  )
  const [accountId, setAccountId] = useState(() => query.get('account') ?? '')
  const [categoryId, setCategoryId] = useState(() => query.get('category') ?? '')

  const range = useMemo(() => {
    if (!month) return monthRange()
    const [y, m] = month.split('-').map(Number)
    return monthRange(new Date(y, m - 1, 1))
  }, [month])

  const hayFiltros = monthOverride !== null || type !== 'todos' || !!accountId || !!categoryId
  function limpiarFiltros() {
    setMonthOverride(null)
    setType('todos')
    setAccountId('')
    setCategoryId('')
    // Y también de la URL: si vino filtrado desde Presupuesto, dejarla con el
    // query puesto haría volver los filtros al recargar.
    navigate('/finanzas/movimientos')
  }

  const esFijo = type === 'fijo' || type === 'fijo_compartido'

  // `monthQuery` y no un objeto propio: sin filtros, esta consulta tiene que dar
  // exactamente la misma clave que la de la Home para reusar lo que ya se trajo.
  const { data, loading } = useTransactions({
    ...monthQuery(range),
    type: type === 'todos' ? undefined : esFijo ? 'gasto' : type,
    account_id: accountId || undefined,
    category_id: categoryId || undefined,
    recurring: esFijo ? '1' : undefined,
    shared: type === 'fijo_compartido' ? '1' : undefined,
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
            <Btn onClick={() => openQuickAdd()} size="sm">
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
              onChange={setMonthOverride}
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
