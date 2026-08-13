'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IconEye, IconEyeOff, IconChartPie, IconReceipt2, IconBell, IconSettings, IconTarget } from '@tabler/icons-react'
import { api, apiCached } from '@/lib/finanzas/api-client'
import {
  isLiquid, getAccountBalance, latestValuationByAccount, type Account, type AssetValuation,
} from '@/lib/finanzas/accounts'
import { formatMoney, toUsd } from '@/lib/finanzas/currency'
import { latestRateByPair, type ExchangeRate } from '@/lib/finanzas/exchange-rates'
import { accountTransactionDelta, transactionDirection, TRANSACTION_TYPE_LABELS, type Transaction } from '@/lib/finanzas/transactions'
import type { Category } from '@/lib/finanzas/categories'
import ProfileSwitcher from './components/profile-switcher'
import { Amount, useAmountVisibility } from './components/amount-visibility'

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export default function FinanzasPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [valuations, setValuations] = useState<AssetValuation[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const { hidden, toggle } = useAmountVisibility()

  useEffect(() => {
    async function load() {
      setLoading(true)
      // accounts/rates/categories/me son datos de referencia que esta página
      // no edita — comparten el cache de /bootstrap con QuickAddProvider y
      // ProfileProvider (un solo auth.getUser() para los tres). transactions
      // es contenido dinámico, se pide siempre fresco.
      const [bootstrap, txJson] = await Promise.all([
        apiCached<{ accounts: Account[]; rates: ExchangeRate[]; categories: Category[]; me: { name: string } }>('/bootstrap'),
        api('/transactions').then(r => r.json()),
      ])
      const accs: Account[] = bootstrap.accounts ?? []
      setAccounts(accs)
      setRates(bootstrap.rates ?? [])
      setTransactions(txJson.transactions ?? [])
      setCategories(bootstrap.categories ?? [])
      setName(bootstrap.me?.name ?? '')
      const illiquid = accs.filter(a => !isLiquid(a.type))
      const valLists = await Promise.all(
        illiquid.map(a => apiCached<{ valuations: AssetValuation[] }>(`/accounts/${a.id}/valuations`))
      )
      setValuations(valLists.flatMap(v => v.valuations ?? []))
      setLoading(false)
    }
    load()
  }, [])

  const latestValuations = useMemo(() => latestValuationByAccount(valuations), [valuations])
  const latestRates = useMemo(() => latestRateByPair(rates), [rates])
  const bobPerUsd = latestRates.get('USD_BOB')?.rate ?? null
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const { patrimonio, liquidez } = useMemo(() => {
    let total = 0
    let liquid = 0
    for (const a of accounts.filter(a => !a.archived)) {
      const delta = accountTransactionDelta(a.id, transactions)
      const { amount, currency } = getAccountBalance(a, latestValuations.get(a.id) ?? null, delta)
      const usd = currency === 'USD' ? amount : (bobPerUsd ? toUsd(amount, currency, bobPerUsd) : 0)
      total += usd
      if (isLiquid(a.type)) liquid += usd
    }
    return { patrimonio: total, liquidez: liquid }
  }, [accounts, transactions, latestValuations, bobPerUsd])

  const savingsRate = useMemo(() => {
    const month = currentMonth()
    const thisMonth = transactions.filter(t => t.date.startsWith(month))
    const ingreso = thisMonth.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount_usd, 0)
    const gasto = thisMonth.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount_usd, 0)
    if (ingreso <= 0) return null
    return ((ingreso - gasto) / ingreso) * 100
  }, [transactions])

  const recent = transactions.slice(0, 6)
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])

  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="fz-subtitle">Hola</p>
          <h1 className="fz-title truncate">{name || '…'}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProfileSwitcher />
          <button onClick={toggle} className="fz-icon-btn" aria-label="Mostrar u ocultar montos">
            {hidden ? <IconEye size={16} stroke={1.8} /> : <IconEyeOff size={16} stroke={1.8} />}
          </button>
          <Link href="/finanzas/alertas" className="fz-icon-btn" aria-label="Alertas">
            <IconBell size={16} stroke={1.8} />
          </Link>
          <Link href="/finanzas/mas" className="fz-icon-btn lg:hidden" aria-label="Más opciones">
            <IconSettings size={16} stroke={1.8} />
          </Link>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-6">
        {/* Hero: presupuesto (vacío hasta el próximo sprint) */}
        <div className="fz-hero">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(0 0% 100% / 0.12)' }}>
                <IconChartPie size={15} stroke={1.8} />
              </span>
              <span className="text-[14px] font-semibold">Presupuesto</span>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(0 0% 100% / 0.65)' }}>
            Todavía no configuraste un presupuesto por categoría. Cuando lo hagas, acá vas a ver cuánto te queda disponible por categoría este mes.
          </p>
        </div>

        {/* Patrimonio / Liquidez / Ahorro */}
        <div className="fz-card flex gap-6 px-4 py-3 overflow-x-auto">
          <div>
            <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>Patrimonio</span>
            <Amount className="fz-tabular text-[13px] font-semibold">{loading ? '—' : formatMoney(patrimonio, 'USD')}</Amount>
          </div>
          <div>
            <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>Liquidez</span>
            <Amount className="fz-tabular text-[13px] font-semibold">{loading ? '—' : formatMoney(liquidez, 'USD')}</Amount>
          </div>
          {savingsRate != null && (
            <div>
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>Ahorro este mes</span>
              <Amount className="fz-tabular text-[13px] font-semibold">{`${savingsRate >= 0 ? '+' : ''}${savingsRate.toFixed(0)}%`}</Amount>
            </div>
          )}
        </div>

        {/* Objetivos y compromisos (vacío hasta Planificación) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="fz-section-label">Objetivos y compromisos</p>
            <Link href="/finanzas/planificacion" className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Ver todo</Link>
          </div>
          <Link href="/finanzas/planificacion" className="fz-card p-4 flex items-center gap-3">
            <span className="fz-icon-circle" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>
              <IconTarget size={16} stroke={1.8} />
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Todavía no configuraste objetivos ni compromisos.
            </span>
          </Link>
        </div>

        {/* Movimientos recientes */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="fz-section-label">Movimientos recientes</p>
            <Link href="/finanzas/transacciones" className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Ver todos</Link>
          </div>
          {loading ? (
            <p className="text-[13px] text-center py-8" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          ) : recent.length === 0 ? (
            <p className="text-[13px] text-center py-8" style={{ color: 'var(--text-muted)' }}>Todavía no registraste movimientos.</p>
          ) : (
            <div className="fz-card">
              {recent.map(t => {
                const dir = transactionDirection(t.type)
                const account = accountById.get(t.account_id)
                const category = t.category_id ? categoryById.get(t.category_id) : null
                const bg = dir === 'credit' ? 'var(--bg-success)' : dir === 'debit' ? 'var(--bg-danger)' : 'var(--bg-accent)'
                const fg = dir === 'credit' ? 'var(--text-success)' : dir === 'debit' ? 'var(--text-danger)' : 'var(--text-accent)'
                const sign = dir === 'credit' ? '+' : dir === 'debit' ? '-' : ''
                return (
                  <div key={t.id} className="fz-row">
                    <span className="fz-icon-circle" style={{ background: bg, color: fg }}>
                      <IconReceipt2 size={15} stroke={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {t.description || TRANSACTION_TYPE_LABELS[t.type]}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {category?.name ?? TRANSACTION_TYPE_LABELS[t.type]} · {account?.name ?? '—'}
                      </p>
                    </div>
                    <Amount className="fz-tabular text-[13px] font-semibold shrink-0" style={{ color: fg }}>
                      {`${sign}${formatMoney(Math.abs(t.amount), t.currency)}`}
                    </Amount>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
