'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/finanzas/api-client'
import { ACCOUNT_TYPE_LABELS, type Account, type Currency } from '@/lib/finanzas/accounts'
import { buildCategoryTree, type Category } from '@/lib/finanzas/categories'
import { matchCategory, type CategoryRule } from '@/lib/finanzas/auto-categorize'
import {
  TRANSACTION_TYPE_LABELS, requiresToAccount, requiresProfile, type Transaction, type TransactionType,
} from '@/lib/finanzas/transactions'
import { useProfiles } from './profile-context'

const QUICK_TYPES: TransactionType[] = ['gasto', 'ingreso', 'transferencia', 'inversion', 'retiro_inversion', 'ajuste_patrimonio']

interface QuickAddProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  accounts: Account[]
  categories: Category[]
  categoryRules: CategoryRule[]
  editTransaction?: Transaction | null
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function QuickAdd({ open, onClose, onSaved, accounts, categories, categoryRules, editTransaction }: QuickAddProps) {
  const { profiles, activeProfileId } = useProfiles()
  const [type, setType] = useState<TransactionType>('gasto')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [date, setDate] = useState(todayStr())
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [saveRule, setSaveRule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editTransaction) {
      setType(editTransaction.type)
      setAccountId(editTransaction.account_id)
      setToAccountId(editTransaction.to_account_id ?? '')
      setCategoryId(editTransaction.category_id ?? '')
      setProfileId(editTransaction.profile_id ?? activeProfileId ?? '')
      setAmount(String(editTransaction.amount))
      setCurrency(editTransaction.currency)
      setDate(editTransaction.date)
      setDescription(editTransaction.description ?? '')
      setNotes(editTransaction.notes ?? '')
    } else {
      setType('gasto')
      setAccountId(accounts.find(a => !a.archived)?.id ?? '')
      setToAccountId('')
      setCategoryId('')
      setProfileId(activeProfileId ?? '')
      setAmount('')
      setCurrency('USD')
      setDate(todayStr())
      setDescription('')
      setNotes('')
    }
    setSaveRule(false)
    setError(null)
  }, [open, editTransaction, accounts, activeProfileId])

  const needsToAccount = requiresToAccount(type)
  const needsCategory = type === 'gasto' || type === 'ingreso'
  const needsProfile = requiresProfile(type)
  const isAdjustment = type === 'ajuste_patrimonio'

  const categoryTree = useMemo(
    () => buildCategoryTree(categories.filter(c => c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto'))),
    [categories, type],
  )

  function handleAccountChange(id: string) {
    setAccountId(id)
    const acc = accounts.find(a => a.id === id)
    if (acc) setCurrency(acc.currency)
    if (toAccountId === id) setToAccountId('')
  }

  function handleDescriptionBlur() {
    if (categoryId || !needsCategory) return
    const suggested = matchCategory(description, categoryRules)
    if (suggested) setCategoryId(suggested)
  }

  const suggestedForRule = matchCategory(description, categoryRules)
  const showSaveRule = needsCategory && !!categoryId && !!description.trim() && suggestedForRule !== categoryId

  async function handleSave() {
    setError(null)
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || (isAdjustment ? amountNum === 0 : amountNum <= 0)) {
      setError(isAdjustment ? 'El ajuste no puede ser 0' : 'El monto debe ser mayor a 0')
      return
    }
    if (!accountId) { setError('Elegí una cuenta'); return }
    if (needsToAccount && !toAccountId) { setError('Elegí la cuenta destino'); return }
    if (needsProfile && !profileId) { setError('Elegí un perfil'); return }

    setSaving(true)
    const payload = {
      type,
      account_id: accountId,
      to_account_id: needsToAccount ? toAccountId : null,
      category_id: needsCategory ? (categoryId || null) : null,
      profile_id: needsProfile ? profileId : null,
      amount: amountNum,
      currency,
      date,
      description: description.trim() || null,
      notes: notes.trim() || null,
    }
    const res = editTransaction
      ? await api(`/transactions/${editTransaction.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api('/transactions', { method: 'POST', body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { setSaving(false); setError(json.error ?? 'Error al guardar'); return }

    if (showSaveRule && saveRule) {
      await api('/category-rules', { method: 'POST', body: JSON.stringify({ keyword: description.trim(), category_id: categoryId }) })
    }

    setSaving(false)
    onSaved()
  }

  if (!open) return null

  return (
    <div className="fz-sheet-overlay" onClick={onClose}>
      <div className="fz-sheet" onClick={e => e.stopPropagation()}>
        <div className="fz-sheet-handle" />
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onClose} className="fz-btn-text">Cancelar</button>
          <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{editTransaction ? 'Editar' : 'Nueva transacción'}</span>
          <button onClick={handleSave} disabled={saving} className="fz-btn-text font-semibold disabled:opacity-40">
            {saving ? '…' : 'Guardar'}
          </button>
        </div>

        {error && <p className="text-[12px] px-4 pb-2" style={{ color: 'var(--text-danger)' }}>{error}</p>}

        <div className="px-4 pb-1">
          <div className="fz-pill-scroll">
            {QUICK_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)} className={`fz-pill ${type === t ? 'fz-pill-active' : ''}`}>
                {TRANSACTION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-3 flex flex-col gap-4 pb-2">
          <div className="fz-card">
            <div className="fz-row">
              <span className="fz-field-label">Monto</span>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={isAdjustment ? '± 0.00' : '0.00'} className="fz-field-input fz-tabular" autoFocus />
            </div>
            <div className="fz-row">
              <span className="fz-field-label">Moneda</span>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="fz-field-select">
                <option value="USD">USD</option>
                <option value="BOB">Bs</option>
              </select>
            </div>
          </div>

          {needsProfile && (
            <div className="fz-card">
              <div className="fz-row">
                <span className="fz-field-label">Perfil</span>
                <select value={profileId} onChange={e => setProfileId(e.target.value)} className="fz-field-select">
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="fz-card">
            <div className="fz-row">
              <span className="fz-field-label">{needsToAccount ? 'Origen' : 'Cuenta'}</span>
              <select value={accountId} onChange={e => handleAccountChange(e.target.value)} className="fz-field-select">
                <option value="">Elegí…</option>
                {accounts.filter(a => !a.archived).map(a => (
                  <option key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</option>
                ))}
              </select>
            </div>
            {needsToAccount && (
              <div className="fz-row">
                <span className="fz-field-label">Destino</span>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="fz-field-select">
                  <option value="">Elegí…</option>
                  {accounts.filter(a => !a.archived && a.id !== accountId).map(a => (
                    <option key={a.id} value={a.id}>{a.name} · {ACCOUNT_TYPE_LABELS[a.type]}</option>
                  ))}
                </select>
              </div>
            )}
            {needsCategory && (
              <div className="fz-row">
                <span className="fz-field-label">Categoría</span>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="fz-field-select">
                  <option value="">Sin categoría</option>
                  {categoryTree.map(root => (
                    <optgroup key={root.id} label={root.name}>
                      {root.children.length > 0
                        ? root.children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)
                        : <option value={root.id}>{root.name}</option>}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div className="fz-row">
              <span className="fz-field-label">Fecha</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="fz-field-input" />
            </div>
          </div>

          <div className="fz-card">
            <div className="fz-row">
              <span className="fz-field-label shrink-0">Descripción</span>
              <input value={description} onChange={e => setDescription(e.target.value)} onBlur={handleDescriptionBlur}
                placeholder="Netflix, cena…" className="fz-field-input" />
            </div>
            <div className="fz-row">
              <span className="fz-field-label shrink-0">Notas</span>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className="fz-field-input" />
            </div>
          </div>

          {showSaveRule && (
            <label className="flex items-center gap-2.5 px-1 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={saveRule} onChange={e => setSaveRule(e.target.checked)} className="w-[18px] h-[18px] cursor-pointer" />
              Recordar &quot;{description.trim()}&quot; → esta categoría
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
