'use client'

import { useMemo } from 'react'
import type { TablerIcon } from '@tabler/icons-react'
import {
  IconArrowDownLeft, IconArrowsLeftRight, IconArrowUpRight, IconBuildingBank,
  IconChevronRight, IconNotes, IconRepeat, IconUsersGroup, IconWifiOff,
} from '@tabler/icons-react'
import { monthRange } from '@/lib/finanzas/transactions'
import { formatAmount, formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { AmountUSD, HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
import { CurrencyIcon } from '../components/currency-icon'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, EmptyState, monthName, Panel, SectionTitle, Skeleton } from '../components/ui'
import { FzLink, useFzRouter } from '../components/router'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function HomeScreen() {
  const { accounts, categories, shared, recurring, totalUsd, rates, loading, stale, error, reload, hidden } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()
  const { navigate } = useFzRouter()

  const now = useMemo(() => new Date(), [])
  const range = useMemo(() => monthRange(now), [now])

  const mes = useTransactions(monthQuery(range))
  const ultimos = useTransactions({ limit: '5' })

  const gastoMes = mes.data.total_gasto_usd
  const gastoRealMes = mes.data.total_gasto_real_usd
  const ingresoMes = mes.data.total_ingreso_usd
  // Lo que entró menos lo que realmente costó, no lo que salió bruto: si
  // repartiste un gasto, la parte de otros no debería restar tu crecimiento
  // del mes. Reemplaza a la barra de proporción sin escala (§16.1 / §18).
  const netoMes = ingresoMes - gastoRealMes
  const recent = ultimos.data.transactions

  // Los dos bloques son condicionales: si no tenés deudas ni fijos, la Home se
  // ve exactamente igual que antes. La feature no le cobra espacio a quien no
  // la usa.
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
            icon={IconWifiOff}
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
            icon={IconBuildingBank}
            title="Empezá por tus cuentas"
            description="Cargá dónde tenés tu plata hoy — efectivo, banco, broker, cripto. Sin cuentas, un movimiento no tiene de dónde salir."
            action={<Btn onClick={() => navigate('/finanzas/cuentas')}>Crear mi primera cuenta</Btn>}
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
        action={<HideToggle />}
      />

      <div className="flex flex-col gap-5 min-w-0">
          {/* Hero: el único bloque oscuro de la pantalla. */}
          <div className="relative overflow-hidden rounded-[var(--fz-r-card)] bg-[var(--fz-hero)] p-6 text-white">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(130% 90% at 100% 0%, rgba(200,241,105,0.14), transparent 60%)' }}
            />

            <p className="relative text-[13px] font-medium text-white/60">Patrimonio total</p>

            {loading ? (
              <Skeleton w="min(220px, 70%)" h={38} onDark className="relative mt-2" />
            ) : (
              <p className="relative mt-1 text-[34px] min-[400px]:text-[40px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
                {hidden ? HIDDEN : formatUSD(totalUsd)}
              </p>
            )}

            {/* Reemplaza a la barra de proporción ingreso/gasto: un número con
                signo dice más que una barra sin escala (§16.1 / §18). Mismo
                verde/rojo que el resto de la app — nunca lima para "entró
                plata": ese es el color de marca, no el semántico. */}
            {!loading && !hidden && !mes.loading && (
              <p
                className="relative mt-2 text-[13px] font-semibold fz-num"
                style={{ color: netoMes >= 0 ? 'var(--fz-in)' : 'var(--fz-out)' }}
              >
                {netoMes >= 0 ? '↗ +' : '↘ −'}{formatUSD(Math.abs(netoMes))} este mes
              </p>
            )}

            <p className="relative mt-2 text-[13px] text-white/50">
              {loading ? 'Cargando tus cuentas…' : (
                <>
                  {visible.length} {visible.length === 1 ? 'cuenta' : 'cuentas'} ·{' '}
                  {/* La tasa del día es un dato que se mira seguido en Bolivia:
                      decirla es más útil que decir que se usó (§16.1). */}
                  {stale ? 'actualizando…' : `1 USD = Bs ${(rates.BOB ?? 6.96).toFixed(2)}`}
                </>
              )}
            </p>
          </div>

          {/* Única puerta de entrada para registrar: no hay un "Nuevo
              movimiento" aparte, que llevaría al mismo panel y volvería
              redundante elegir Gasto/Ingreso/Transferir acá (§16.3). Cada
              botón abre el sheet con el tipo ya fijado. */}
          <div className="grid grid-cols-3 gap-2.5">
            <QuickAction label="Gasto" Icon={IconArrowUpRight} onClick={() => openQuickAdd('gasto')} />
            <QuickAction label="Ingreso" Icon={IconArrowDownLeft} onClick={() => openQuickAdd('ingreso')} />
            <QuickAction label="Transferir" Icon={IconArrowsLeftRight} onClick={() => openQuickAdd('transferencia')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              tone="in"
              icon={<IconArrowDownLeft size={18} stroke={2} />}
              label={`Ingresos de ${monthName(now.getMonth())}`}
              value={ingresoMes}
              loading={mes.loading}
            />
            <StatTile
              tone="out"
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
            <FzLink
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
            </FzLink>
          )}

          {teDeben && (
            <FzLink
              href="/finanzas/deudas"
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
            </FzLink>
          )}

          {/* Movimientos antes que Cuentas: es lo que se quiere ver primero al
              entrar (§21). Antes Cuentas vivía en una tercera columna fija al
              lado de Movimientos; en desktop ese rail no scrolleaba con el
              resto y quedaba como un bloque aparte. Ahora los dos son paneles
              del mismo flujo: sidebar fija a la izquierda, todo lo demás en
              una sola columna que scrollea junto (§20). */}
          <Panel>
            <SectionTitle
              action={
                <FzLink href="/finanzas/movimientos" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                  Ver todos <IconChevronRight size={14} stroke={2} />
                </FzLink>
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
                icon={IconNotes}
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

          <Panel>
            <SectionTitle
              action={
                <FzLink href="/finanzas/cuentas" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                  Ver todas <IconChevronRight size={14} stroke={2} />
                </FzLink>
              }
            >
              Cuentas
            </SectionTitle>

            {loading ? (
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} w={148} h={104} radius="var(--fz-r-tile)" className="shrink-0" />
                ))}
              </div>
            ) : (
              /* Carrusel horizontal con peek en vez de una lista truncada a 3:
                 con muchas cuentas se scrollea en vez de esconderse detrás de
                 "Ver todas" (§16.4). `snap-mandatory` para que cada tarjeta
                 quede prolija al soltar el dedo. */
              <div className="fz-scroll-x flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1">
                {visible.map(a => (
                  <div
                    key={a.id}
                    className="snap-start shrink-0 w-[148px] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5 flex flex-col gap-2.5"
                  >
                    <CurrencyIcon currency={a.currency} size={30} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--fz-ink-2)] truncate">{a.name}</p>
                      <p className="text-[16px] font-bold tracking-[-0.01em] fz-num truncate">
                        {hidden ? HIDDEN : formatAmount(a.balance, a.currency)}
                      </p>
                      {a.currency !== 'USD' && (
                        <p className="text-[11px] text-[var(--fz-ink-3)] fz-num truncate">
                          {hidden ? '' : <>≈ <AmountUSD value={a.balance_usd} /></>}
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

/** Un botón de acción rápida: chip circular + etiqueta, al estilo Pay/Transfer
    /Receive de la referencia de wallet (§14, referencia 5). */
function QuickAction({ label, Icon, onClick }: { label: string; Icon: TablerIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] transition-transform active:scale-[0.97]"
    >
      <span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]">
        <Icon size={19} stroke={1.8} />
      </span>
      <span className="text-[12px] font-semibold text-[var(--fz-ink-2)]">{label}</span>
    </button>
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

/**
 * Ingresos y gastos usan siempre el mismo par de tokens semánticos que el
 * resto de la app (`--fz-in`/`--fz-out`) — antes este tile pintaba con el
 * sistema de tintes de categoría (`mint`/`peach`, un verde y un ámbar que no
 * eran ni el verde ni el rojo del resto de la app), y "gasto" terminaba
 * viéndose de un color acá y de otro en Movimientos.
 */
function StatTile({ tone, icon, label, value, foot, loading }: {
  tone: 'in' | 'out'; icon: React.ReactNode; label: string
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
