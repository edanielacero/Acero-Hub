'use client'

import { useMemo } from 'react'
import type { TablerIcon } from '@tabler/icons-react'
import {
  IconArrowsLeftRight, IconBuildingBank,
  IconChevronRight, IconMinus, IconNotes, IconPlus, IconRepeat, IconUsersGroup, IconWifiOff,
} from '@tabler/icons-react'
import { monthRange } from '@/lib/finanzas/transactions'
import { formatAmount, formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { AmountUSD, HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { useQuickAdd } from '../components/quick-add-context'
import { useEditTransaction } from '../components/account-value-context'
import { CurrencyIcon } from '../components/currency-icon'
import { IconGasto, IconIngreso } from '../components/flow-icon'
import { PageHeader, TxRow } from '../components/tx-row'
import { Btn, EmptyState, monthName, Panel, SectionTitle, Skeleton } from '../components/ui'
import { FzLink, useFzRouter } from '../components/router'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Solo el primero: en el título grande "Daniel Acero" no entra ni hace falta. */
function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'Finanzas'
}

export function HomeScreen() {
  const { accounts, categories, shared, recurring, totalUsd, rates, loading, stale, error, reload, hidden, userName } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useEditTransaction()
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
        title={firstName(userName)}
        subtitle={greeting()}
        action={<HideToggle />}
      />

      <div className="flex flex-col gap-5 min-w-0">
          {/* Fila superior: hero + acciones rápidas. En mobile se apilan (grid
              de 1 columna, igual que antes); desde 900px comparten fila — el
              hero manda el alto y las acciones se estiran a juego (§22). */}
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[1fr_240px] min-[900px]:items-stretch">
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
                botón abre el sheet con el tipo ya fijado. Fila de 3 en
                mobile; columna de 3 al lado del hero desde 900px. Acá el
                ícono es +/− genérico (no IconIngreso/IconGasto, que quedan
                reservados para identificar el tipo de movimiento en el resto
                de la app): estos tres son botones de acción, no etiquetas, y
                el nombre completo (verbo + objeto) refuerza eso. */}
            <div className="grid grid-cols-3 gap-2.5 min-[900px]:flex min-[900px]:flex-col min-[900px]:h-full">
              <QuickAction label="Agregar ingreso" Icon={IconPlus} onClick={() => openQuickAdd('ingreso')} />
              <QuickAction label="Registrar gasto" Icon={IconMinus} onClick={() => openQuickAdd('gasto')} />
              <QuickAction label="Mover entre cuentas" Icon={IconArrowsLeftRight} onClick={() => openQuickAdd('transferencia')} />
            </div>
          </div>

          {/* Fila de resumen: Ingresos y Gastos siempre; Fijos y Deudas se
              suman cuando aplican. En mobile son 2 columnas (Fijos/Deudas
              siguen abajo como barra ancha, sin cambios); desde 900px los
              cuatro entran en una sola fila de 4 (§22). */}
          <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
            <StatTile
              tone="in"
              icon={<IconIngreso size={18} stroke={2} />}
              label={`Ingresos de ${monthName(now.getMonth())}`}
              value={ingresoMes}
              loading={mes.loading}
            />
            <StatTile
              tone="out"
              icon={<IconGasto size={18} stroke={2} />}
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

            {/* Mismo destino y mismo dato que la barra ancha de abajo, en
                formato tile para la fila de 4 — solo visible desde 900px, así
                que en mobile no hay contenido duplicado en el DOM visible. */}
            {hayFijos && (
              <div className="hidden min-[900px]:block">
                <SummaryLinkTile
                  href="/finanzas/fijos"
                  tone={recurring.pending > 0 ? 'out' : 'in'}
                  icon={<IconRepeat size={18} stroke={1.9} />}
                  label={`Fijos de ${monthName(now.getMonth())}`}
                  value={<>{recurring.done}<span className="text-[14px] font-semibold text-[var(--fz-ink-3)]">/{recurring.total}</span></>}
                  meta={recurring.pending > 0
                    ? `${recurring.pending} ${recurring.pending === 1 ? 'pendiente' : 'pendientes'}`
                    : 'al día'}
                />
              </div>
            )}
            {teDeben && (
              <div className="hidden min-[900px]:block">
                <SummaryLinkTile
                  href="/finanzas/deudas"
                  tone="out"
                  icon={<IconUsersGroup size={18} stroke={1.9} />}
                  label="Te deben"
                  value={<AmountUSD value={shared.por_cobrar_usd} />}
                  meta={`${shared.por_persona.length} ${shared.por_persona.length === 1 ? 'persona' : 'personas'}`}
                />
              </div>
            )}
          </div>

          {/* Mismas barras anchas de siempre, pero solo hasta 900px: desde ahí
              las reemplaza el tile de la fila de arriba. */}
          {hayFijos && (
            <FzLink
              href="/finanzas/fijos"
              className="min-[900px]:hidden flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 hover:brightness-[0.99] transition-[filter]"
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
              className="min-[900px]:hidden flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] p-4 hover:brightness-[0.99] transition-[filter]"
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

          {/* Movimientos y Cuentas: en mobile apilados (grid de 1 columna,
              Movimientos primero — §21); desde 900px lado a lado, Movimientos
              más ancho porque es la lista que más se lee. Los dos siguen
              siendo parte del mismo flujo que scrollea con la página — no hay
              una columna con scroll propio (§20 / §22). */}
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[1fr_320px] min-[900px]:items-start">
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
                    <TxRow key={tx.id} tx={tx} accounts={accounts} categories={categories} onClick={() => openEdit(tx, accounts)} />
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
    </div>
  )
}

/**
 * Un botón de acción rápida. En mobile: chip circular + etiqueta apilados, al
 * estilo Pay/Transfer/Receive de la referencia de wallet (§14, referencia 5).
 * Desde 900px, dentro de la columna al lado del hero, se reacomoda a fila —
 * ícono, etiqueta y chevron, como un ítem de lista — y se estira con
 * `flex-1` para repartirse el alto disponible en partes iguales (§22).
 */
function QuickAction({ label, Icon, onClick }: { label: string; Icon: TablerIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-rest)] transition-transform active:scale-[0.97] min-[900px]:flex-1 min-[900px]:w-full min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-start min-[900px]:gap-3 min-[900px]:px-4 min-[900px]:py-0"
    >
      <span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)] shrink-0">
        <Icon size={19} stroke={1.8} />
      </span>
      <span className="text-[12px] font-semibold leading-tight text-center text-[var(--fz-ink-2)] min-[900px]:text-[14px] min-[900px]:text-left min-[900px]:text-[var(--fz-ink)]">
        {label}
      </span>
      <IconChevronRight size={16} stroke={2} className="hidden min-[900px]:block ml-auto text-[var(--fz-ink-3)]" />
    </button>
  )
}

/**
 * Tile de resumen que además es un link — la versión "de escritorio" de la
 * barra ancha de Fijos/Deudas (§22), pensada para convivir con `<StatTile>`
 * en la misma fila de 4. Mismo tamaño de chip, mismo cuerpo de monto: la
 * única diferencia visual es el chevron, que dice "esto lleva a otro lado".
 */
function SummaryLinkTile({ href, tone, icon, label, value, meta }: {
  href: string; tone: 'in' | 'out'; icon: React.ReactNode; label: string
  value: React.ReactNode; meta?: React.ReactNode
}) {
  return (
    <FzLink
      href={href}
      className="block min-w-0 rounded-[var(--fz-r-tile)] p-4 hover:brightness-[0.99] transition-[filter]"
      style={{ background: `var(--fz-${tone}-tint)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--fz-r-chip)] bg-white/70"
          style={{ color: `var(--fz-${tone}-text)` }}
          aria-hidden
        >
          {icon}
        </span>
        <IconChevronRight size={16} stroke={2} className="text-[var(--fz-ink-3)] mt-1.5 shrink-0" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-[var(--fz-ink-2)] truncate">{label}</p>
      <p className="text-[21px] min-[400px]:text-[26px] font-bold tracking-[-0.01em] fz-num truncate">{value}</p>
      {meta && <p className="text-[12px] font-medium text-[var(--fz-ink-2)] fz-num truncate">{meta}</p>}
    </FzLink>
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
