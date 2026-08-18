'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { IconArrowDownLeft, IconArrowUpRight, IconChevronRight, IconPlus, IconRepeat, IconUsersGroup } from '@tabler/icons-react'
import { monthRange } from '@/lib/finanzas/transactions'
import { formatAmount, formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { AmountUSD, HideToggle } from './components/amount'
import { monthQuery, useFinanzas, useTransactions } from './components/data-context'
import { useQuickAdd, useQuickEdit } from './components/quick-add-context'
import { CurrencyIcon } from './components/currency-icon'
import { PageHeader, TxRow } from './components/tx-row'
import { Btn, EmptyState, monthName, Panel, SectionTitle, Skeleton } from './components/ui'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function HomePage() {
  const { accounts, categories, shared, recurring, totalUsd, loading, stale, error, reload, hidden } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()

  const now = useMemo(() => new Date(), [])
  const range = useMemo(() => monthRange(now), [now])

  const mes = useTransactions(monthQuery(range))
  const ultimos = useTransactions({ limit: '5' })

  const gastoMes = mes.data.total_gasto_usd
  const gastoRealMes = mes.data.total_gasto_real_usd
  const ingresoMes = mes.data.total_ingreso_usd
  const recent = ultimos.data.transactions

  // Los bloques de compartidos son condicionales: si no compartís nada, la Home
  // se ve exactamente igual que antes del Sprint 2. La feature no le cobra
  // espacio a quien no la usa.
  const teDeben = shared.por_cobrar_usd > 0
  const hayReparto = gastoRealMes !== gastoMes
  const hayFijos = recurring.total > 0

  const visible = accounts.filter(a => !a.archived)

  // Sin datos y sin poder pedirlos. Decirlo es lo único honesto: un esqueleto
  // eterno se lee como "ya casi", y un $0 se lee como un saldo.
  if (loading && error) {
    return (
      <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
        <PageHeader title="Finanzas" subtitle={greeting()} />
        <Panel>
          <EmptyState
            emoji="📡"
            title="No pudimos cargar tus datos"
            description="Revisá la conexión y volvé a intentar."
            action={<Btn onClick={() => void reload()}>Reintentar</Btn>}
          />
        </Panel>
      </div>
    )
  }

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
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0" aria-busy={loading}>
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
            {loading ? (
              <Skeleton w="min(220px, 70%)" h={38} onDark className="mt-2" />
            ) : (
              <p className="mt-1 text-[34px] min-[400px]:text-[40px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
                {hidden ? HIDDEN : formatUSD(totalUsd)}
              </p>
            )}
            <p className="mt-2 text-[13px] text-white/50">
              {loading ? 'Cargando tus cuentas…' : (
                <>
                  {visible.length} {visible.length === 1 ? 'cuenta' : 'cuentas'} ·{' '}
                  {/* El número que se ve salió del dispositivo y puede tener horas:
                      decirlo. Reemplaza a la coletilla en vez de sumarse, para no
                      pasar a dos líneas y mover el hero cuando llega el dato. */}
                  {stale ? 'actualizando…' : 'convertido a la tasa de hoy'}
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              tint="mint"
              icon={<IconArrowDownLeft size={18} stroke={2} />}
              label={`Ingresos de ${monthName(now.getMonth())}`}
              value={ingresoMes}
              loading={mes.loading}
            />
            <StatTile
              tint="peach"
              icon={<IconArrowUpRight size={18} stroke={2} />}
              label={`Gastos de ${monthName(now.getMonth())}`}
              value={gastoMes}
              loading={mes.loading}
              // Lo que salió del bolsillo es el bruto; abajo, lo que realmente
              // te costó una vez descontado lo que le toca a otros. Si cobraste
              // por encima del costo, el neto da negativo: eso no es un gasto
              // "real de −$1.51", es plata a favor, y así se dice.
              foot={
                hayReparto
                  ? gastoRealMes < 0
                    ? <>a favor <AmountUSD value={Math.abs(gastoRealMes)} /></>
                    : <>real <AmountUSD value={gastoRealMes} /></>
                  : undefined
              }
            />
          </div>

          {hayFijos && (
            <Link
              href="/finanzas/fijos"
              className="flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 hover:brightness-[0.99] transition-[filter]"
            >
              <span
                className="grid place-items-center w-10 h-10 rounded-[var(--fz-r-chip)] shrink-0"
                style={
                  recurring.pending > 0
                    ? { background: 'var(--fz-out-tint)', color: 'var(--fz-out-text)' }
                    : { background: 'var(--fz-in-tint)', color: 'var(--fz-in-text)' }
                }
                aria-hidden
              >
                <IconRepeat size={20} stroke={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--fz-ink-2)]">
                  Fijos de {monthName(now.getMonth())}
                </span>
                <span className="block text-[21px] font-bold tracking-[-0.01em] fz-num truncate">
                  {recurring.done} de {recurring.total}
                  <span className="text-[14px] font-semibold text-[var(--fz-ink-3)]"> registrados</span>
                </span>
              </span>
              {recurring.pending > 0 && (
                <span className="text-[13px] font-semibold shrink-0" style={{ color: 'var(--fz-out-text)' }}>
                  {recurring.pending} {recurring.pending === 1 ? 'falta' : 'faltan'}
                </span>
              )}
              <IconChevronRight size={18} stroke={2} className="text-[var(--fz-ink-3)] shrink-0" />
            </Link>
          )}

          {teDeben && (
            <Link
              href="/finanzas/compartidos"
              className="flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 hover:brightness-[0.99] transition-[filter]"
            >
              <span
                className="grid place-items-center w-10 h-10 rounded-[var(--fz-r-chip)] shrink-0"
                style={{ background: 'var(--fz-out-tint)', color: 'var(--fz-out-text)' }}
                aria-hidden
              >
                <IconUsersGroup size={20} stroke={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--fz-ink-2)]">Te deben</span>
                <span className="block text-[21px] font-bold tracking-[-0.01em] fz-num truncate">
                  <AmountUSD value={shared.por_cobrar_usd} />
                </span>
              </span>
              <span className="text-[13px] text-[var(--fz-ink-3)] shrink-0">
                {shared.por_persona.length} {shared.por_persona.length === 1 ? 'persona' : 'personas'}
              </span>
              <IconChevronRight size={18} stroke={2} className="text-[var(--fz-ink-3)] shrink-0" />
            </Link>
          )}

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

            {/* El estado vacío también es una afirmación: "no registraste nada"
                mientras la lista viaja es tan falso como un $0. */}
            {ultimos.loading ? (
              <RowSkeletons n={4} />
            ) : recent.length === 0 ? (
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
        <Panel className="min-w-0 min-[1280px]:sticky min-[1280px]:top-5">
          <SectionTitle
            action={
              <Link href="/finanzas/cuentas" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                Ver todas <IconChevronRight size={14} stroke={2} />
              </Link>
            }
          >
            Cuentas
          </SectionTitle>

          {loading ? (
            <RowSkeletons n={3} />
          ) : (
            /* Solo un asomo: el listado completo vive en /finanzas/cuentas, que es
               justo a donde lleva el "Ver todas" de arriba. Con muchas cuentas
               este rail crecía hasta desbalancear la columna. */
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
              {visible.slice(0, 3).map(a => (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <CurrencyIcon currency={a.currency} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold truncate">{a.name}</p>
                    <p className="text-[12px] text-[var(--fz-ink-3)]">{a.currency}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-semibold fz-num">
                      {hidden ? HIDDEN : formatAmount(a.balance, a.currency)}
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
          )}
        </Panel>
      </div>
    </div>
  )
}

/** Filas fantasma con la misma altura que las reales: la lista no salta al llegar. */
function RowSkeletons({ n }: { n: number }) {
  return (
    <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton w={36} h={36} radius="var(--fz-r-chip)" className="shrink-0" />
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <Skeleton w={`${55 + ((i * 13) % 30)}%`} h={13} />
            <Skeleton w={64} h={11} />
          </div>
          <Skeleton w={58} h={13} className="shrink-0" />
        </div>
      ))}
    </div>
  )
}

function StatTile({ tint, icon, label, value, foot, loading }: {
  tint: 'mint' | 'peach'; icon: React.ReactNode; label: string
  value: number; foot?: React.ReactNode; loading?: boolean
}) {
  return (
    /*
      `min-w-0` no es opcional acá: los hijos de un grid tienen `min-width: auto`
      por defecto, así que no encogen y estiran la página entera. Un monto de
      26px no entra en los ~133px que le tocan a media columna en un iPhone.
    */
    <div
      className="min-w-0 rounded-[var(--fz-r-tile)] p-4"
      style={{ background: `var(--fz-tint-${tint})` }}
    >
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--fz-r-chip)] bg-white/70"
        style={{ color: `var(--fz-tint-${tint}-fg)` }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="mt-3 text-[13px] font-medium text-[var(--fz-ink-2)] truncate">{label}</p>
      {loading ? (
        <Skeleton w="70%" h={24} className="mt-1.5 mb-0.5" />
      ) : (
        /* Baja de cuerpo en pantallas angostas en vez de desbordar. */
        <p className="text-[21px] min-[400px]:text-[26px] font-bold tracking-[-0.01em] fz-num truncate">
          <AmountUSD value={value} />
        </p>
      )}
      {foot && !loading && (
        <p className="text-[12px] font-medium text-[var(--fz-ink-2)] fz-num truncate">{foot}</p>
      )}
    </div>
  )
}
