'use client'

import { ReactNode, useState } from 'react'
import { IconArrowsExchange, IconChartLine, IconPencil, IconReceiptRefund, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import type { AccountWithBalance, Category, Transaction } from '@/lib/finanzas/types'
import { shareBreakdown } from '@/lib/finanzas/splits'
import { formatAmount } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { SignedAmount } from './amount'
import { CategoryIcon } from './category-icon'
import { useFinanzas } from './data-context'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { DetailField, DetailSheet } from './detail-sheet'
import { formatDayLabel, IconChip, RowMenu } from './ui'

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
  /** Abre la edición: lo dispara "Editar" desde el ⋮ y desde el resumen que
      abre el tap en la fila. */
  onClick?: () => void
}

/**
 * `[chip] título / subtítulo ........ monto [⋮]`
 * Una transferencia no tiene categoría, así que muestra el par origen → destino.
 *
 * Tocar la fila abre un resumen (<DetailSheet>) y no el formulario de edición
 * directo — un toque no debería poder cambiar ni borrar nada por accidente
 * (feedback del usuario: "para todas las listas"). El ⋮ sigue siendo el
 * atajo directo a Editar/Eliminar para quien ya sabe lo que quiere hacer.
 */
export function TxRow({ tx, accounts, categories, onClick }: TxRowProps) {
  const { reload, hidden } = useFinanzas()
  const [showDetail, setShowDetail] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const account = accounts.find(a => a.id === tx.account_id)
  const toAccount = accounts.find(a => a.id === tx.to_account_id)
  const category = categories.find(c => c.id === tx.category_id)

  const isTransfer = tx.type === 'transferencia'
  // `flow_type = 'movimiento'` en un gasto/ingreso tiene DOS causas posibles y
  // hay que poder distinguirlas en la lista: la cuenta es de inversión (el
  // mercado lo movió), o es un reembolso/cobro de deuda (`/debts/settle`, que
  // nace sin categoría). Se decide mirando la cuenta primero porque es la
  // explicación más específica — y la única posible para un `gasto`, que
  // nunca puede ser reembolso.
  const isInversion = !isTransfer && tx.flow_type === 'movimiento' && !!account?.is_investment
  // Un reembolso es un ingreso que no es un ingreso: sube el saldo pero no es
  // plata que ganaste. Se distingue de un sueldo por el chip, no por el color.
  const isReembolso = !isTransfer && !isInversion && tx.type === 'ingreso' && tx.flow_type === 'movimiento'
  const deudas = tx.debts ?? []
  const generoDeudas = deudas.length > 0

  const title = isTransfer
    ? `${account?.name ?? 'Cuenta'} → ${toAccount?.name ?? 'Cuenta'}`
    : (tx.description || category?.name || 'Sin categoría')
  const subtitle = isTransfer
    ? (tx.description || 'Transferencia')
    : isReembolso
      ? ['Reembolso', account?.name].filter(Boolean).join(' · ')
      : isInversion
        ? ['Inversión', category?.name, account?.name].filter(Boolean).join(' · ')
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
        onClick={() => setShowDetail(true)}
        className="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left rounded-[var(--fz-r-field)] transition-colors hover:bg-[var(--fz-surface-sunk)] active:scale-[0.99]"
      >
        {isTransfer ? (
          <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
        ) : isInversion ? (
          <IconChip><IconChartLine size={18} stroke={1.8} /></IconChip>
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
          ) : tx.currency !== 'USD' && !hidden ? (
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

      <DetailSheet
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={isTransfer ? 'Transferencia' : isReembolso ? 'Reembolso' : tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
        onEdit={onClick ? () => { setShowDetail(false); onClick() } : undefined}
        onDelete={() => { setShowDetail(false); setConfirmDelete(true) }}
      >
        <DeletePreview
          icon={
            isTransfer
              ? <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
              : isInversion
                ? <IconChip><IconChartLine size={18} stroke={1.8} /></IconChip>
                : isReembolso
                  ? <IconChip><IconReceiptRefund size={18} stroke={1.8} /></IconChip>
                  : <CategoryIcon slug={category?.icon} name={label} />
          }
          title={title}
          subtitle={subtitle}
          amount={<SignedAmount value={tx.amount} currency={tx.currency} type={tx.type} />}
        />
        <div>
          <DetailField label="Fecha" value={formatDayLabel(tx.date, todayISO())} />
          {!isTransfer && <DetailField label="Categoría" value={category?.name ?? 'Sin categoría'} />}
          <DetailField label={isTransfer ? 'De' : 'Cuenta'} value={account?.name} />
          {isTransfer && <DetailField label="A" value={toAccount?.name} />}
          {isInversion && (
            <DetailField label="Cuenta de inversión" value="Sí — no cuenta como gasto/ingreso real" />
          )}
          {tx.currency !== 'USD' && !hidden && (
            <DetailField label="≈ USD" value={`$${tx.amount_usd.toFixed(2)}`} />
          )}
          {generoDeudas && (
            <DetailField
              label={parte!.kind === 'ganas' ? 'Ganás' : 'Tu parte'}
              value={formatAmount(Math.abs(parte!.mine), tx.currency)}
            />
          )}
        </div>
      </DetailSheet>

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
              : isInversion
                ? <IconChip><IconChartLine size={18} stroke={1.8} /></IconChip>
                : isReembolso
                  ? <IconChip><IconReceiptRefund size={18} stroke={1.8} /></IconChip>
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
