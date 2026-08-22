'use client'

import { useMemo, useState } from 'react'
import {
  IconCheck, IconChevronDown, IconGift, IconPencil, IconPlus,
  IconRotateClockwise2, IconTrash, IconUsers,
} from '@tabler/icons-react'
import type { PasanakuCobro, PasanakuHistorico, PasanakuWithState } from '@/lib/finanzas/types'
import { formatAmount, HIDDEN } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PasanakuSheet } from '../components/pasanaku-sheet'
import { PasanakuAporteSheet } from '../components/pasanaku-aporte-sheet'
import { PasanakuCobroSheet } from '../components/pasanaku-cobro-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, IconChip, Panel } from '../components/ui'

export function PasanakuScreen() {
  const { pasanaku, accounts, hidden, loading, reload } = useFinanzas()
  const [viendo, setViendo] = useState<PasanakuWithState | null>(null)
  const [editando, setEditando] = useState<PasanakuWithState | null>(null)
  const [creando, setCreando] = useState(false)
  const [aportando, setAportando] = useState<PasanakuWithState | null>(null)
  const [cobrando, setCobrando] = useState<PasanakuWithState | null>(null)
  const [borrandoHistorico, setBorrandoHistorico] = useState<PasanakuHistorico | null>(null)
  const [removingHistorico, setRemovingHistorico] = useState(false)
  const [borrandoCobro, setBorrandoCobro] = useState<PasanakuCobro | null>(null)
  const [removingCobro, setRemovingCobro] = useState(false)

  const hoy = useMemo(() => todayISO(), [])
  const items = pasanaku
  const hay = items.length > 0

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

      {loading && !hay ? (
        <Panel><p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p></Panel>
      ) : !hay ? (
        <Panel>
          <EmptyState
            icon={IconRotateClockwise2}
            title="Todavía no cargaste ningún pasanaku"
            description="Cuánto aportás, cuántos puestos son y cuál es el tuyo. La app calcula sola cuándo te toca recibir."
            action={<Btn onClick={() => setCreando(true)}>Crear el primero</Btn>}
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-3 min-[700px]:grid min-[700px]:grid-cols-2 min-[700px]:items-start">
          {items.map(p => (
            <Card
              key={p.id}
              p={p}
              accountName={accounts.find(a => a.id === p.account_id)?.name}
              hidden={hidden}
              hoy={hoy}
              onView={() => setViendo(p)}
              onEdit={() => setEditando(p)}
              onAportar={() => setAportando(p)}
              onCobrar={() => setCobrando(p)}
              onBorrarCobro={c => setBorrandoCobro(c)}
            />
          ))}
        </div>
      )}

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

      {cobrando && (
        <PasanakuCobroSheet pasanaku={cobrando} onClose={() => setCobrando(null)} onDone={() => setCobrando(null)} />
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

      <DeleteConfirmSheet
        open={!!borrandoCobro}
        onClose={() => setBorrandoCobro(null)}
        onConfirm={async () => {
          if (!borrandoCobro) return
          setRemovingCobro(true)
          await fetch(`/api/finanzas/transactions/${borrandoCobro.id}`, { method: 'DELETE' })
          await reload()
          setRemovingCobro(false)
          setBorrandoCobro(null)
        }}
        title="Borrar cobro"
        confirming={removingCobro}
      >
        {borrandoCobro && (
          <DeletePreview
            icon={<IconChip tint="in"><IconGift size={18} stroke={1.8} /></IconChip>}
            title={formatDayLabel(borrandoCobro.date, hoy)}
            subtitle="Cobro de tu turno"
            amount={formatAmount(borrandoCobro.amount, borrandoCobro.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

function Card({ p, accountName, hidden, hoy, onView, onEdit, onAportar, onCobrar, onBorrarCobro }: {
  p: PasanakuWithState
  accountName?: string
  hidden: boolean
  hoy: string
  onView: () => void
  onEdit: () => void
  onAportar: () => void
  onCobrar: () => void
  onBorrarCobro: (c: PasanakuCobro) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const tuTurnoLlego = p.expected_turn <= hoy
  const pct = p.collection_target > 0 ? Math.min(100, Math.round((p.collected_amount / p.collection_target) * 100)) : 0

  return (
    <Panel className={p.archived ? 'opacity-50' : ''}>
      <div className="flex items-start gap-3">
        <IconChip tint={p.received ? 'in' : 'neutral'}>
          {p.received ? <IconCheck size={18} stroke={2} /> : <IconRotateClockwise2 size={18} stroke={1.8} />}
        </IconChip>
        <button type="button" onClick={onView} className="flex-1 min-w-0 text-left">
          <span className="block text-[16px] font-semibold truncate">{p.name}</span>
          <span className="block text-[12px] text-[var(--fz-ink-3)] truncate">
            Puesto {p.my_slot} de {p.total_slots}{accountName && ` · ${accountName}`}
          </span>
        </button>
        <button
          type="button" onClick={onEdit} aria-label="Editar"
          className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] shrink-0"
        >
          <IconPencil size={16} stroke={1.8} />
        </button>
      </div>

      <div className="mt-3.5">
        <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">Total aportado</p>
        <p className="mt-0.5 text-[28px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
          {hidden ? HIDDEN : formatAmount(p.total_aportado, p.currency)}
        </p>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px]">
        <span className="text-[var(--fz-ink-2)] truncate">
          Próximo aporte {formatDayLabel(p.next_aporte_due, hoy)}
        </span>
        {p.received ? (
          <span
            className="shrink-0 inline-flex items-center gap-1 font-semibold px-2.5 py-1 rounded-[var(--fz-r-pill)]"
            style={{ background: 'var(--fz-in-tint)', color: 'var(--fz-in-text)' }}
          >
            <IconCheck size={13} stroke={2.6} /> Cobraste todo
          </span>
        ) : (
          <span className="shrink-0 font-semibold" style={{ color: tuTurnoLlego ? 'var(--fz-out-text)' : 'var(--fz-ink-2)' }}>
            Te toca {formatDayLabel(p.expected_turn, hoy)}
          </span>
        )}
      </div>

      <Btn onClick={onAportar} full className="mt-3.5">Aportar</Btn>

      {tuTurnoLlego && (
        <div className="mt-3.5 pt-3.5 border-t border-[var(--fz-hairline)]">
          <button
            type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
            className="w-full flex items-center gap-2 text-left"
          >
            <IconUsers size={16} stroke={1.8} className="text-[var(--fz-ink-3)] shrink-0" />
            <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">
              Lista de cobro · {p.cobros.length} de {Math.max(0, p.total_slots - 1)}
            </span>
            <IconChevronDown
              size={16} stroke={2}
              className={`shrink-0 text-[var(--fz-ink-3)] transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          <div className="mt-2 h-1.5 rounded-full bg-[var(--fz-surface-sunk)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: p.received ? 'var(--fz-in-text)' : 'var(--fz-accent)' }}
            />
          </div>

          {expanded && (
            <div className="mt-3 flex flex-col gap-2">
              {p.cobros.length > 0 && (
                <div className="flex flex-col divide-y divide-[var(--fz-hairline)] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] px-3.5">
                  {p.cobros.map(c => (
                    <div key={c.id} className="flex items-center gap-2 py-2.5">
                      <span className="flex-1 min-w-0 text-[13px] font-medium">
                        {formatDayLabel(c.date, hoy)}
                      </span>
                      <span className="fz-num text-[13px] font-semibold shrink-0">
                        {hidden ? HIDDEN : formatAmount(c.amount, c.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onBorrarCobro(c)}
                        aria-label="Borrar este cobro"
                        className="grid place-items-center w-7 h-7 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface)] hover:text-[var(--fz-out-text)] shrink-0"
                      >
                        <IconTrash size={14} stroke={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Btn variant="soft" onClick={onCobrar}>
                <IconPlus size={16} stroke={2} /> Registrar cobro
              </Btn>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
