'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { TablerIcon } from '@tabler/icons-react'
import {
  IconArrowsLeftRight, IconBuildingBank,
  IconChevronRight, IconMinus, IconNotes, IconPlus, IconRepeat, IconSettings, IconUsersGroup, IconWifiOff,
} from '@tabler/icons-react'
import { monthRange, todayISO } from '@/lib/finanzas/transactions'
import { debtsNeedingAttention } from '@/lib/finanzas/splits'
import { needsAttentionSoon } from '@/lib/finanzas/recurring'
import { formatAmount, formatUSD, HIDDEN, round2 } from '@/lib/finanzas/money'
import { CURRENCY_META, type BudgetLineProgress } from '@/lib/finanzas/types'
import { AmountUSD, HideToggle } from '../components/amount'
import { monthQuery, useFinanzas, useTransactions } from '../components/data-context'
import { useHeroPref } from '../components/hero-pref'
import { HeroSettingsSheet } from '../components/hero-settings-sheet'
import { CategoryIcon } from '../components/category-icon'
import { useQuickAdd, useQuickEdit } from '../components/quick-add-context'
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
  const { accounts, categories, shared, recurring, budgets, totalUsd, rates, loading, stale, error, reload, hidden, userName } = useFinanzas()
  const openQuickAdd = useQuickAdd()
  const openEdit = useQuickEdit()
  const { navigate } = useFzRouter()
  const { mode: heroMode, setMode: setHeroMode } = useHeroPref()
  const [heroSettings, setHeroSettings] = useState(false)

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
  const hayReparto = gastoRealMes !== gastoMes
  const hoy = todayISO()

  // Las dos son alertas, no resúmenes — solo aparecen si hay algo que de
  // verdad requiere atención (ver `needsAttentionSoon`/`debtsNeedingAttention`).
  const hayFijos = needsAttentionSoon(recurring.recurring, hoy)

  const deudasAbiertas = shared.por_persona.flatMap(p => p.debts)
  const deudasRelevantes = debtsNeedingAttention(deudasAbiertas, hoy)
  const montoTeDeben = round2(deudasRelevantes.reduce((s, d) => s + d.amount_usd, 0))
  const personasTeDeben = new Set(deudasRelevantes.map(d => d.person_id)).size
  const teDeben = montoTeDeben > 0

  const visible = accounts.filter(a => !a.archived)
  const hasBtc = visible.some(a => a.currency === 'BTC')

  // El pie del hero es el mismo en los dos cards: la tasa del día es un dato
  // que se mira seguido en Bolivia, y no depende de qué número esté arriba.
  const heroFoot = loading ? 'Cargando tus cuentas…' : stale ? 'actualizando…' : (
    <>
      {`1 USD = Bs ${(rates.BOB ?? CURRENCY_META.BOB.defaultRate).toFixed(2)}`}
      {/* El BTC solo aparece si el usuario realmente tiene una cuenta en esa
          moneda — no tiene sentido mostrar una tasa que no usa. */}
      {hasBtc && ` · 1 BTC = ${formatUSD(rates.BTC ?? CURRENCY_META.BTC.defaultRate)}`}
    </>
  )

  const general = budgets.general
  const budgetCapacity = general ? general.amount_usd + general.extended_usd + general.carried_usd : 0
  const budgetLeft = general ? general.available_usd : 0
  const budgetOver = !!general && budgetCapacity > 0 && general.spent_usd > budgetCapacity

  const patrimonioCard = (
    <HeroCard
      label="Patrimonio total"
      value={loading ? null : hidden ? HIDDEN : formatUSD(totalUsd)}
      foot={heroFoot}
      // Reemplaza a la barra de proporción ingreso/gasto: un número con signo
      // dice más que una barra sin escala (§16.1 / §18). Mismo verde/rojo que
      // el resto de la app — nunca lima para "entró plata": ese es el color de
      // marca, no el semántico.
      note={!loading && !hidden && !mes.loading ? {
        text: `${netoMes >= 0 ? '↗ +' : '↘ −'}${formatUSD(Math.abs(netoMes))} este mes`,
        color: netoMes >= 0 ? 'var(--fz-in)' : 'var(--fz-out)',
      } : undefined}
    />
  )

  const presupuestoCard = (
    <HeroCard
      label="Presupuesto total"
      value={
        loading ? null
          : !general ? '—'
          : hidden ? HIDDEN
          : formatUSD(general.spent_usd)
      }
      of={general && !hidden && !loading ? formatUSD(budgetCapacity) : undefined}
      foot={general ? heroFoot : 'Todavía no armaste tu presupuesto'}
      note={general && !hidden && !loading ? {
        text: budgetLeft >= 0
          ? `Te quedan ${formatUSD(budgetLeft)}`
          : `Te pasaste por ${formatUSD(Math.abs(budgetLeft))}`,
        color: budgetLeft >= 0 ? 'var(--fz-in)' : 'var(--fz-out)',
      } : undefined}
      bar={general && !loading ? {
        pct: budgetCapacity > 0 ? Math.round((general.spent_usd / budgetCapacity) * 100) : 0,
        tickPct: general.days_in_period > 0 ? (general.day_of_period / general.days_in_period) * 100 : 0,
        over: budgetOver,
      } : undefined}
    />
  )

  const heroCards =
    heroMode === 'patrimonio' ? [patrimonioCard]
      : heroMode === 'presupuesto' ? [presupuestoCard]
      : [patrimonioCard, presupuestoCard]

  const budgetLines = budgets.categories

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
        action={
          <>
            <HideToggle />
            <button
              type="button"
              onClick={() => setHeroSettings(true)}
              aria-label="Elegir qué mostrar arriba"
              className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)] transition-colors"
            >
              <IconSettings size={18} stroke={1.8} />
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-5 min-w-0">
          {/* Fila superior: hero + acciones rápidas. En mobile se apilan (grid
              de 1 columna, igual que antes); desde 900px comparten fila — el
              hero manda el alto y las acciones se estiran a juego (§22). */}
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[1fr_240px] min-[900px]:items-stretch">
            {/* Hero: el único bloque oscuro de la pantalla. Según la
                preferencia muestra patrimonio, presupuesto, o los dos como
                carrusel — el diseño del card no cambia, solo el dato. */}
            {heroCards.length === 1 ? heroCards[0] : <HeroCarousel cards={heroCards} />}

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

          {/* Los presupuestos por categoría, en carrusel — mismo tratamiento
              que Cuentas más abajo: con varios se scrollea en vez de
              esconderse. Solo aparece si hay alguno cargado. */}
          {budgetLines.length > 0 && (
            <Panel>
              <SectionTitle
                action={
                  <FzLink href="/finanzas/presupuesto" className="text-[13px] font-semibold text-[var(--fz-accent)] inline-flex items-center gap-0.5">
                    Ver todos <IconChevronRight size={14} stroke={2} />
                  </FzLink>
                }
              >
                Presupuestos
              </SectionTitle>

              <div className="fz-scroll-x flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1">
                {budgetLines.map(line => (
                  <BudgetTile
                    key={line.line_id}
                    line={line}
                    hidden={hidden}
                    icon={categories.find(c => c.id === line.category_id)?.icon ?? null}
                    onClick={() => navigate('/finanzas/presupuesto')}
                  />
                ))}
              </div>
            </Panel>
          )}

          {/* Mismas barras anchas de siempre, pero solo hasta 900px: desde ahí
              las reemplaza el tile de la fila de abajo. Van ANTES de
              Ingresos/Gastos a propósito: esa fila tiene que quedar pegada a
              Movimientos, sin nada en el medio en mobile (feedback del
              usuario). */}
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
                  Gastos Fijos de {monthName(now.getMonth())}
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
                  <AmountUSD value={montoTeDeben} />
                </span>
              </span>
              <span className="text-[13px] text-[var(--fz-ink-3)] shrink-0">
                {personasTeDeben} {personasTeDeben === 1 ? 'persona' : 'personas'}
              </span>
              <IconChevronRight size={18} stroke={2} className="text-[var(--fz-ink-3)] shrink-0" />
            </FzLink>
          )}

          {/* Ingresos y Gastos siempre; Fijos y Deudas se suman como tile
              cuando aplican, pero solo desde 900px (en mobile ya están arriba
              como barra ancha) — así esta fila queda pegada a Movimientos en
              cualquier tamaño de pantalla. */}
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

            {/* Mismo destino y mismo dato que la barra ancha de arriba, en
                formato tile para la fila de 4 — solo visible desde 900px, así
                que en mobile no hay contenido duplicado en el DOM visible. */}
            {hayFijos && (
              <div className="hidden min-[900px]:block">
                <SummaryLinkTile
                  href="/finanzas/fijos"
                  tone={recurring.pending > 0 ? 'out' : 'in'}
                  icon={<IconRepeat size={18} stroke={1.9} />}
                  label={`Gastos Fijos de ${monthName(now.getMonth())}`}
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
                  value={<AmountUSD value={montoTeDeben} />}
                  meta={`${personasTeDeben} ${personasTeDeben === 1 ? 'persona' : 'personas'}`}
                />
              </div>
            )}
          </div>

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

      {heroSettings && (
        <HeroSettingsSheet
          mode={heroMode}
          onChange={setHeroMode}
          onClose={() => setHeroSettings(false)}
        />
      )}
    </div>
  )
}

/**
 * Un presupuesto en la tira horizontal de la Home. Mismo tamaño y forma que
 * las cards de Cuentas de más abajo, con la barra de progreso en vez del
 * equivalente en USD. Todo en la moneda de la línea, igual que en la
 * pantalla de Presupuesto.
 */
function BudgetTile({ line, hidden, icon, onClick }: {
  line: BudgetLineProgress
  hidden: boolean
  icon: string | null
  onClick: () => void
}) {
  const cur = line.input_currency
  const capacityUsd = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd
  const pct = capacityUsd > 0 ? Math.round((line.spent_usd / capacityUsd) * 100) : 0
  const over = capacityUsd > 0 && line.spent_usd > capacityUsd
  const capacity = (line.amount ?? 0) + line.extended + line.carried

  return (
    <button
      type="button"
      onClick={onClick}
      className="snap-start shrink-0 w-[148px] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5 flex flex-col gap-2.5 text-left"
    >
      <CategoryIcon slug={icon} name={line.name ?? line.category_name} size={30} />
      <div className="min-w-0 w-full">
        <p className="text-[13px] font-semibold text-[var(--fz-ink-2)] truncate">
          {line.name ?? line.category_name}
        </p>
        <p className={`text-[16px] font-bold tracking-[-0.01em] fz-num truncate ${over ? 'text-[var(--fz-out-text)]' : ''}`}>
          {hidden ? HIDDEN : formatAmount(line.spent, cur)}
        </p>
        <p className="text-[11px] text-[var(--fz-ink-3)] fz-num truncate">
          {hidden ? '' : `de ${formatAmount(capacity, cur)}`}
        </p>

        <div className="relative h-1.5 mt-2 rounded-full bg-[var(--fz-surface)] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: over || pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
            }}
          />
        </div>
      </div>
    </button>
  )
}

/**
 * Los dos heroes en carrusel, con barritas debajo que dicen en cuál estás.
 *
 * El índice sale del scroll real y no de un estado propio: así el indicador
 * sigue al dedo aunque el swipe quede a mitad de camino, en vez de saltar
 * solo cuando termina. Tocar una barrita lleva a su card.
 */
// Cuánto se achica cada card para que asome el siguiente, y cuánto separa
// una card de la otra — tienen que ser los mismos números en el cálculo del
// paso de scroll y en las clases de Tailwind de acá abajo.
const HERO_PEEK = 32
const HERO_GAP = 12

function HeroCarousel({ cards }: { cards: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  // El paso entre cards ya no es el ancho del viewport: cada card mide un
  // poco menos (`HERO_PEEK`) para que asome el borde de la siguiente, así
  // que el paso real es ese ancho más la separación entre cards.
  function step(el: HTMLDivElement) {
    return Math.max(1, el.clientWidth - HERO_PEEK + HERO_GAP)
  }

  function onScroll() {
    const el = ref.current
    if (!el) return
    const i = Math.round(el.scrollLeft / step(el))
    setActive(Math.min(cards.length - 1, Math.max(0, i)))
  }

  function goTo(i: number) {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: i * step(el), behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={ref}
        onScroll={onScroll}
        // `flex-1`: desde 900px la fila estira el hero, y sin esto el
        // carrusel se quedaba a la altura del contenido dejando un hueco.
        // Sin padding lateral a propósito: el cálculo del paso asume que el
        // scroller arranca en 0, y un px-1 lo corre unos pixeles.
        className="fz-scroll-x flex flex-1 gap-3 overflow-x-auto snap-x snap-mandatory"
        aria-label="Deslizá para ver patrimonio o presupuesto"
      >
        {cards.map((card, i) => (
          // `snap-start`, no center: con un ancho menor al 100% alcanza para
          // que se note el borde de la próxima card sin dejar un hueco vacío
          // adelante de la primera.
          <div key={i} className="snap-start shrink-0 w-[calc(100%-32px)] min-w-0">{card}</div>
        ))}
      </div>

      {/* Barritas en vez de puntos: la activa es más larga y opaca. */}
      <div className="flex items-center justify-center gap-1.5">
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Ver card ${i + 1} de ${cards.length}`}
            aria-current={i === active}
            className={`h-1 rounded-full transition-all duration-200 ${
              i === active ? 'w-6 bg-[var(--fz-ink-2)]' : 'w-3 bg-[var(--fz-hairline)]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * El card oscuro de arriba. El diseño es fijo — rótulo chico, número grande,
 * una nota con signo y el pie — y lo único que cambia es qué se le pasa:
 * patrimonio o presupuesto. Así los dos se ven idénticos al deslizar.
 *
 * `value: null` = todavía cargando; se pinta el esqueleto en su lugar.
 */
function HeroCard({ label, value, of, note, foot, bar }: {
  label: string
  value: string | null
  /** El "de $X" que acompaña al número grande — mismo tratamiento que la
      pantalla de Presupuesto: alineado a la base, chico y tenue. */
  of?: string
  note?: { text: string; color: string }
  foot: ReactNode
  /** Misma barra que la pantalla de Presupuesto — relleno + tick del día —
      pero sobre el fondo oscuro: el carril y el tick van en blancos
      translúcidos en vez de los tokens de superficie. */
  bar?: { pct: number; tickPct: number; over: boolean }
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--fz-r-card)] bg-[var(--fz-hero)] p-6 text-white h-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(130% 90% at 100% 0%, rgba(200,241,105,0.14), transparent 60%)' }}
      />

      <p className="relative text-[13px] font-medium text-white/60">{label}</p>

      {value === null ? (
        <Skeleton w="min(220px, 70%)" h={38} onDark className="relative mt-2" />
      ) : (
        <div className="relative mt-1 flex items-baseline gap-2 min-w-0">
          <p className="text-[34px] min-[400px]:text-[40px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
            {value}
          </p>
          {of && <span className="text-[14px] text-white/50 fz-num shrink-0">de {of}</span>}
        </div>
      )}

      {bar && (
        <div className="relative mt-3 h-3 rounded-full bg-white/12 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(100, bar.pct)}%`,
              background: bar.over || bar.pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
            }}
          />
          {/* "Acá deberías estar hoy", según el día del mes. */}
          <div
            className="absolute inset-y-0 w-[2px] bg-white/45"
            style={{ left: `${Math.min(100, bar.tickPct)}%` }}
            aria-hidden
          />
        </div>
      )}

      {note && (
        <p className="relative mt-2 text-[13px] font-semibold fz-num" style={{ color: note.color }}>
          {note.text}
        </p>
      )}

      <p className="relative mt-2 text-[13px] text-white/50">{foot}</p>
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
