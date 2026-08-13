'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiCached } from '@/lib/finanzas/api-client'
import type { Account } from '@/lib/finanzas/accounts'
import type { Category } from '@/lib/finanzas/categories'
import type { CategoryRule } from '@/lib/finanzas/auto-categorize'
import type { Transaction } from '@/lib/finanzas/transactions'
import QuickAdd from './quick-add'

interface QuickAddContextValue {
  openQuickAdd: (editTransaction?: Transaction | null) => void
  onTransactionSaved: (cb: () => void) => () => void
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

// Fetch propio (independiente del de cada página) para poder abrir el sheet desde
// cualquier lado, ej. el botón "+" del tab bar — cada página igual refresca su
// propia data al montarse, así que no hace falta sincronizar nada entre sí.
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [open, setOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [listeners, setListeners] = useState<(() => void)[]>([])

  useEffect(() => {
    async function load() {
      // Comparte el cache de /bootstrap con Inicio y ProfileProvider — un solo
      // auth.getUser() cubre a los tres si se montan en el mismo tick.
      const json = await apiCached<{ accounts: Account[]; categories: Category[]; rules: CategoryRule[] }>('/bootstrap')
      setAccounts(json.accounts ?? [])
      setCategories(json.categories ?? [])
      setRules(json.rules ?? [])
    }
    load()
  }, [])

  const openQuickAdd = useCallback((editTransaction: Transaction | null = null) => {
    setEditTx(editTransaction)
    setOpen(true)
  }, [])

  const onTransactionSaved = useCallback((cb: () => void) => {
    setListeners(prev => [...prev, cb])
    return () => setListeners(prev => prev.filter(l => l !== cb))
  }, [])

  function handleSaved() {
    setOpen(false)
    setEditTx(null)
    listeners.forEach(cb => cb())
  }

  return (
    <QuickAddContext.Provider value={{ openQuickAdd, onTransactionSaved }}>
      {children}
      <QuickAdd
        open={open}
        onClose={() => { setOpen(false); setEditTx(null) }}
        onSaved={handleSaved}
        accounts={accounts}
        categories={categories}
        categoryRules={rules}
        editTransaction={editTx}
      />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error('useQuickAdd debe usarse dentro de <QuickAddProvider>')
  return ctx
}
