'use client'

import { useState } from 'react'
import { IconArchive, IconChevronDown, IconChevronUp, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, Currency } from '@/lib/finanzas/types'
import { CURRENCIES, CURRENCY_META } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, formatUSD, HIDDEN, parseDecimalInput } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CurrencyIcon } from '../components/currency-icon'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, Label, Panel, SectionTitle, TextField } from '../components/ui'

interface Draft {
  id?: string
  name: string
  currency: Currency
  initial_balance: string
  initial_balance_date: string
}

const emptyDraft = (): Draft => ({
  name: '',
  currency: 'USD',
  initial_balance: '',
  initial_balance_date: new Date().toISOString().slice(0, 10),
})

export default function CuentasPage() {
  const { accounts, totalUsd, hidden, reload } = useFinanzas()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const visible = accounts.filter(a => !a.archived)
  const archived = accounts.filter(a => a.archived)

  async function save() {
    if (!draft) return
    setError('')
    if (!draft.name.trim()) return setError('La cuenta necesita un nombre')

    const payload = {
      name: draft.name.trim(),
      currency: draft.currency,
      initial_balance: draft.initial_balance === '' ? 0 : amountFromInput(draft.initial_balance, { allowNegative: true, decimals: decimalsFor(draft.currency) }),
      initial_balance_date: draft.initial_balance_date,
    }

    setBusy(true)
    const res = await fetch(
      draft.id ? `/api/finanzas/accounts/${draft.id}` : '/api/finanzas/accounts',
      {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    setBusy(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }
    await reload()
    setDraft(null)
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo actualizar')
    }
    await reload()
  }

  /**
   * Mueve una cuenta un lugar arriba o abajo y persiste el orden completo.
   * Se manda la lista entera porque todas nacen con sort_order = 0: mover de a
   * pares no alcanzaría para desempatarlas.
   */
  async function move(id: string, delta: -1 | 1) {
    setError('')
    const orden = visible.map(a => a.id)
    const i = orden.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= orden.length) return

    ;[orden[i], orden[j]] = [orden[j], orden[i]]

    const res = await fetch('/api/finanzas/accounts/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orden }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo reordenar')
    }
    await reload()
  }

  async function remove(id: string) {
    setError('')
    const res = await fetch(`/api/finanzas/accounts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Cuentas"
        subtitle="Dónde está tu plata"
        action={
          <>
            <HideToggle />
            <Btn size="sm" onClick={() => { setDraft(emptyDraft()); setError('') }}>
              <IconPlus size={18} stroke={2} /> Nueva
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--fz-r-card)] bg-[var(--fz-hero)] p-6 text-white">
          <p className="text-[13px] font-medium text-white/60">Patrimonio total</p>
          <p className="mt-1 text-[34px] font-bold tracking-[-0.02em] leading-none fz-num">
            {hidden ? HIDDEN : formatUSD(totalUsd)}
          </p>
        </div>

        <ErrorNote>{error}</ErrorNote>

        {draft && (
          <Panel>
            <SectionTitle
              action={
                <button type="button" onClick={() => setDraft(null)} aria-label="Cancelar"
                  className="grid place-items-center w-8 h-8 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]">
                  <IconX size={16} stroke={1.8} />
                </button>
              }
            >
              {draft.id ? 'Editar cuenta' : 'Nueva cuenta'}
            </SectionTitle>

            <div className="grid gap-3 min-[900px]:grid-cols-2">
              <div className="min-[900px]:col-span-2">
                <Label>Nombre</Label>
                <TextField
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Airtm, Efectivo, Banco…"
                  autoFocus
                />
              </div>
              <div className="min-[900px]:col-span-2">
                <Label>Moneda</Label>
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {CURRENCIES.map(c => {
                    const selected = draft.currency === c
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft({ ...draft, currency: c })}
                        aria-pressed={selected}
                        className={`shrink-0 flex items-center gap-2 h-12 pl-2 pr-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold transition-colors ${
                          selected
                            ? 'bg-[var(--fz-accent)] text-white'
                            : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                        }`}
                      >
                        <CurrencyIcon currency={c} size={28} />
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <Label>Saldo inicial</Label>
                <TextField
                  value={draft.initial_balance}
                  onChange={e => setDraft({ ...draft, initial_balance: parseDecimalInput(e.target.value, { allowNegative: true, decimals: decimalsFor(draft.currency) }) })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="fz-num"
                />
              </div>
              <div className="min-[900px]:col-span-2">
                <Label>Fecha del saldo inicial</Label>
                <TextField
                  type="date"
                  value={draft.initial_balance_date}
                  onChange={e => setDraft({ ...draft, initial_balance_date: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4">
              <Btn onClick={save} disabled={busy} full>
                {busy ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear cuenta'}
              </Btn>
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle>Activas</SectionTitle>
          {visible.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay cuentas. Creá la primera para empezar a registrar.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
              {visible.map((a, i) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  hidden={hidden}
                  isFirst={i === 0}
                  isLast={i === visible.length - 1}
                  onMoveUp={() => move(a.id, -1)}
                  onMoveDown={() => move(a.id, 1)}
                  onEdit={() => {
                    setError('')
                    setDraft({
                      id: a.id,
                      name: a.name,
                      currency: a.currency,
                      initial_balance: String(a.initial_balance),
                      initial_balance_date: a.initial_balance_date,
                    })
                  }}
                  onArchive={() => patch(a.id, { archived: true })}
                  onDelete={() => remove(a.id)}
                />
              ))}
            </div>
          )}
        </Panel>

        {archived.length > 0 && (
          <Panel>
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              className="w-full flex items-center justify-between text-[15px] font-semibold"
            >
              Archivadas ({archived.length})
              <span className="text-[13px] font-medium text-[var(--fz-accent)]">
                {showArchived ? 'Ocultar' : 'Ver'}
              </span>
            </button>
            {showArchived && (
              <div className="flex flex-col divide-y divide-[var(--fz-hairline)] mt-3">
                {archived.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-3">
                    <CurrencyIcon currency={a.currency} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold truncate text-[var(--fz-ink-2)]">{a.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {hidden ? HIDDEN : formatAmount(a.balance, a.currency)}
                      </p>
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => patch(a.id, { archived: false })}>
                      Restaurar
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}

function AccountRow({ account, hidden, isFirst, isLast, onMoveUp, onMoveDown, onEdit, onArchive, onDelete }: {
  account: AccountWithBalance
  hidden: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 min-[900px]:gap-3 py-3">
      {/* Flechas y no arrastrar: el drag-and-drop táctil sin librería es
          frágil, y estos botones funcionan igual con teclado y lector. */}
      <div className="flex flex-col shrink-0">
        <IconBtn label="Subir" onClick={onMoveUp} disabled={isFirst} small>
          <IconChevronUp size={15} stroke={2.2} />
        </IconBtn>
        <IconBtn label="Bajar" onClick={onMoveDown} disabled={isLast} small>
          <IconChevronDown size={15} stroke={2.2} />
        </IconBtn>
      </div>
      <CurrencyIcon currency={account.currency} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold truncate">{account.name}</p>
        <p className="text-[12px] text-[var(--fz-ink-3)]">
          {CURRENCY_META[account.currency].name} · inicial {hidden ? HIDDEN : formatAmount(account.initial_balance, account.currency)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-[15px] font-semibold fz-num">
          {hidden ? HIDDEN : formatAmount(account.balance, account.currency)}
        </p>
        {account.currency !== 'USD' && (
          <p className="text-[12px] text-[var(--fz-ink-3)] fz-num">
            {hidden ? '' : `≈ ${formatUSD(account.balance_usd)}`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <IconBtn label="Editar" onClick={onEdit}><IconPencil size={17} stroke={1.8} /></IconBtn>
        <IconBtn label="Archivar" onClick={onArchive}><IconArchive size={17} stroke={1.8} /></IconBtn>
        <IconBtn label="Borrar" onClick={onDelete} danger><IconTrash size={17} stroke={1.8} /></IconBtn>
      </div>
    </div>
  )
}

function IconBtn({ children, label, onClick, danger, disabled, small }: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full transition-colors disabled:opacity-25 disabled:pointer-events-none ${
        small ? 'w-6 h-6 min-[900px]:w-7' : 'w-8 h-8 min-[900px]:w-9 min-[900px]:h-9'
      } ${
        danger
          ? 'text-[var(--fz-ink-3)] hover:bg-[var(--fz-out-tint)] hover:text-[var(--fz-out-text)]'
          : 'text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
