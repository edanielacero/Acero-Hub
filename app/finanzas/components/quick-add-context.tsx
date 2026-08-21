'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Transaction, TxType } from '@/lib/finanzas/types'

interface QuickAddState {
  open: boolean
  /** Movimiento en edición. `null` = alta nueva. */
  editing: Transaction | null
  /** Con qué tipo arranca una alta nueva. Las acciones rápidas de la Home
      abren directo en "gasto", "ingreso" o "transferencia" — el caso común es
      que ya sabés qué es, y elegirlo de nuevo en el sheet era un toque de más
      (§16.3 de contexto_ui_finanzas.md). */
  initialType: TxType
  /**
   * Si el tipo vino fijado por una acción puntual (el botón "Gasto" de la
   * Home, no el "Nuevo" genérico de Movimientos), el sheet no muestra el
   * selector de tipo. Mostrarlo igual reintroducía la elección que el botón
   * específico quería evitar — tocabas "Ingreso" y el panel te dejaba
   * pasarte a "Gasto" de todos modos, así que los tres botones no eran más
   * que un "+" disfrazado.
   */
  lockType: boolean
}

interface QuickAddApi extends QuickAddState {
  openNew: (type?: TxType) => void
  openEdit: (tx: Transaction) => void
  close: () => void
}

const Ctx = createContext<QuickAddApi | null>(null)

const CLOSED: QuickAddState = { open: false, editing: null, initialType: 'gasto', lockType: false }

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuickAddState>(CLOSED)

  const openNew = useCallback(
    (type?: TxType) => setState({
      open: true, editing: null, initialType: type ?? 'gasto', lockType: type !== undefined,
    }),
    [],
  )
  const openEdit = useCallback(
    (tx: Transaction) => setState({ open: true, editing: tx, initialType: tx.type, lockType: false }),
    [],
  )
  const close = useCallback(() => setState(CLOSED), [])

  const value = useMemo(() => ({ ...state, openNew, openEdit, close }), [state, openNew, openEdit, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useQuickAddApi(): QuickAddApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useQuickAdd debe usarse dentro de <QuickAddProvider>')
  return ctx
}

/** Abre el quick-add en modo alta desde cualquier pantalla. Sin argumento
    arranca en "gasto", que sigue siendo el caso más común. */
export function useQuickAdd(): (type?: TxType) => void {
  return useQuickAddApi().openNew
}

/** Abre el quick-add para editar un movimiento existente. */
export function useQuickEdit(): (tx: Transaction) => void {
  return useQuickAddApi().openEdit
}

export { useQuickAddApi }
