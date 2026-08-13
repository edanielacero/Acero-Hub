'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconReceipt2, IconTrash } from '@tabler/icons-react'
import { api, apiCached } from '@/lib/finanzas/api-client'
import type { Account } from '@/lib/finanzas/accounts'
import type { Category } from '@/lib/finanzas/categories'
import { TRANSACTION_TYPE_LABELS, transactionDirection, type Transaction, type TransactionType } from '@/lib/finanzas/transactions'
import { formatMoney } from '@/lib/finanzas/currency'
import { useQuickAdd } from '@/app/finanzas/components/quick-add-context'
import { Amount } from '@/app/finanzas/components/amount-visibility'

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!map.has(t.date)) map.set(t.date, [])
    map.get(t.date)!.push(t)
  }
  return [...map.entries()]
}

function formatDateHeading(date: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (date === today) return 'Hoy'
  if (date === yesterday) return 'Ayer'
  return new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function TransaccionesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [filterAccount, setFilterAccount] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('')

  const { openQuickAdd, onTransactionSaved } = useQuickAdd()

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterAccount) params.set('account_id', filterAccount)
    if (filterCategory) params.set('category_id', filterCategory)
    if (filterType) params.set('type', filterType)
    // accounts/categories son solo para mostrar etiquetas y filtros acá — esta
    // página no los edita, así que comparten el cache de /bootstrap con Inicio
    // y QuickAddProvider en vez de pedirlos por su cuenta.
    const [txJson, bootstrap] = await Promise.all([
      api(`/transactions?${params.toString()}`).then(r => r.json()),
      apiCached<{ accounts: Account[]; categories: Category[] }>('/bootstrap'),
    ])
    setTransactions(txJson.transactions ?? [])
    setAccounts(bootstrap.accounts ?? [])
    setCategories(bootstrap.categories ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filterAccount, filterCategory, filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Suscripción estable al guardado global (ej. desde el FAB del tab bar) — usa un
  // ref para siempre invocar la versión más reciente de load() (con los filtros
  // vigentes), sin tener que re-suscribirse cada vez que cambian los filtros.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => onTransactionSaved(() => loadRef.current()), [onTransactionSaved])

  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const groups = useMemo(() => groupByDate(transactions), [transactions])

  function categoryLabel(c: Category): string {
    const parent = c.parent_category_id ? categoryById.get(c.parent_category_id) : null
    return parent ? `${parent.name} > ${c.name}` : c.name
  }

  async function handleDelete(t: Transaction) {
    if (!confirm('¿Eliminar esta transacción? Esto no se puede deshacer.')) return
    await api(`/transactions/${t.id}`, { method: 'DELETE' })
    load()
  }

  const selectPillCls = 'fz-on-light text-[12px] font-medium px-3 py-1.5 rounded-full outline-none cursor-pointer border-none'

  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4">
        <h1 className="fz-title">Movimientos</h1>
      </div>

      <div className="px-4 flex flex-col gap-5">
        <div className="fz-pill-scroll">
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className={selectPillCls} style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '0.5px solid var(--border)' }}>
            <option value="">Todas las cuentas</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={selectPillCls} style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '0.5px solid var(--border)' }}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectPillCls} style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '0.5px solid var(--border)' }}>
            <option value="">Todos los tipos</option>
            {(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map(t => <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : transactions.length === 0 ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>No hay transacciones todavía.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([date, txs]) => (
              <div key={date} className="flex flex-col gap-2.5">
                <p className="fz-section-label capitalize">{formatDateHeading(date)}</p>
                <div className="fz-card">
                  {txs.map(t => {
                    const dir = transactionDirection(t.type)
                    const account = accountById.get(t.account_id)
                    const toAccount = t.to_account_id ? accountById.get(t.to_account_id) : null
                    const category = t.category_id ? categoryById.get(t.category_id) : null
                    const bg = dir === 'credit' ? 'var(--bg-success)' : dir === 'debit' ? 'var(--bg-danger)' : 'var(--bg-accent)'
                    const fg = dir === 'credit' ? 'var(--text-success)' : dir === 'debit' ? 'var(--text-danger)' : 'var(--text-accent)'
                    const sign = dir === 'variable' ? (t.amount >= 0 ? '+' : '') : dir === 'credit' ? '+' : dir === 'debit' ? '-' : ''
                    const amountColor = dir === 'variable' ? (t.amount >= 0 ? 'var(--text-success)' : 'var(--text-danger)') : fg
                    return (
                      <div key={t.id} role="button" tabIndex={0}
                        onClick={() => openQuickAdd(t)}
                        onKeyDown={e => { if (e.key === 'Enter') openQuickAdd(t) }}
                        className="fz-row w-full text-left cursor-pointer">
                        <span className="fz-icon-circle" style={{ background: bg, color: fg }}>
                          <IconReceipt2 size={15} stroke={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {t.description || TRANSACTION_TYPE_LABELS[t.type]}
                            </span>
                            {category && <span className="fz-chip">{categoryLabel(category)}</span>}
                          </div>
                          <p className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {account?.name ?? '—'}{toAccount ? ` → ${toAccount.name}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <Amount className="fz-tabular font-semibold text-[14px]" style={{ color: amountColor }}>
                            {`${sign}${formatMoney(Math.abs(t.amount), t.currency)}`}
                          </Amount>
                          {t.currency === 'BOB' && (
                            <p className="text-[11px] fz-tabular" style={{ color: 'var(--text-muted)' }}>
                              ≈ {formatMoney(Math.abs(t.amount_usd), 'USD')}
                            </p>
                          )}
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDelete(t) }} className="cursor-pointer shrink-0 ml-1" style={{ color: 'var(--text-muted)' }} aria-label="Eliminar">
                          <IconTrash size={15} stroke={1.8} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
