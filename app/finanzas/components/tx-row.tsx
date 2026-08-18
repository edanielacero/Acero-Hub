'use client'

import { ReactNode } from 'react'
import { IconArrowsExchange } from '@tabler/icons-react'
import type { AccountWithBalance, Category, Transaction } from '@/lib/finanzas/types'
import { SignedAmount } from './amount'
import { IconChip, tintFor } from './ui'

export function PageHeader({ title, subtitle, action }: {
  title: ReactNode; subtitle?: ReactNode; action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        {subtitle && <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">{subtitle}</p>}
        <h1 className="text-[26px] min-[900px]:text-[28px] font-bold tracking-[-0.02em] leading-tight">
          {title}
        </h1>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </header>
  )
}

interface TxRowProps {
  tx: Transaction
  accounts: AccountWithBalance[]
  categories: Category[]
  onClick?: () => void
}

/**
 * `[chip] título / subtítulo ........ monto`
 * Una transferencia no tiene categoría, así que muestra el par origen → destino.
 */
export function TxRow({ tx, accounts, categories, onClick }: TxRowProps) {
  const account = accounts.find(a => a.id === tx.account_id)
  const toAccount = accounts.find(a => a.id === tx.to_account_id)
  const category = categories.find(c => c.id === tx.category_id)

  const isTransfer = tx.type === 'transferencia'
  const title = isTransfer
    ? `${account?.name ?? 'Cuenta'} → ${toAccount?.name ?? 'Cuenta'}`
    : (tx.description || category?.name || 'Sin categoría')
  const subtitle = isTransfer
    ? (tx.description || 'Transferencia')
    : [category?.name, account?.name].filter(Boolean).join(' · ')

  const label = isTransfer ? 'Transferencia' : (category?.name ?? 'Sin categoría')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 min-h-16 py-2.5 text-left rounded-[var(--fz-r-field)] transition-colors hover:bg-[var(--fz-surface-sunk)] active:scale-[0.99]"
    >
      {isTransfer ? (
        <IconChip tint="slate"><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
      ) : (
        <IconChip tint={tintFor(label)}>{category?.emoji ?? '•'}</IconChip>
      )}

      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold truncate">{title}</span>
        <span className="block text-[13px] text-[var(--fz-ink-2)] truncate">{subtitle}</span>
      </span>

      <span className="shrink-0 text-right">
        <SignedAmount
          value={tx.amount}
          currency={tx.currency}
          type={tx.type}
          className="block text-[15px]"
        />
        {tx.currency !== 'USD' && (
          <span className="block text-[12px] text-[var(--fz-ink-3)] fz-num">
            ≈ ${tx.amount_usd.toFixed(2)}
          </span>
        )}
      </span>
    </button>
  )
}
