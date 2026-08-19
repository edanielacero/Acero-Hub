'use client'

import { ReactNode, useState } from 'react'
import { IconArrowsExchange, IconPencil, IconReceiptRefund, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import type { AccountWithBalance, Category, Transaction } from '@/lib/finanzas/types'
import { shareBreakdown } from '@/lib/finanzas/splits'
import { formatAmount } from '@/lib/finanzas/money'
import { SignedAmount } from './amount'
import { CategoryIcon } from './category-icon'
import { useFinanzas } from './data-context'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { IconChip, RowMenu } from './ui'

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
  /** Abre la edición. También es lo que dispara "Editar" desde el menú de ⋮. */
  onClick?: () => void
}

/**
 * `[chip] título / subtítulo ........ monto [⋮]`
 * Una transferencia no tiene categoría, así que muestra el par origen → destino.
 *
 * El ⋮ da acceso directo a Eliminar sin pasar por el formulario de edición —
 * misma idea que en Cuentas: el borrado vive en la fila, no escondido adentro
 * de otra pantalla (feedback del usuario, "para todas las listas").
 */
export function TxRow({ tx, accounts, categories, onClick }: TxRowProps) {
  const { reload } = useFinanzas()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const account = accounts.find(a => a.id === tx.account_id)
  const toAccount = accounts.find(a => a.id === tx.to_account_id)
  const category = categories.find(c => c.id === tx.category_id)

  const isTransfer = tx.type === 'transferencia'
  // Un reembolso es un ingreso que no es un ingreso: sube el saldo pero no es
  // plata que ganaste. Se distingue de un sueldo por el chip, no por el color.
  const isReembolso = tx.type === 'ingreso' && tx.flow_type === 'movimiento'
  const deudas = tx.debts ?? []
  const generoDeudas = deudas.length > 0

  const title = isTransfer
    ? `${account?.name ?? 'Cuenta'} → ${toAccount?.name ?? 'Cuenta'}`
    : (tx.description || category?.name || 'Sin categoría')
  const subtitle = isTransfer
    ? (tx.description || 'Transferencia')
    : isReembolso
      ? ['Reembolso', account?.name].filter(Boolean).join(' · ')
      : [category?.name, account?.name].filter(Boolean).join(' · ')

  const label = isTransfer ? 'Transferencia' : (category?.name ?? 'Sin categoría')
  const parte = generoDeudas ? shareBreakdown(tx.amount, deudas, tx.currency) : null

  async function remove() {
    setRemoving(true)
    setDeleteError('')
    const res = await fetch(`/api/finanzas/transactions/${tx.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setRemoving(false)
      return setDeleteError(data.error ?? 'No se pudo borrar')
    }
    // Se cierra recién después de reload(): antes, el sheet desaparecía con
    // la lista todavía sin actualizar, y se veía la fila vieja un instante.
    await reload()
    setRemoving(false)
    setConfirmDelete(false)
  }

  return (
    <div className="w-full flex items-center gap-1 min-h-16">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left rounded-[var(--fz-r-field)] transition-colors hover:bg-[var(--fz-surface-sunk)] active:scale-[0.99]"
      >
        {isTransfer ? (
          <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
        ) : isReembolso ? (
          <IconChip><IconReceiptRefund size={18} stroke={1.8} /></IconChip>
        ) : (
          <CategoryIcon slug={category?.icon} name={label} />
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
          {/* El indicador de reparto vive bajo el monto, no al lado del título:
              ahí competía con el nombre del movimiento por la misma línea. Es
              además donde ya está la mirada cuando importa la plata (§16.7). */}
          {generoDeudas ? (
            <span
              className="flex items-center justify-end gap-1 text-[12px] fz-num"
              style={{ color: parte!.kind === 'ganas' ? 'var(--fz-in-text)' : 'var(--fz-ink-3)' }}
            >
              <IconUsersGroup size={11} stroke={2.2} className="opacity-70" />
              {/* Si repartiste por encima del costo, la resta da negativo: eso
                  no es "tu parte −$2.01", es plata que ganaste. */}
              {parte!.kind === 'ganas' ? 'ganás ' : 'tu parte '}
              {formatAmount(Math.abs(parte!.mine), tx.currency)}
            </span>
          ) : tx.currency !== 'USD' ? (
            <span className="block text-[12px] text-[var(--fz-ink-3)] fz-num">
              ≈ ${tx.amount_usd.toFixed(2)}
            </span>
          ) : null}
        </span>
      </button>

      <RowMenu
        items={[
          { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: () => onClick?.() },
          { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: () => setConfirmDelete(true), danger: true },
        ]}
      />

      <DeleteConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar movimiento"
        confirming={removing}
        error={deleteError}
      >
        <DeletePreview
          icon={
            isTransfer
              ? <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
              : <CategoryIcon slug={category?.icon} name={label} />
          }
          title={title}
          subtitle={subtitle}
          amount={<SignedAmount value={tx.amount} currency={tx.currency} type={tx.type} />}
        />
      </DeleteConfirmSheet>
    </div>
  )
}
