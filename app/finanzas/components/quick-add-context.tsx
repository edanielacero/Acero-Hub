'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Transaction } from '@/lib/finanzas/types'

interface QuickAddState {
  open: boolean
  /** Movimiento en edición. `null` = alta nueva. */
  editing: Transaction | null
}

interface QuickAddApi extends QuickAddState {
  openNew: () => void
  openEdit: (tx: Transaction) => void
  close: () => void
}

const Ctx = createContext<QuickAddApi | null>(null)

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuickAddState>({ open: false, editing: null })

  const openNew = useCallback(() => setState({ open: true, editing: null }), [])
  const openEdit = useCallback((tx: Transaction) => setState({ open: true, editing: tx }), [])
  const close = useCallback(() => setState({ open: false, editing: null }), [])

  const value = useMemo(() => ({ ...state, openNew, openEdit, close }), [state, openNew, openEdit, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useQuickAddApi(): QuickAddApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useQuickAdd debe usarse dentro de <QuickAddProvider>')
  return ctx
}

/** Abre el quick-add en modo alta desde cualquier pantalla. */
export function useQuickAdd(): () => void {
  return useQuickAddApi().openNew
}

/** Abre el quick-add para editar un movimiento existente. */
export function useQuickEdit(): (tx: Transaction) => void {
  return useQuickAddApi().openEdit
}

export { useQuickAddApi }
