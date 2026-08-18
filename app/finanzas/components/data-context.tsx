'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AccountWithBalance, Category, Settings, Transaction } from '@/lib/finanzas/types'
import { DEFAULT_USD_BOB_RATE } from '@/lib/finanzas/types'

/**
 * Estado compartido de la mini-app. Vive en el cliente para que registrar un
 * movimiento actualice el saldo y la lista sin recargar la página — que es lo
 * que hace que se sienta app y no sitio web.
 */
interface FinanzasData {
  accounts: AccountWithBalance[]
  categories: Category[]
  settings: Settings
  totalUsd: number
  loading: boolean
  /** Vuelve a pedir cuentas, categorías y ajustes. Lo llama el quick-add al guardar. */
  reload: () => Promise<void>
  /** Marca de tiempo que cambia en cada reload: las pantallas la usan como señal. */
  version: number
  hidden: boolean
  toggleHidden: () => void
}

const Ctx = createContext<FinanzasData | null>(null)

const HIDDEN_KEY = 'fz:hidden'

export function FinanzasProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<Settings>({
    usd_bob_rate: DEFAULT_USD_BOB_RATE,
    updated_at: new Date().toISOString(),
  })
  const [totalUsd, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === '1')
  }, [])

  const toggleHidden = useCallback(() => {
    setHidden(prev => {
      window.localStorage.setItem(HIDDEN_KEY, prev ? '0' : '1')
      return !prev
    })
  }, [])

  const reload = useCallback(async () => {
    const [accRes, catRes] = await Promise.all([
      fetch('/api/finanzas/accounts'),
      fetch('/api/finanzas/categories'),
    ])
    if (accRes.ok) {
      const data = await accRes.json()
      setAccounts(data.accounts ?? [])
      setTotal(data.total_usd ?? 0)
      setSettings(s => ({ ...s, usd_bob_rate: data.usd_bob_rate ?? s.usd_bob_rate }))
    }
    if (catRes.ok) {
      const data = await catRes.json()
      setCategories(data.categories ?? [])
    }
    setLoading(false)
    setVersion(v => v + 1)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const value = useMemo<FinanzasData>(
    () => ({ accounts, categories, settings, totalUsd, loading, reload, version, hidden, toggleHidden }),
    [accounts, categories, settings, totalUsd, loading, reload, version, hidden, toggleHidden],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFinanzas(): FinanzasData {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFinanzas debe usarse dentro de <FinanzasProvider>')
  return ctx
}

/** Trae movimientos con filtros. Cada pantalla maneja su propia query. */
export async function fetchTransactions(params: Record<string, string | undefined>): Promise<{
  transactions: Transaction[]
  total_gasto_usd: number
  total_ingreso_usd: number
}> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
  const res = await fetch(`/api/finanzas/transactions?${qs.toString()}`)
  if (!res.ok) return { transactions: [], total_gasto_usd: 0, total_ingreso_usd: 0 }
  return res.json()
}
