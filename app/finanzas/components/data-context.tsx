'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  const firstLoad = useRef(true)

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

    // En la primera carga no se toca `version`: las pantallas ya están pidiendo
    // sus datos por su cuenta y bumpearla las hacía pedir todo dos veces.
    if (firstLoad.current) {
      firstLoad.current = false
    } else {
      // Recarga por mutación: lo cacheado quedó viejo.
      txCache.clear()
      setVersion(v => v + 1)
    }
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

export interface TxResult {
  transactions: Transaction[]
  total_gasto_usd: number
  total_ingreso_usd: number
}

const EMPTY: TxResult = { transactions: [], total_gasto_usd: 0, total_ingreso_usd: 0 }

/**
 * Respuestas ya vistas, por query string. Volver a una pantalla que ya se
 * visitó pinta al instante en vez de esperar otra vuelta al servidor; el dato
 * fresco llega por detrás y reemplaza. Se limpia entero en cada mutación.
 */
const txCache = new Map<string, TxResult>()

function txKey(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (v) qs.set(k, v)
  }
  return qs.toString()
}

/** Trae movimientos con filtros. Cada pantalla maneja su propia query. */
export async function fetchTransactions(
  params: Record<string, string | undefined>,
): Promise<TxResult> {
  const res = await fetch(`/api/finanzas/transactions?${txKey(params)}`)
  if (!res.ok) return EMPTY
  return res.json()
}

/**
 * Movimientos con caché stale-while-revalidate. `loading` solo es true la
 * primera vez que se pide una consulta: si ya hay algo cacheado se muestra
 * mientras se revalida, que es lo que hace que navegar se sienta instantáneo.
 */
export function useTransactions(params: Record<string, string | undefined>): {
  data: TxResult
  loading: boolean
} {
  const { version } = useFinanzas()
  const key = txKey(params)

  const [data, setData] = useState<TxResult>(() => txCache.get(key) ?? EMPTY)
  const [loading, setLoading] = useState(() => !txCache.has(key))

  useEffect(() => {
    let cancelled = false
    const cached = txCache.get(key)
    if (cached) {
      setData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void (async () => {
      const res = await fetch(`/api/finanzas/transactions?${key}`)
      if (cancelled) return
      const fresh: TxResult = res.ok ? await res.json() : EMPTY
      if (cancelled) return
      txCache.set(key, fresh)
      setData(fresh)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [key, version])

  return { data, loading }
}
