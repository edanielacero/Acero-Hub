'use client'

import { useMemo, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus, IconRepeat, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import type { RecurringWithState } from '@/lib/finanzas/types'
import { formatAmount, formatBOB, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { monthlyTotalUsd } from '@/lib/finanzas/recurring'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CategoryIcon } from '../components/category-icon'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { RecurringSheet } from '../components/recurring-sheet'
import { RegisterSheet } from '../components/register-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, Panel, RowMenu, SectionTitle } from '../components/ui'

export function FijosScreen() {
  const { recurring, rates, hidden, loading, reload } = useFinanzas()
  const [viendo, setViendo] = useState<RecurringWithState | null>(null)
  const [editando, setEditando] = useState<RecurringWithState | null>(null)
  const [creando, setCreando] = useState(false)
  const [registrando, setRegistrando] = useState<RecurringWithState | null>(null)
  const [eliminando, setEliminando] = useState<RecurringWithState | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState('')

  const hoy = useMemo(() => todayISO(), [])
  const items = recurring.recurring
  const hay = items.length > 0

  const totalMesUsd = useMemo(() => monthlyTotalUsd(items, rates), [items, rates])
  const totalMesBob = useMemo(() => fromUsd(totalMesUsd, 'BOB', rates), [totalMesUsd, rates])

  async function togglePause(r: RecurringWithState) {
    setBusy(r.id)
    await fetch(`/api/finanzas/recurring/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !r.active }),
    })
    await reload()
    setBusy('')
  }

  async function remove(id: string) {
    await fetch(`/api/finanzas/recurring/${id}`, { method: 'DELETE' })
    await reload()
  }

  async function confirmDeleteRecurring() {
    if (!eliminando) return
    setConfirmingDelete(true)
    await remove(eliminando.id)
    setConfirmingDelete(false)
    setEliminando(null)
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Gastos Fijos"
        subtitle="Lo que pagas todos los meses"
        action={
          <>
            <HideToggle />
            <Btn size="sm" onClick={() => setCreando(true)}>
              <IconPlus size={18} stroke={2} /> Nuevo
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {hay && (
          <Panel>
            <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">Gasto fijo de este mes</p>
            <p className="mt-1 text-[34px] min-[400px]:text-[40px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
              {hidden ? HIDDEN : formatUSD(totalMesUsd)}
            </p>
            <p className="mt-1.5 text-[13px] text-[var(--fz-ink-3)] fz-num">
              {hidden ? HIDDEN : formatBOB(totalMesBob)}
            </p>

            <div className="mt-4 pt-4 border-t border-[var(--fz-hairline)] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">Este período</p>
                <p className="text-[20px] font-bold tracking-[-0.01em] fz-num">
                  {recurring.done} de {recurring.total}
                  <span className="text-[13px] font-semibold text-[var(--fz-ink-3)]"> registrados</span>
                </p>
              </div>
              {recurring.pending > 0 && (
                <span
                  className="shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded-[var(--fz-r-pill)]"
                  style={{ background: 'var(--fz-out-tint)', color: 'var(--fz-out-text)' }}
                >
                  {recurring.pending} {recurring.pending === 1 ? 'pendiente' : 'pendientes'}
                </span>
              )}
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle>Tus fijos</SectionTitle>

          {loading && !hay ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p>
          ) : !hay ? (
            <EmptyState
              icon={IconRepeat}
              title="Todavía no cargaste ningún fijo"
              description="Spotify, el alquiler, TradingView. Los cargas una vez y después es un toque por mes — y la app te dice cuáles te faltan."
              action={<Btn onClick={() => setCreando(true)}>Crear el primero</Btn>}
            />
          ) : (
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
              {items.map(r => (
                <Row
                  key={r.id}
                  r={r}
                  hidden={hidden}
                  hoy={hoy}
                  busy={busy === r.id}
                  onView={() => setViendo(r)}
                  onRegister={() => setRegistrando(r)}
                  onEdit={() => setEditando(r)}
                  onTogglePause={() => togglePause(r)}
                  onDelete={() => setEliminando(r)}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {(creando || editando) && (
        <RecurringSheet
          editing={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onSaved={() => { setCreando(false); setEditando(null) }}
        />
      )}

      {registrando && (
        <RegisterSheet
          recurring={registrando}
          onClose={() => setRegistrando(null)}
          onDone={() => setRegistrando(null)}
        />
      )}

      <DetailSheet
        open={!!viendo}
        onClose={() => setViendo(null)}
        title="Fijo"
        onEdit={() => { const r = viendo!; setViendo(null); setEditando(r) }}
        onDelete={() => { const r = viendo!; setViendo(null); setEliminando(r) }}
      >
        {viendo && (
          <>
            <DeletePreview
              icon={<CategoryIcon slug={viendo.icon} name={viendo.name} size={40} />}
              title={viendo.name}
              subtitle={viendo.frequency === 'anual' ? 'Cada año' : 'Cada mes'}
              amount={hidden ? HIDDEN : formatAmount(viendo.amount, viendo.currency)}
            />
            <div>
              <DetailField
                label={viendo.status === 'programado' ? 'Arranca' : 'Vence'}
                value={formatDayLabel(viendo.due, hoy)}
              />
              <DetailField
                label="Estado"
                value={
                  !viendo.active ? 'Pausado'
                    : viendo.status === 'registrado' ? 'Listo este período'
                    : viendo.status === 'programado' ? 'Programado'
                    : viendo.status === 'vencido' ? `Vencido hace ${viendo.days_late} días`
                    : 'Pendiente'
                }
              />
              {viendo.pending.length > 1 && (
                <DetailField label="Meses sin registrar" value={viendo.pending.length} />
              )}
              {viendo.splits.length > 0 && (
                <DetailField
                  label="Compartido con"
                  value={`${viendo.splits.length} ${viendo.splits.length === 1 ? 'persona' : 'personas'}`}
                />
              )}
              {viendo.open_usd > 0 && (
                <DetailField label="Te deben" value={hidden ? HIDDEN : formatUSD(viendo.open_usd)} />
              )}
            </div>
          </>
        )}
      </DetailSheet>

      <DeleteConfirmSheet
        open={!!eliminando}
        onClose={() => setEliminando(null)}
        onConfirm={confirmDeleteRecurring}
        title="Eliminar fijo"
        confirming={confirmingDelete}
      >
        {eliminando && (
          <DeletePreview
            icon={<CategoryIcon slug={eliminando.icon} name={eliminando.name} size={40} />}
            title={eliminando.name}
            subtitle={eliminando.frequency === 'anual' ? 'Cada año' : 'Cada mes'}
            amount={formatAmount(eliminando.amount, eliminando.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

function Row({ r, hidden, hoy, busy, onView, onRegister, onEdit, onTogglePause, onDelete }: {
  r: RecurringWithState
  hidden: boolean
  hoy: string
  busy: boolean
  onView: () => void
  onRegister: () => void
  onEdit: () => void
  onTogglePause: () => void
  onDelete: () => void
}) {
  const compartido = r.splits.length > 0
  const vencido = r.status === 'vencido'

  return (
    /*
      `flex-wrap` con el bloque de acciones en `ml-auto`: en desktop entra todo
      en una línea, y en móvil las acciones bajan solas en vez de estrujar el
      nombre. Sin esto, a 390px "Spotify" se cortaba en "Spoti…" y el monto
      quedaba en "Bs 2.100,00 · …" — la fila decía menos cuanto más chica era
      la pantalla, que es justo al revés de lo que hace falta.
    */
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${r.active ? '' : 'opacity-50'}`}>
      <CategoryIcon slug={r.icon} name={r.name} />

      <button type="button" onClick={onView} className="flex-1 min-w-[55%] text-left">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-semibold truncate">{r.name}</span>
          {compartido && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)] text-[11px] font-bold"
              title={`Compartido con ${r.splits.length} ${r.splits.length === 1 ? 'persona' : 'personas'}`}
            >
              <IconUsersGroup size={11} stroke={2.2} />
              {r.splits.length}
            </span>
          )}
        </span>
        <span className="block text-[12px] text-[var(--fz-ink-3)] truncate">
          {hidden ? HIDDEN : formatAmount(r.amount, r.currency)}
          {' · '}
          {r.frequency === 'anual' ? 'cada año' : 'cada mes'}
          {' · '}
          {r.status === 'programado' ? `arranca ${formatDayLabel(r.due, hoy)}` : formatDayLabel(r.due, hoy)}
          {/* Un fijo cargado tarde tiene varios meses que recuperar. Se
              registran de a uno, del más viejo al más nuevo. */}
          {r.pending.length > 1 && ` · ${r.pending.length} meses sin registrar`}
          {r.open_usd > 0 && !hidden && ` · te deben ${formatUSD(r.open_usd)}`}
        </span>
      </button>

      <span className="ml-auto shrink-0 flex items-center gap-1.5">
        {!r.active ? (
          <span className="text-[12px] font-medium text-[var(--fz-ink-3)]">Pausado</span>
        ) : r.status === 'programado' ? (
          <span className="text-[12px] font-medium text-[var(--fz-ink-3)]">Programado</span>
        ) : r.status === 'registrado' ? (
          <span
            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-[var(--fz-r-pill)]"
            style={{ background: 'var(--fz-in-tint)', color: 'var(--fz-in-text)' }}
          >
            <IconCheck size={13} stroke={2.6} /> Listo
          </span>
        ) : (
          <>
            {vencido && (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: 'var(--fz-out-text)' }}
                title={`Vencía hace ${r.days_late} días`}
              >
                <IconAlertTriangle size={13} stroke={2.2} />
                {r.days_late}d
              </span>
            )}
            <Btn size="sm" onClick={onRegister}>Registrar</Btn>
          </>
        )}

        <RowMenu
          items={[
            { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
            {
              label: r.active ? 'Pausar' : 'Reanudar',
              icon: r.active ? <IconPlayerPause size={16} stroke={1.8} /> : <IconPlayerPlay size={16} stroke={1.8} />,
              onClick: onTogglePause,
              disabled: busy,
            },
            { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: onDelete, danger: true },
          ]}
        />
      </span>
    </div>
  )
}
