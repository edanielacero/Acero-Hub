'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconPlus, IconPencil, IconArrowBackUp, IconTrash } from '@tabler/icons-react'
import { api, apiCached } from '@/lib/finanzas/api-client'
import {
  ACCOUNT_TYPE_LABELS, isLiquid, getAccountBalance, latestValuationByAccount,
  type Account, type AccountType, type Currency, type AssetValuation,
} from '@/lib/finanzas/accounts'
import { formatMoney, toUsd } from '@/lib/finanzas/currency'
import { latestRateByPair, type ExchangeRate } from '@/lib/finanzas/exchange-rates'
import { accountTransactionDelta, type Transaction } from '@/lib/finanzas/transactions'
import { Amount } from '@/app/finanzas/components/amount-visibility'

const ACCOUNT_TYPES: AccountType[] = ['efectivo', 'cuenta_bancaria', 'ahorro', 'inversion', 'cripto', 'trading', 'otro']

interface AccountFormState {
  name: string
  type: AccountType
  currency: Currency
  initial_balance: string
  initial_balance_date: string
}

function emptyForm(): AccountFormState {
  return { name: '', type: 'efectivo', currency: 'USD', initial_balance: '', initial_balance_date: new Date().toISOString().slice(0, 10) }
}

export default function CuentasPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [valuations, setValuations] = useState<AssetValuation[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AccountFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [valuationFor, setValuationFor] = useState<Account | null>(null)
  const [valuationInput, setValuationInput] = useState('')

  async function load() {
    setLoading(true)
    // accounts/valuations los edita esta página — siempre frescos. rates y
    // transactions son solo para calcular saldos acá, así que se cachean.
    const [accRes, rateJson, txJson] = await Promise.all([
      api('/accounts'),
      apiCached<{ rates: ExchangeRate[] }>('/exchange-rates'),
      apiCached<{ transactions: Transaction[] }>('/transactions'),
    ])
    const accJson = await accRes.json()
    const accs: Account[] = accJson.accounts ?? []
    setAccounts(accs)
    setRates(rateJson.rates ?? [])
    setTransactions(txJson.transactions ?? [])
    const illiquid = accs.filter(a => !isLiquid(a.type))
    const valLists = await Promise.all(illiquid.map(a => api(`/accounts/${a.id}/valuations`).then(r => r.json())))
    setValuations(valLists.flatMap(v => v.valuations ?? []))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const latestValuations = useMemo(() => latestValuationByAccount(valuations), [valuations])
  const latestRates = useMemo(() => latestRateByPair(rates), [rates])
  const bobPerUsd = latestRates.get('USD_BOB')?.rate ?? null

  function balanceOf(a: Account) {
    return getAccountBalance(a, latestValuations.get(a.id) ?? null, accountTransactionDelta(a.id, transactions))
  }

  const totalUsd = useMemo(() => {
    return accounts.filter(a => !a.archived).reduce((sum, a) => {
      const { amount, currency } = balanceOf(a)
      if (currency === 'USD') return sum + amount
      return bobPerUsd ? sum + toUsd(amount, currency, bobPerUsd) : sum
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, latestValuations, bobPerUsd, transactions])

  function openCreate() {
    setEditAccount(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(a: Account) {
    setEditAccount(a)
    setForm({
      name: a.name, type: a.type, currency: a.currency,
      initial_balance: String(a.initial_balance), initial_balance_date: a.initial_balance_date,
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      type: form.type,
      currency: form.currency,
      initial_balance: Number(form.initial_balance || 0),
      initial_balance_date: form.initial_balance_date,
    }
    const res = editAccount
      ? await api(`/accounts/${editAccount.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api('/accounts', { method: 'POST', body: JSON.stringify(payload) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Error al guardar'); return }
    setShowForm(false)
    load()
  }

  async function handleArchive(a: Account) {
    await api(`/accounts/${a.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !a.archived }) })
    load()
  }

  async function handleDelete(a: Account) {
    const affected = transactions.filter(t => t.account_id === a.id || t.to_account_id === a.id).length
    const warning = affected > 0 ? ` Esto también borrará ${affected} transacción${affected === 1 ? '' : 'es'} asociada${affected === 1 ? '' : 's'}.` : ''
    if (!confirm(`¿Eliminar la cuenta "${a.name}"?${warning} Esto no se puede deshacer.`)) return
    await api(`/accounts/${a.id}`, { method: 'DELETE' })
    load()
  }

  async function handleAddValuation() {
    if (!valuationFor) return
    const valueUsd = Number(valuationInput)
    if (!Number.isFinite(valueUsd) || valueUsd < 0) return
    await api(`/accounts/${valuationFor.id}/valuations`, { method: 'POST', body: JSON.stringify({ value_usd: valueUsd }) })
    setValuationFor(null)
    setValuationInput('')
    load()
  }

  const activeAccounts = accounts.filter(a => !a.archived)
  const archivedAccounts = accounts.filter(a => a.archived)

  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4 flex items-start justify-between gap-3">
        <h1 className="fz-title">Cuentas</h1>
        <button onClick={openCreate} className="fz-icon-btn mt-1" aria-label="Nueva cuenta">
          <IconPlus size={16} stroke={2} />
        </button>
      </div>

      <div className="px-4 flex flex-col gap-6">
        <div className="fz-hero">
          <p className="text-[13px] font-medium" style={{ color: 'hsl(0 0% 100% / 0.65)' }}>Patrimonio total (estimado)</p>
          <Amount className="fz-tabular text-[32px] font-bold tracking-tight block mt-1">{formatMoney(totalUsd, 'USD')}</Amount>
          {bobPerUsd == null && (
            <p className="text-[12px] mt-1" style={{ color: 'var(--fill-warning)' }}>
              Sin tipo de cambio — las cuentas en Bs no están incluidas
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : accounts.length === 0 ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>Todavía no tenés cuentas cargadas.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              <p className="fz-section-label">Activas</p>
              <div className="fz-card">
                {activeAccounts.map(a => {
                  const valuation = latestValuations.get(a.id) ?? null
                  const { amount, currency } = balanceOf(a)
                  const liquid = isLiquid(a.type)
                  return (
                    <div key={a.id} className="fz-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px]" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
                          <span className="fz-chip">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                        </div>
                        {!liquid && (
                          <button onClick={() => { setValuationFor(a); setValuationInput(valuation ? String(valuation.value_usd) : '') }}
                            className="text-[12px] cursor-pointer" style={{ color: 'var(--text-accent)' }}>
                            {valuation ? `Valuado en ${formatMoney(valuation.value_usd, 'USD')} · actualizar` : 'Sin valuación · agregar'}
                          </button>
                        )}
                      </div>
                      <Amount className="fz-tabular font-semibold text-[14px] shrink-0">{formatMoney(amount, currency)}</Amount>
                      <button onClick={() => openEdit(a)} className="cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }} aria-label="Editar">
                        <IconPencil size={15} stroke={1.8} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {archivedAccounts.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className="fz-section-label">Archivadas</p>
                <div className="fz-card opacity-60">
                  {archivedAccounts.map(a => (
                    <div key={a.id} className="fz-row">
                      <span className="flex-1 text-[14px] truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
                      <button onClick={() => handleArchive(a)} className="cursor-pointer shrink-0" style={{ color: 'var(--text-accent)' }} aria-label="Restaurar">
                        <IconArrowBackUp size={15} stroke={1.8} />
                      </button>
                      <button onClick={() => handleDelete(a)} className="cursor-pointer shrink-0" style={{ color: 'var(--text-danger)' }} aria-label="Eliminar">
                        <IconTrash size={15} stroke={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sheet: cuenta */}
      {showForm && (
        <div className="fz-sheet-overlay" onClick={() => setShowForm(false)}>
          <div className="fz-sheet" onClick={e => e.stopPropagation()}>
            <div className="fz-sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setShowForm(false)} className="fz-btn-text">Cancelar</button>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{editAccount ? 'Editar cuenta' : 'Nueva cuenta'}</span>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="fz-btn-text font-semibold disabled:opacity-40">
                {saving ? '…' : 'Guardar'}
              </button>
            </div>
            {error && <p className="text-[12px] px-4 pb-2" style={{ color: 'var(--text-danger)' }}>{error}</p>}

            <div className="px-4 flex flex-col gap-4 pb-2">
              <div className="fz-card">
                <div className="fz-row">
                  <span className="fz-field-label">Nombre</span>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Airtm Earn" className="fz-field-input" autoFocus />
                </div>
                <div className="fz-row">
                  <span className="fz-field-label">Tipo</span>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))} className="fz-field-select">
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="fz-row">
                  <span className="fz-field-label">Moneda</span>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))} className="fz-field-select">
                    <option value="USD">USD</option>
                    <option value="BOB">Bs</option>
                  </select>
                </div>
                <div className="fz-row">
                  <span className="fz-field-label">Saldo inicial</span>
                  <input type="number" step="0.01" value={form.initial_balance} onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))} placeholder="0" className="fz-field-input fz-tabular" />
                </div>
                <div className="fz-row">
                  <span className="fz-field-label">Fecha del saldo</span>
                  <input type="date" value={form.initial_balance_date} onChange={e => setForm(f => ({ ...f, initial_balance_date: e.target.value }))} className="fz-field-input" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheet: valuación */}
      {valuationFor && (
        <div className="fz-sheet-overlay" onClick={() => setValuationFor(null)}>
          <div className="fz-sheet" onClick={e => e.stopPropagation()}>
            <div className="fz-sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setValuationFor(null)} className="fz-btn-text">Cancelar</button>
              <span className="text-[15px] font-semibold truncate px-2" style={{ color: 'var(--text-primary)' }}>{valuationFor.name}</span>
              <button onClick={handleAddValuation} className="fz-btn-text font-semibold">Guardar</button>
            </div>
            <div className="px-4 pb-2">
              <div className="fz-card">
                <div className="fz-row">
                  <span className="fz-field-label">Valor actual (USD)</span>
                  <input type="number" step="0.01" autoFocus value={valuationInput} onChange={e => setValuationInput(e.target.value)} placeholder="0.00" className="fz-field-input fz-tabular" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
