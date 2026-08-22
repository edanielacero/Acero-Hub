'use client'

import { useMemo, useState } from 'react'
import {
  IconCalendarCheck, IconCheck, IconGift, IconPencil, IconPlus,
  IconRotateClockwise2, IconTrash,
} from '@tabler/icons-react'
import type { PasanakuHistorico, PasanakuWithState } from '@/lib/finanzas/types'
import { formatAmount, formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PasanakuSheet } from '../components/pasanaku-sheet'
import { PasanakuAporteSheet } from '../components/pasanaku-aporte-sheet'
import { PasanakuRecibirSheet } from '../components/pasanaku-recibir-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, IconChip, Panel, RowMenu, SectionTitle } from '../components/ui'

export function PasanakuScreen() {
  const { pasanaku, accounts, hidden, loading, reload } = useFinanzas()
  const [viendo, setViendo] = useState<PasanakuWithState | null>(null)
  const [editando, setEditando] = useState<PasanakuWithState | null>(null)
  const [creando, setCreando] = useState(false)
  const [aportando, setAportando] = useState<PasanakuWithState | null>(null)
  const [recibiendo, setRecibiendo] = useState<PasanakuWithState | null>(null)
  const [borrandoHistorico, setBorrandoHistorico] = useState<PasanakuHistorico | null>(null)
  const [removingHistorico, setRemovingHistorico] = useState(false)

  const hoy = useMemo(() => todayISO(), [])
  const items = pasanaku
  const hay = items.length > 0
  const activos = items.filter(p => !p.archived)

  const totalAportadoUsd = useMemo(
    () => activos.reduce((s, p) => s + p.total_aportado_usd, 0),
    [activos],
  )

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Pasanaku"
        subtitle="Tus aportes y cuándo te toca recibir"
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
        {activos.length > 0 && (
          <Panel>
            <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">Aportado hasta ahora</p>
            <p className="mt-1 text-[34px] min-[400px]:text-[40px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
              {hidden ? HIDDEN : formatUSD(totalAportadoUsd)}
            </p>
          </Panel>
        )}

        <Panel>
          <SectionTitle>Tus pasanaku</SectionTitle>

          {loading && !hay ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p>
          ) : !hay ? (
            <EmptyState
              icon={IconRotateClockwise2}
              title="Todavía no cargaste ningún pasanaku"
              description="Cuánto aportás, cuántos puestos son y cuál es el tuyo. La app calcula sola cuándo te toca recibir."
              action={<Btn onClick={() => setCreando(true)}>Crear el primero</Btn>}
            />
          ) : (
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
              {items.map(p => (
                <Row
                  key={p.id}
                  p={p}
                  accountName={accounts.find(a => a.id === p.account_id)?.name}
                  hidden={hidden}
                  hoy={hoy}
                  onView={() => setViendo(p)}
                  onAportar={() => setAportando(p)}
                  onRecibir={() => setRecibiendo(p)}
                  onEdit={() => setEditando(p)}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {(creando || editando) && (
        <PasanakuSheet
          editing={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onSaved={() => { setCreando(false); setEditando(null) }}
        />
      )}

      {aportando && (
        <PasanakuAporteSheet pasanaku={aportando} onClose={() => setAportando(null)} onDone={() => setAportando(null)} />
      )}

      {recibiendo && (
        <PasanakuRecibirSheet pasanaku={recibiendo} onClose={() => setRecibiendo(null)} onDone={() => setRecibiendo(null)} />
      )}

      <DetailSheet
        open={!!viendo}
        onClose={() => setViendo(null)}
        title="Pasanaku"
        onEdit={() => { const p = viendo!; setViendo(null); setEditando(p) }}
      >
        {viendo && (() => {
          // Releído del array fresco: así borrar un histórico de acá abajo
          // actualiza la lista sin cerrar el sheet.
          const p = pasanaku.find(x => x.id === viendo.id) ?? viendo
          return (
            <>
              <div className="flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5">
                <IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate">{p.name}</p>
                  <p className="text-[12px] text-[var(--fz-ink-3)] truncate">
                    Puesto {p.my_slot} de {p.total_slots}
                  </p>
                </div>
              </div>
              <div>
                <DetailField label="Última cuenta usada" value={accounts.find(a => a.id === p.account_id)?.name} />
                <DetailField
                  label="Aporte por mes"
                  value={hidden ? HIDDEN : formatAmount(p.contribution_amount, p.currency)}
                />
                <DetailField label="Aportes registrados" value={p.aportes_count} />
                <DetailField
                  label={p.received ? 'Recibiste tu turno' : 'Te toca recibir'}
                  value={formatDayLabel(p.received ? p.received_at! : p.expected_turn, hoy)}
                />
              </div>

              {p.historico.length > 0 && (
                <div>
                  <p className="text-[13px] font-semibold text-[var(--fz-ink-2)] mb-2">
                    Aportes de antes de usar la app
                  </p>
                  <div className="flex flex-col divide-y divide-[var(--fz-hairline)] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] px-3.5">
                    {p.historico.map(h => (
                      <div key={h.id} className="flex items-center gap-2 py-2.5">
                        <span className="flex-1 min-w-0 text-[13px] font-medium">
                          {formatDayLabel(h.date, hoy)}
                        </span>
                        <span className="fz-num text-[13px] font-semibold shrink-0">
                          {hidden ? HIDDEN : formatAmount(h.amount, p.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBorrandoHistorico(h)}
                          aria-label="Borrar este registro"
                          className="grid place-items-center w-7 h-7 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface)] hover:text-[var(--fz-out-text)] shrink-0"
                        >
                          <IconTrash size={14} stroke={1.8} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </DetailSheet>

      <DeleteConfirmSheet
        open={!!borrandoHistorico}
        onClose={() => setBorrandoHistorico(null)}
        onConfirm={async () => {
          if (!borrandoHistorico) return
          setRemovingHistorico(true)
          await fetch(`/api/finanzas/pasanaku/historico/${borrandoHistorico.id}`, { method: 'DELETE' })
          await reload()
          setRemovingHistorico(false)
          setBorrandoHistorico(null)
        }}
        title="Borrar registro"
        confirming={removingHistorico}
      >
        {borrandoHistorico && (
          <DeletePreview
            icon={<IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>}
            title={formatDayLabel(borrandoHistorico.date, hoy)}
            subtitle="Aporte de antes de usar la app"
            amount={formatAmount(borrandoHistorico.amount, (pasanaku.find(p => p.id === borrandoHistorico.pasanaku_id) ?? viendo)?.currency ?? 'BOB')}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

function Row({ p, accountName, hidden, hoy, onView, onAportar, onRecibir, onEdit }: {
  p: PasanakuWithState
  accountName?: string
  hidden: boolean
  hoy: string
  onView: () => void
  onAportar: () => void
  onRecibir: () => void
  onEdit: () => void
}) {
  const turnoLlego = !p.received && p.expected_turn <= hoy

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${p.archived ? 'opacity-50' : ''}`}>
      <IconChip tint={p.received ? 'in' : 'neutral'}>
        {p.received ? <IconCheck size={18} stroke={2} /> : <IconRotateClockwise2 size={18} stroke={1.8} />}
      </IconChip>

      <button type="button" onClick={onView} className="flex-1 min-w-[55%] text-left">
        <span className="block text-[15px] font-semibold truncate">{p.name}</span>
        <span className="block text-[12px] text-[var(--fz-ink-3)] truncate">
          Puesto {p.my_slot} de {p.total_slots}
          {accountName && ` · ${accountName}`}
          {' · '}
          {hidden ? HIDDEN : formatAmount(p.contribution_amount, p.currency)}/mes
          {p.aportes_count > 0 && ` · ${p.aportes_count} ${p.aportes_count === 1 ? 'aporte' : 'aportes'}`}
        </span>
      </button>

      <span className="ml-auto shrink-0 flex items-center gap-1.5">
        {p.received ? (
          <span
            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-[var(--fz-r-pill)]"
            style={{ background: 'var(--fz-in-tint)', color: 'var(--fz-in-text)' }}
          >
            <IconCheck size={13} stroke={2.6} /> Recibido
          </span>
        ) : (
          <>
            {turnoLlego && (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold"
                style={{ color: 'var(--fz-out-text)' }}
              >
                <IconCalendarCheck size={13} stroke={2.2} /> Te toca
              </span>
            )}
            <Btn size="sm" onClick={onAportar}>Aporté</Btn>
          </>
        )}

        <RowMenu
          items={[
            ...(!p.received ? [{ label: 'Marcar recibido', icon: <IconGift size={16} stroke={1.8} />, onClick: onRecibir }] : []),
            { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
          ]}
        />
      </span>
    </div>
  )
}
