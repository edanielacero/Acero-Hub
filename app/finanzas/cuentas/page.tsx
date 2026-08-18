'use client'

import { useState } from 'react'
import { IconArchive, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, Currency } from '@/lib/finanzas/types'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, Label, Panel, SectionTitle, SelectField, TextField } from '../components/ui'

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
      initial_balance: Number(draft.initial_balance || 0),
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
              <div>
                <Label>Moneda</Label>
                <SelectField
                  value={draft.currency}
                  onChange={e => setDraft({ ...draft, currency: e.target.value as Currency })}
                >
                  <option value="USD">USD · dólares</option>
                  <option value="BOB">BOB · bolivianos</option>
                </SelectField>
              </div>
              <div>
                <Label>Saldo inicial</Label>
                <TextField
                  value={draft.initial_balance}
                  onChange={e => setDraft({ ...draft, initial_balance: e.target.value.replace(/[^\d.-]/g, '') })}
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
              {visible.map(a => (
                <AccountRow
                  key={a.id}
                  account={a}
                  hidden={hidden}
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
                  <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold truncate text-[var(--fz-ink-2)]">{a.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {a.currency} · {hidden ? HIDDEN : a.balance.toFixed(2)}
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

function AccountRow({ account, hidden, onEdit, onArchive, onDelete }: {
  account: AccountWithBalance
  hidden: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold truncate">{account.name}</p>
        <p className="text-[12px] text-[var(--fz-ink-3)]">
          {account.currency} · inicial {hidden ? HIDDEN : account.initial_balance.toFixed(2)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-[15px] font-semibold fz-num">
          {hidden ? HIDDEN : (account.currency === 'USD' ? formatUSD(account.balance) : `Bs ${account.balance.toFixed(2)}`)}
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

function IconBtn({ children, label, onClick, danger }: {
  children: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center w-9 h-9 rounded-full transition-colors ${
        danger
          ? 'text-[var(--fz-ink-3)] hover:bg-[var(--fz-out-tint)] hover:text-[var(--fz-out-text)]'
          : 'text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
