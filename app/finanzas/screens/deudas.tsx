'use client'

import { useMemo, useState } from 'react'
import { IconArrowBackUp, IconChevronDown, IconCircleCheckFilled, IconCoinOff, IconListNumbers, IconPencil, IconPlus, IconReceiptRefund, IconRefresh, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import type { DebtPlanWithCuotas, DebtWithContext, PersonDebt } from '@/lib/finanzas/types'
import { formatAmount, formatUSD, HIDDEN, round2 } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { debtLabel } from '@/lib/finanzas/splits'
import { CurrencyIcon } from '../components/currency-icon'
import { useFinanzas } from '../components/data-context'
import { DebtSheet } from '../components/debt-sheet'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PlanSheet } from '../components/plan-sheet'
import { SettleSheet } from '../components/settle-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, IconChip, Panel, PersonAvatar, RowMenu, SectionTitle, Skeleton } from '../components/ui'

export function DeudasScreen() {
  const { shared, hidden, loading, reload, plans } = useFinanzas()
  const [cobrando, setCobrando] = useState<PersonDebt | null>(null)
  const [creando, setCreando] = useState(false)
  const [viendo, setViendo] = useState<DebtWithContext | null>(null)
  const [editando, setEditando] = useState<DebtWithContext | null>(null)
  const [eliminando, setEliminando] = useState<DebtWithContext | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)
  const [busy, setBusy] = useState('')

  const [planificandoDebt, setPlanificandoDebt] = useState<DebtWithContext | null>(null)
  const [regenerandoPlan, setRegenerandoPlan] = useState<DebtPlanWithCuotas | null>(null)
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [cobrandoCuota, setCobrandoCuota] = useState<{ plan: DebtPlanWithCuotas; cuota: DebtWithContext } | null>(null)
  const [eliminandoPlan, setEliminandoPlan] = useState<DebtPlanWithCuotas | null>(null)
  const [confirmingDeletePlan, setConfirmingDeletePlan] = useState(false)
  const [deletePlanError, setDeletePlanError] = useState('')

  const hoy = useMemo(() => todayISO(), [])

  // Las cuotas de un plan ya se muestran agrupadas en su propia fila (con
  // colapsar/expandir); acá solo entran las deudas sueltas de cada persona,
  // o el bloque quedaría duplicando lo que el plan ya cuenta. El total y el
  // botón "Cobrar" de la persona se recalculan sobre ese subconjunto — cobrar
  // una cuota sigue siendo una acción propia de la cuota, dentro del plan.
  const sueltasPorPersona = useMemo(
    () => shared.por_persona
      .map(pd => ({ ...pd, debts: pd.debts.filter(s => !s.plan_id) }))
      .filter(pd => pd.debts.length > 0)
      .map(pd => ({ ...pd, open_usd: round2(pd.debts.reduce((s, x) => s + x.amount_usd, 0)) })),
    [shared.por_persona],
  )
  const hayDeudas = plans.length > 0 || sueltasPorPersona.length > 0

  async function post(path: string, body: unknown, key: string) {
    setBusy(key)
    await fetch(`/api/finanzas/debts/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await reload()
    setBusy('')
  }

  async function confirmDeleteDebt() {
    if (!eliminando) return
    setConfirmingDelete(true)
    setDeleteError('')
    const res = await fetch(`/api/finanzas/debts/${eliminando.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setConfirmingDelete(false)
      return setDeleteError(data.error ?? 'No se pudo borrar')
    }
    // Se cierra recién después de reload(): antes, el sheet desaparecía con
    // la lista todavía sin actualizar, y se veía la fila vieja un instante.
    await reload()
    setConfirmingDelete(false)
    setEliminando(null)
  }

  async function confirmDeletePlan() {
    if (!eliminandoPlan) return
    setConfirmingDeletePlan(true)
    setDeletePlanError('')
    const res = await fetch(`/api/finanzas/debt-plans/${eliminandoPlan.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setConfirmingDeletePlan(false)
      return setDeletePlanError(data.error ?? 'No se pudo borrar')
    }
    await reload()
    setConfirmingDeletePlan(false)
    setEliminandoPlan(null)
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Deudas"
        subtitle="Lo que te deben, venga de donde venga"
        action={
          <>
            <HideToggle />
            <Btn size="sm" onClick={() => setCreando(true)}>
              <IconPlus size={18} stroke={2} /> Nueva
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Te deben" value={shared.por_cobrar_usd} tone="out" hidden={hidden} loading={loading} />
          <Tile label="Cobrado este mes" value={shared.cobrado_mes_usd} tone="in" hidden={hidden} loading={loading} />
        </div>

        <Panel>
          <SectionTitle>Deudas abiertas</SectionTitle>

          {loading && !hayDeudas ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p>
          ) : !hayDeudas ? (
            <EmptyState
              icon={IconUsersGroup}
              title="Nadie te debe nada"
              description="Las deudas aparecen acá de dos formas: cuando registras un fijo compartido, o cuando cargas una a mano."
              action={<Btn onClick={() => setCreando(true)}>Registrar una deuda</Btn>}
            />
          ) : (
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
              {plans.map(p => (
                <PlanRow
                  key={p.id}
                  plan={p}
                  hidden={hidden}
                  expanded={expandedPlan === p.id}
                  busy={busy}
                  onToggle={() => setExpandedPlan(expandedPlan === p.id ? null : p.id)}
                  onRegenerate={() => setRegenerandoPlan(p)}
                  onDelete={() => setEliminandoPlan(p)}
                  onCobrarCuota={c => setCobrandoCuota({ plan: p, cuota: c })}
                  onEditarCuota={c => setEditando(c)}
                  onPerdonarCuota={c => post('waive', { split_ids: [c.id] }, c.id)}
                />
              ))}
              {sueltasPorPersona.map(d => (
                <section key={d.person.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={d.person.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold truncate">{d.person.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {d.debts.length} {d.debts.length === 1 ? 'deuda' : 'deudas'}
                        {d.oldest_days != null && d.oldest_days > 0 && ` · la más vieja hace ${d.oldest_days} días`}
                      </p>
                    </div>
                    <span className="fz-num text-[16px] font-bold shrink-0">
                      {hidden ? HIDDEN : formatUSD(d.open_usd)}
                    </span>
                    <Btn size="sm" onClick={() => setCobrando(d)}>Cobrar</Btn>
                  </div>

                  {/*
                    Una línea tenue entre deuda y deuda. Sin separador, dos
                    deudas de la misma persona se leen como una sola de varias
                    líneas — sobre todo desde que la fila envuelve en móvil.
                    `divide-y` y no un borde por fila: no dibuja línea después
                    de la última, que colgaría suelta contra el separador de la
                    persona siguiente.
                  */}
                  <div className="mt-1.5 ml-[52px] flex flex-col divide-y divide-[var(--fz-hairline)]">
                    {d.debts.map(s => (
                      /*
                        `flex-wrap` + `ml-auto`: a 390px el monto y "Perdonar"
                        bajan solos en vez de estrujar el concepto. Sin esto
                        "Le presté en efectivo" se cortaba en "Le presté en …",
                        que es justo el dato que dice de qué es la deuda.
                      */
                      <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => setViendo(s)}
                          className="flex-1 min-w-[60%] text-left"
                        >
                          <span className="block text-[13px] font-medium truncate">
                            {debtLabel(s)}
                          </span>
                          <span className="block text-[12px] text-[var(--fz-ink-3)]">
                            {formatDayLabel(s.incurred_on, hoy)}
                            {/* Saber de dónde salió importa: una de un gasto
                                no se edita acá, y una cuota de un plan cambia
                                de moneda regenerando el plan, no editándola. */}
                            {s.transaction_id ? ' · de un gasto' : s.plan_id ? ' · cuota de un plan' : ''}
                          </span>
                        </button>
                        {/* `ml-auto` en el bloque entero, no en el monto
                            suelto: si el menú de opciones queda afuera de
                            este `span`, al envolver la fila cae solo a su
                            propia línea sin `ml-auto` y se ve pegado a la
                            izquierda en vez de al extremo derecho. */}
                        <span className="ml-auto shrink-0 flex items-center gap-1.5">
                          {/* El ícono de la moneda de la deuda: una deuda en
                              Bs y una en dólares se distinguen sin leer el
                              monto. */}
                          <CurrencyIcon currency={s.currency} size={18} />
                          <span className="fz-num text-[13px] font-semibold">
                            {hidden ? HIDDEN : formatAmount(s.amount, s.currency)}
                          </span>
                          <RowMenu
                            items={[
                              { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: () => setEditando(s) },
                              // Solo tiene sentido sobre una deuda suelta que
                              // todavía no es cuota de nada: no viene de un
                              // gasto compartido (§ ese caso queda fuera de
                              // alcance del sprint) y no es ya parte de un plan.
                              ...(!s.transaction_id && !s.plan_id ? [{
                                label: 'Planificar en cuotas',
                                icon: <IconListNumbers size={16} stroke={1.8} />,
                                onClick: () => setPlanificandoDebt(s),
                              }] : []),
                              {
                                label: 'Perdonar',
                                icon: <IconCoinOff size={16} stroke={1.8} />,
                                onClick: () => post('waive', { split_ids: [s.id] }, s.id),
                                disabled: busy === s.id,
                              },
                              { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: () => setEliminando(s), danger: true },
                            ]}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>

        {shared.historial.length > 0 && (
          <Panel>
            <button
              type="button"
              onClick={() => setVerHistorial(v => !v)}
              aria-expanded={verHistorial}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className="text-[19px] font-bold tracking-[-0.01em]">
                Historial <span className="text-[var(--fz-ink-3)] font-semibold">({shared.historial.length})</span>
              </span>
              <IconChevronDown
                size={20} stroke={2}
                className={`text-[var(--fz-ink-3)] transition-transform ${verHistorial ? 'rotate-180' : ''}`}
              />
            </button>

            {verHistorial && (
              <div className="mt-3 flex flex-col divide-y divide-[var(--fz-hairline)]">
                {shared.historial.map(s => (
                  <HistoryRow
                    key={s.id}
                    split={s}
                    hidden={hidden}
                    hoy={hoy}
                    busy={busy === s.id}
                    onUndo={() =>
                      post('unsettle', { split_ids: [s.id], delete_transaction: s.state === 'cobrado' }, s.id)
                    }
                  />
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      {(creando || editando) && (
        <DebtSheet
          editing={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onSaved={() => { setCreando(false); setEditando(null) }}
        />
      )}

      <DetailSheet
        open={!!viendo}
        onClose={() => setViendo(null)}
        title="Deuda"
        onEdit={() => { const s = viendo!; setViendo(null); setEditando(s) }}
        onDelete={() => { const s = viendo!; setViendo(null); setEliminando(s) }}
      >
        {viendo && (
          <>
            <DeletePreview
              icon={<PersonAvatar name={viendo.person.name} size={40} />}
              title={viendo.person.name}
              subtitle={debtLabel(viendo)}
              amount={hidden ? HIDDEN : formatAmount(viendo.amount, viendo.currency)}
            />
            <div>
              <DetailField label="Desde" value={formatDayLabel(viendo.incurred_on, hoy)} />
              <DetailField
                label="Origen"
                value={viendo.transaction_id ? 'De un gasto' : viendo.plan_id ? 'Cuota de un plan' : 'Suelta'}
              />
              <DetailField
                label="Estado"
                value={viendo.state === 'cobrado' ? 'Cobrada' : viendo.state === 'perdonado' ? 'Perdonada' : 'Pendiente'}
              />
            </div>
          </>
        )}
      </DetailSheet>

      {(planificandoDebt || regenerandoPlan) && (
        <PlanSheet
          plan={regenerandoPlan}
          debt={planificandoDebt}
          onClose={() => { setPlanificandoDebt(null); setRegenerandoPlan(null) }}
          onSaved={() => { setPlanificandoDebt(null); setRegenerandoPlan(null) }}
        />
      )}

      {cobrando && (
        <SettleSheet
          debt={cobrando}
          onClose={() => setCobrando(null)}
          onDone={async () => { setCobrando(null); await reload() }}
        />
      )}

      {cobrandoCuota && (
        <SettleSheet
          debt={{
            person: cobrandoCuota.plan.person,
            open_usd: cobrandoCuota.cuota.amount_usd,
            oldest_days: null,
            debts: [cobrandoCuota.cuota],
          }}
          onClose={() => setCobrandoCuota(null)}
          onDone={async () => { setCobrandoCuota(null); await reload() }}
        />
      )}

      <DeleteConfirmSheet
        open={!!eliminandoPlan}
        onClose={() => { setEliminandoPlan(null); setDeletePlanError('') }}
        onConfirm={confirmDeletePlan}
        title="Eliminar plan"
        confirming={confirmingDeletePlan}
        error={deletePlanError}
      >
        {eliminandoPlan && (
          <DeletePreview
            icon={<PersonAvatar name={eliminandoPlan.person.name} size={40} />}
            title={eliminandoPlan.person.name}
            subtitle={eliminandoPlan.concept}
            amount={formatUSD(eliminandoPlan.pendiente_usd)}
          />
        )}
      </DeleteConfirmSheet>

      <DeleteConfirmSheet
        open={!!eliminando}
        onClose={() => { setEliminando(null); setDeleteError('') }}
        onConfirm={confirmDeleteDebt}
        title="Eliminar deuda"
        confirming={confirmingDelete}
        error={deleteError}
      >
        {eliminando && (
          <DeletePreview
            icon={<PersonAvatar name={eliminando.person.name} size={40} />}
            title={eliminando.person.name}
            subtitle={debtLabel(eliminando)}
            amount={formatAmount(eliminando.amount, eliminando.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

/**
 * Una deuda con plan de pago, en el mismo lugar que cualquier otra deuda —
 * no en un panel aparte — pero con su propio formato: colapsa/expande en vez
 * de listar sus cuotas de una. El (⋮) de la fila del plan es sobre el plan
 * entero (Regenerar, Eliminar); cada cuota tiene el suyo (Editar, Perdonar),
 * más "Cobrar" cuando sigue pendiente.
 */
function PlanRow({
  plan, hidden, expanded, busy, onToggle, onRegenerate, onDelete,
  onCobrarCuota, onEditarCuota, onPerdonarCuota,
}: {
  plan: DebtPlanWithCuotas
  hidden: boolean
  expanded: boolean
  busy: string
  onToggle: () => void
  onRegenerate: () => void
  onDelete: () => void
  onCobrarCuota: (cuota: DebtWithContext) => void
  onEditarCuota: (cuota: DebtWithContext) => void
  onPerdonarCuota: (cuota: DebtWithContext) => void
}) {
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          <PersonAvatar name={plan.person.name} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold truncate">
              {plan.person.name} · {plan.concept}
            </p>
            <p className="text-[12px] text-[var(--fz-ink-3)]">
              {plan.cerrado
                ? 'Cerrado'
                : `${plan.cuotas.filter(c => c.state === 'pendiente').length} cuota(s) pendiente(s)`}
            </p>
          </div>
          <span className="fz-num text-[16px] font-bold shrink-0">
            {hidden ? HIDDEN : formatUSD(plan.cerrado ? plan.total_usd : plan.pendiente_usd)}
          </span>
          <IconChevronDown
            size={18} stroke={2}
            className={`text-[var(--fz-ink-3)] transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        <RowMenu
          items={[
            { label: 'Regenerar', icon: <IconRefresh size={16} stroke={1.8} />, onClick: onRegenerate },
            { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: onDelete, danger: true },
          ]}
        />
      </div>

      {expanded && (
        <div className="mt-2 ml-[52px] flex flex-col divide-y divide-[var(--fz-hairline)]">
          {plan.cuotas.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
              <span className="flex-1 min-w-[50%]">
                <span className="block text-[13px] font-medium">
                  {/* "N de las que hay hoy", no `plan_installment_no`/`plan.installments`:
                      después de regenerar esos dos números quedan con huecos (cobradas
                      viejas + tandas nuevas) y la fracción deja de tener sentido. La
                      posición en la lista ya ordenada siempre es verdad. */}
                  Cuota {i + 1}/{plan.cuotas.length} · {formatDayLabel(c.incurred_on, todayISO())}
                </span>
                <span
                  className={`block text-[12px] ${
                    c.state === 'cobrado' ? 'text-[var(--fz-in-text)] font-semibold' : 'text-[var(--fz-ink-3)]'
                  }`}
                >
                  {c.state === 'cobrado' ? 'Cobrada' : c.state === 'perdonado' ? 'Perdonada' : 'Pendiente'}
                </span>
              </span>
              <span className="ml-auto shrink-0 flex items-center gap-1.5">
                {/* Una cuota cobrada no tiene botón ni menú, así que su fila
                    quedaba visualmente idéntica a una pendiente salvo por una
                    palabra chica. El check la hace reconocible de un vistazo,
                    que es lo que se busca al recorrer un plan de 10 cuotas. */}
                {c.state === 'cobrado' && (
                  <IconCircleCheckFilled
                    size={18}
                    className="text-[var(--fz-in-text)]"
                    aria-label="Cobrada"
                  />
                )}
                <span className="fz-num text-[13px] font-semibold">
                  {hidden ? HIDDEN : formatAmount(c.amount, c.currency)}
                </span>
                {c.state === 'pendiente' && (
                  <>
                    <Btn size="sm" onClick={() => onCobrarCuota(c)}>Cobrar</Btn>
                    <RowMenu
                      items={[
                        { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: () => onEditarCuota(c) },
                        {
                          label: 'Perdonar',
                          icon: <IconCoinOff size={16} stroke={1.8} />,
                          onClick: () => onPerdonarCuota(c),
                          disabled: busy === c.id,
                        },
                      ]}
                    />
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function HistoryRow({ split, hidden, hoy, busy, onUndo }: {
  split: DebtWithContext; hidden: boolean; hoy: string; busy: boolean; onUndo: () => void
}) {
  const cobrado = split.state === 'cobrado'
  return (
    <div className="flex items-center gap-3 py-2.5">
      <IconChip tint={cobrado ? 'in' : 'neutral'}>
        {cobrado ? <IconReceiptRefund size={18} stroke={1.8} /> : <IconCoinOff size={18} stroke={1.8} />}
      </IconChip>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold truncate">
          {split.person.name} · {debtLabel(split)}
        </span>
        <span className="block text-[12px] text-[var(--fz-ink-3)] truncate">
          {cobrado ? 'Cobrado' : 'Perdonada'}
          {split.waived_at ? ` · ${formatDayLabel(split.waived_at, hoy)}` : ''}
          {/* La nota explica POR QUÉ se condonó. Se guardaba y no se mostraba
              en ninguna pantalla: era un dato de solo escritura. */}
          {!cobrado && split.note ? ` · ${split.note}` : ''}
        </span>
      </span>
      <span className="fz-num text-[14px] font-semibold shrink-0">
        {hidden ? HIDDEN : formatAmount(split.amount, split.currency)}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        title={cobrado ? 'Deshacer el cobro y borrar el movimiento' : 'Volver a marcarla como pendiente'}
        aria-label="Deshacer"
        className="shrink-0 grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] disabled:opacity-40"
      >
        {/* Flecha de deshacer, no una circular: `IconRotateClockwise` se leía
            como "refrescar" — y en esta misma pantalla `IconRefresh` ya
            significa "Regenerar" un plan, así que dos flechas circulares casi
            idénticas querían decir cosas distintas. */}
        <IconArrowBackUp size={17} stroke={1.8} />
      </button>
    </div>
  )
}

function Tile({ label, value, tone, hidden, loading }: {
  label: string; value: number; tone: 'in' | 'out'; hidden: boolean; loading?: boolean
}) {
  return (
    <div className="min-w-0 rounded-[var(--fz-r-tile)] p-4" style={{ background: `var(--fz-${tone}-tint)` }}>
      <p className="text-[13px] font-medium text-[var(--fz-ink-2)] truncate">{label}</p>
      {/* Un $0 acá se lee como "no te deben nada", que es una respuesta, no una espera. */}
      {loading ? (
        <Skeleton w="70%" h={24} className="mt-1.5" />
      ) : (
        <p
          className="text-[21px] min-[400px]:text-[26px] font-bold tracking-[-0.01em] fz-num truncate"
          style={{ color: `var(--fz-${tone}-text)` }}
        >
          {hidden ? HIDDEN : formatUSD(value)}
        </p>
      )}
    </div>
  )
}
