'use client'

import { ReactNode, useState } from 'react'
import { IconArrowsExchange, IconChartLine, IconPencil, IconReceiptRefund, IconRotateClockwise2, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import { CURRENCY_META, type AccountWithBalance, type Category, type Transaction } from '@/lib/finanzas/types'
import { shareBreakdown } from '@/lib/finanzas/splits'
import { displayRate, formatAmount, formatUSD } from '@/lib/finanzas/money'
import { isInvestmentAdjustment, todayISO, transferFeeUsd } from '@/lib/finanzas/transactions'
import { SignedAmount } from './amount'
import { CategoryIcon } from './category-icon'
import { useFinanzas } from './data-context'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { DetailField, DetailSheet } from './detail-sheet'
import { formatDayLabel, IconChip, RowMenu } from './ui'
import { fzFetch } from './fz-fetch'

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
  //
  // Desde §7.2, una actualización de valor de inversión ya no llega hasta acá
  // — `loadTransactions` la saca de la lista antes de que Home o Movimientos
  // la vean, porque no es un movimiento de cuentas. Esta rama queda para el
  // caso residual de una fila vieja que haya llegado por otro camino; no
  // hace falta que nunca se dispare para que siga siendo correcta.
  const isInversion = isInvestmentAdjustment(tx, account)
  // Un aporte o una recepción de pasanaku: plata que sale/entra pero vuelve
  // completa cuando toca el turno — nunca reembolso ni inversión, aunque
  // comparta el mismo `flow_type: 'movimiento'` (§ Sprint 5).
  const esPasanaku = !isTransfer && !!tx.pasanaku_id
  // Un reembolso es un ingreso que no es un ingreso: sube el saldo pero no es
  // plata que ganaste. Se distingue de un sueldo por el chip, no por el color.
  const isReembolso = !isTransfer && !isInversion && !esPasanaku && tx.type === 'ingreso' && tx.flow_type === 'movimiento'
  // Vino de un fijo (§ Registrar en Fijos): marcarlo en el texto es lo que deja
  // distinguir de un vistazo, en el historial mezclado de Movimientos, cuáles
  // salidas son recurrentes y cuáles no (feedback del usuario).
  const esFijo = !isTransfer && !!tx.recurring_id
  const deudas = tx.debts ?? []
  const generoDeudas = deudas.length > 0

  const title = isTransfer
    ? `${account?.name ?? 'Cuenta'} → ${toAccount?.name ?? 'Cuenta'}`
    : esPasanaku
      ? (tx.description || 'Pasanaku')
      : (tx.description || category?.name || 'Sin categoría')
  const subtitle = isTransfer
    ? (tx.description || 'Transferencia')
    : esPasanaku
      ? [tx.type === 'ingreso' ? 'Pasanaku · recepción' : 'Pasanaku · aporte', account?.name].filter(Boolean).join(' · ')
      : isReembolso
        ? ['Reembolso', account?.name].filter(Boolean).join(' · ')
        : isInversion
          ? ['Inversión', category?.name, account?.name].filter(Boolean).join(' · ')
          : esFijo
            ? ['Gasto Fijo', category?.name, account?.name].filter(Boolean).join(' · ')
            : [category?.name, account?.name].filter(Boolean).join(' · ')

  const label = isTransfer ? 'Transferencia' : (category?.name ?? 'Sin categoría')
  // Solo existe en una transferencia entre monedas distintas, y sale de los dos
  // lados ya congelados — nunca de la tasa de hoy.
  const fee = transferFeeUsd(tx)
  // Entre monedas distintas la comisión solo tiene sentido en USD (es la única
  // unidad donde restar Bs de USDT significa algo). En la misma moneda, en
  // cambio, la resta es directa y mostrarla en dólares sería dar una vuelta.
  const mismaMoneda = isTransfer && !!toAccount && toAccount.currency === tx.currency
  const feeNativo = mismaMoneda && tx.to_amount != null ? tx.amount - tx.to_amount : null
  const parte = generoDeudas ? shareBreakdown(tx.amount, deudas, tx.currency) : null

  async function remove() {
    setRemoving(true)
    setDeleteError('')
    const res = await fzFetch(`/api/finanzas/transactions/${tx.id}`, { method: 'DELETE' })
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
        ) : esPasanaku ? (
          <IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>
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
              {parte!.kind === 'ganas' ? 'ganas ' : 'tu parte '}
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
        title={
          isTransfer ? 'Transferencia'
            : esPasanaku ? (tx.type === 'ingreso' ? 'Recepción de pasanaku' : 'Aporte de pasanaku')
            : isReembolso ? 'Reembolso'
            : tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'
        }
        onEdit={onClick ? () => { setShowDetail(false); onClick() } : undefined}
        onDelete={() => { setShowDetail(false); setConfirmDelete(true) }}
      >
        <DeletePreview
          icon={
            isTransfer
              ? <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
              : esPasanaku
                ? <IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>
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
          {!isTransfer && !esPasanaku && <DetailField label="Categoría" value={category?.name ?? 'Sin categoría'} />}
          <DetailField label={isTransfer ? 'De' : 'Cuenta'} value={account?.name} />
          {isTransfer && <DetailField label="A" value={toAccount?.name} />}
          {/* Cuánto salió, cuánto llegó y qué se comió el camino. Los dos
              montos van en SU moneda —es lo que de verdad se movió— y la
              comisión en USD, que es la única unidad en la que restar dos
              monedas distintas significa algo. */}
          {isTransfer && tx.to_amount != null && toAccount && !hidden && (
            <>
              <DetailField label="Enviado" value={formatAmount(tx.amount, tx.currency)} />
              <DetailField label="Recibido" value={formatAmount(tx.to_amount, toAccount.currency)} />
              {feeNativo != null ? (
                <DetailField
                  label="Comisión"
                  value={feeNativo === 0 ? 'Sin comisión' : formatAmount(feeNativo, tx.currency)}
                />
              ) : fee != null && (
                <DetailField
                  label={fee < 0 ? 'A favor' : 'Comisión'}
                  value={fee === 0 ? 'Sin comisión' : formatUSD(Math.abs(fee))}
                />
              )}
            </>
          )}
          {isInversion && (
            <DetailField label="Cuenta de inversión" value="Sí — no cuenta como gasto/ingreso real" />
          )}
          {esPasanaku && (
            <DetailField label="Pasanaku" value="No cuenta como gasto/ingreso real del mes" />
          )}
          {tx.currency !== 'USD' && !hidden && (
            <>
              {/* La tasa con la que se registró — congelada, no la de hoy
                  (§ freezeConversion). Mismo rótulo que usa Ajustes para esa
                  moneda, para que el número se lea igual en los dos lugares. */}
              <DetailField
                label={CURRENCY_META[tx.currency].rateLabel}
                value={displayRate(tx.currency, tx.exchange_rate).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              />
              <DetailField label="≈ USD" value={`$${tx.amount_usd.toFixed(2)}`} />
            </>
          )}
          {generoDeudas && (
            <DetailField
              label={parte!.kind === 'ganas' ? 'Ganas' : 'Tu parte'}
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
              : esPasanaku
                ? <IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>
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
