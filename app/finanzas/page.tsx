'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { IconArrowDownLeft, IconArrowUpRight, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { monthRange } from '@/lib/finanzas/transactions'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { AmountUSD, HideToggle } from './components/amount'
import { useFinanzas, useTransactions } from './components/data-context'
import { useQuickAdd, useQuickEdit } from './components/quick-add-context'
import { PageHeader, TxRow } from './components/tx-row'
import { Btn, EmptyState, monthName, Panel, SectionTitle } from './components/ui'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function HomePage() {
  const { accounts, categories, totalUsd, loading, hidden } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()

  const now = useMemo(() => new Date(), [])
  const range = useMemo(() => monthRange(now), [now])

  const mes = useTransactions({ from: range.from, to: range.to })
  const ultimos = useTransactions({ limit: '5' })

  const gastoMes = mes.data.total_gasto_usd
  const ingresoMes = mes.data.total_ingreso_usd
  const recent = ultimos.data.transactions

  const visible = accounts.filter(a => !a.archived)

  if (!loading && visible.length === 0) {
    return (
      <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
        <PageHeader title="Finanzas" subtitle={greeting()} />
        <Panel>
          <EmptyState
            emoji="🏦"
            title="Empezá por tus cuentas"
            description="Cargá dónde tenés tu plata hoy — efectivo, banco, broker, cripto. Sin cuentas, un movimiento no tiene de dónde salir."
            action={<Btn onClick={() => { window.location.href = '/finanzas/cuentas' }}>Crear mi primera cuenta</Btn>}
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Daniel"
        subtitle={greeting()}
        action={
          <>
            <HideToggle />
            <Btn onClick={openQuickAdd} size="sm" className="hidden min-[900px]:inline-flex">
              <IconPlus size={18} stroke={2} /> Nuevo movimiento
            </Btn>
          </>
        }
      />

      <div className="grid gap-5 min-[1280px]:grid-cols-[1fr_320px] items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* Hero: el único bloque oscuro de la pantalla. */}
          <div className="rounded-[var(--fz-r-card)] bg-[var(--fz-hero)] p-6 text-white">
            <p className="text-[13px] font-medium text-white/60">Patrimonio total</p>
            <p className="mt-1 text-[40px] font-bold tracking-[-0.02em] leading-none fz-num">
              {hidden ? HIDDEN : formatUSD(totalUsd)}
            </p>
            <p className="mt-2 text-[13px] text-white/50">
              {visible.length} {visible.length === 1 ? 'cuenta' : 'cuentas'} · convertido a la tasa de hoy
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              tint="mint"
              icon={<IconArrowDownLeft size={18} stroke={2} />}
              label={`Ingresos de ${monthName(now.getMonth())}`}
              value={ingresoMes}
            />
            <StatTile
              tint="peach"
              icon={<IconArrowUpRight size={18} stroke={2} />}
              label={`Gastos de ${monthName(now.getMonth())}`}
              value={gastoMes}
            />
          </div>

          <Panel>
            <SectionTitle
              action={
                <Link href="/finanzas/movimientos" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                  Ver todos <IconChevronRight size={14} stroke={2} />
                </Link>
              }
            >
              Movimientos
            </SectionTitle>

            {recent.length === 0 ? (
              <EmptyState
                emoji="📝"
                title="Todavía no registraste nada"
                description="Tocá el + y anotá tu primer gasto."
              />
            ) : (
              <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
                {recent.map(tx => (
                  <TxRow key={tx.id} tx={tx} accounts={accounts} categories={categories} onClick={() => openEdit(tx)} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Rail derecho en dashboard completo; en móvil y tablet baja al flujo. */}
        <Panel className="min-[1280px]:sticky min-[1280px]:top-5">
          <SectionTitle
            action={
              <Link href="/finanzas/cuentas" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                Ver todas <IconChevronRight size={14} stroke={2} />
              </Link>
            }
          >
            Cuentas
          </SectionTitle>

          <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
            {visible.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold truncate">{a.name}</p>
                  <p className="text-[12px] text-[var(--fz-ink-3)]">{a.currency}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-semibold fz-num">
                    {hidden ? HIDDEN : (a.currency === 'USD' ? formatUSD(a.balance) : `Bs ${a.balance.toFixed(2)}`)}
                  </p>
                  {a.currency !== 'USD' && (
                    <p className="text-[12px] text-[var(--fz-ink-3)]">
                      ≈ <AmountUSD value={a.balance_usd} />
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function StatTile({ tint, icon, label, value }: {
  tint: 'mint' | 'peach'; icon: React.ReactNode; label: string; value: number
}) {
  return (
    <div
      className="rounded-[var(--fz-r-tile)] p-4"
      style={{ background: `var(--fz-tint-${tint})` }}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--fz-r-chip)] bg-white/70"
        style={{ color: `var(--fz-tint-${tint}-fg)` }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="mt-3 text-[13px] font-medium text-[var(--fz-ink-2)] capitalize">{label}</p>
      <p className="text-[26px] font-bold tracking-[-0.01em] fz-num">
        <AmountUSD value={value} />
      </p>
    </div>
  )
}
