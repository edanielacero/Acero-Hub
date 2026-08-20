'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { AccountWithBalance, Transaction } from '@/lib/finanzas/types'
import { isInvestmentAdjustment } from '@/lib/finanzas/transactions'
import { useQuickEdit } from './quick-add-context'

interface AccountValueState {
  open: boolean
  account: AccountWithBalance | null
  /** Actualización en edición. `null` = alta nueva. */
  editing: Transaction | null
}

interface AccountValueApi extends AccountValueState {
  openNew: (account: AccountWithBalance) => void
  openEdit: (tx: Transaction, account: AccountWithBalance) => void
  close: () => void
}

const Ctx = createContext<AccountValueApi | null>(null)

const CLOSED: AccountValueState = { open: false, account: null, editing: null }

/**
 * Estado de "Actualizar valor" (§7.2 de contexto_finanzas.md), en su propio
 * contexto — mismo patrón que `QuickAddProvider` — porque tres lugares
 * distintos necesitan poder abrirlo: el ⋮ de una cuenta en Cuentas, el botón
 * extra de su `DetailSheet`, y el tap en "Editar" de un movimiento que resultó
 * ser una actualización de valor (Home, Movimientos).
 */
export function AccountValueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccountValueState>(CLOSED)

  const openNew = useCallback(
    (account: AccountWithBalance) => setState({ open: true, account, editing: null }),
    [],
  )
  const openEdit = useCallback(
    (tx: Transaction, account: AccountWithBalance) => setState({ open: true, account, editing: tx }),
    [],
  )
  const close = useCallback(() => setState(CLOSED), [])

  const value = useMemo(() => ({ ...state, openNew, openEdit, close }), [state, openNew, openEdit, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useAccountValueApi(): AccountValueApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccountValue debe usarse dentro de <AccountValueProvider>')
  return ctx
}

/** Abre "Actualizar valor" en alta nueva para una cuenta de inversión. */
export function useAccountValue(): (account: AccountWithBalance) => void {
  return useAccountValueApi().openNew
}

/** Abre "Actualizar valor" para editar una actualización ya registrada. */
export function useAccountValueEdit(): (tx: Transaction, account: AccountWithBalance) => void {
  return useAccountValueApi().openEdit
}

export { useAccountValueApi }

/**
 * Punto único para decidir a qué sheet manda un movimiento en edición: el
 * QuickAdd genérico, o "Actualizar valor" si resultó ser un ajuste de
 * inversión (§7.2 de contexto_finanzas.md) — mismo criterio que ya usa
 * `TxRow` para su ícono y subtítulo. La usan Home y Movimientos en vez de
 * llamar a `useQuickEdit()` directo.
 */
export function useEditTransaction(): (tx: Transaction, accounts: AccountWithBalance[]) => void {
  const openQuickEdit = useQuickEdit()
  const openValueEdit = useAccountValueEdit()

  return (tx, accounts) => {
    const account = accounts.find(a => a.id === tx.account_id)
    if (isInvestmentAdjustment(tx, account)) {
      openValueEdit(tx, account!)
    } else {
      openQuickEdit(tx)
    }
  }
}
