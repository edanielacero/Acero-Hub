'use client'

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
} from 'react'
import type { AccountWithBalance, Category, DebtPlanWithCuotas, PersonWithDebt, RateMap, RecurringSummary, SharedSummary } from '@/lib/finanzas/types'
import type { RateDetail } from '@/lib/finanzas/rates'
import type { TxResult } from '@/lib/finanzas/load'
import { CURRENCY_META, RATED_CURRENCIES } from '@/lib/finanzas/types'
import { monthRange, todayISO } from '@/lib/finanzas/transactions'
import { clearSnapshots, readSnapshot, writeSnapshot, type Snapshot } from '@/lib/finanzas/snapshot'
import { readSessionClaims } from '@/lib/session-claims'
import { createClient } from '@/lib/supabase'

export type { TxResult }

/**
 * Estado compartido de la mini-app. Vive en el cliente para que registrar un
 * movimiento actualice el saldo y la lista sin recargar la página — que es lo
 * que hace que se sienta app y no sitio web.
 */
interface FinanzasData {
  accounts: AccountWithBalance[]
  categories: Category[]
  /** Tasa vigente por moneda. USD no aparece: siempre vale 1. */
  rates: RateMap
  /** Las mismas tasas con su fecha de última edición, para Ajustes. */
  rateList: RateDetail[]
  /** Personas con las que compartís gastos, con lo que te deben. */
  people: PersonWithDebt[]
  /** El panel de Compartidos: deudas, cobros del mes, repartos recientes. */
  shared: SharedSummary
  /** Los fijos con su estado en el período vigente. */
  recurring: RecurringSummary
  /** Los planes de pago con sus cuotas ya resueltas. */
  plans: DebtPlanWithCuotas[]
  totalUsd: number
  /**
   * No hay **nada** que mostrar todavía. Quien lo consulta tiene que pintar un
   * esqueleto: un $0 mientras carga no es "no sé", es un número equivocado.
   */
  loading: boolean
  /** Lo que se ve salió del snapshot del dispositivo y hay datos frescos en camino. */
  stale: boolean
  /** Hay una carga en vuelo. Lo usa useTransactions para no pedir de más. */
  pending: boolean
  /** La última carga falló. Con `loading` en true, no queda nada que mostrar. */
  error: boolean
  /** Vuelve a pedir todo. Lo llama el quick-add al guardar. */
  reload: () => Promise<void>
  /** Marca que cambia en cada reload por mutación: las pantallas la usan como señal. */
  version: number
  /**
   * Sube cada vez que el provider escribe en el caché de movimientos. Es lo que
   * despierta a `useTransactions`, que no puede leer el caché durante el render.
   */
  seed: number
  hidden: boolean
  toggleHidden: () => void
  /** Nombre del usuario logueado, para saludos. Null hasta leer la sesión. */
  userName: string | null
}

const Ctx = createContext<FinanzasData | null>(null)

const HIDDEN_KEY = 'fz:hidden'
/** Cuántos movimientos pide la Home para "últimos". */
const RECENT = 5
/**
 * El tope de la consulta del mes. 500 y no 200 para que la Home y Movimientos
 * —que pide 500— compartan exactamente la misma clave de caché: así pasar de
 * una a otra no cuesta ningún viaje.
 */
const MONTH_LIMIT = '500'

const EMPTY_RECURRING: RecurringSummary = { recurring: [], done: 0, total: 0, pending: 0 }

const EMPTY_SHARED: SharedSummary = {
  por_cobrar_usd: 0, cobrado_mes_usd: 0, perdonado_mes_usd: 0,
  por_persona: [], historial: [],
}

const EMPTY: TxResult = {
  transactions: [], total_gasto_usd: 0, total_ingreso_usd: 0,
  total_repartido_usd: 0, total_gasto_real_usd: 0,
}

/* ─── Caché de movimientos ─────────────────────────────────────────────────
   Respuestas ya vistas, por query string, con la versión en que se llenaron.
   Una entrada de la versión actual está fresca y no se vuelve a pedir; una más
   vieja se muestra igual mientras se revalida. Es lo que hace que volver a una
   pantalla ya visitada pinte al instante. */

const txCache = new Map<string, { v: number; data: TxResult }>()

/** Versión del caché fuera de React: `reload` necesita subirla de forma síncrona. */
let cacheVersion = 0
/** Nunca crece sin límite: son meses × combinaciones de filtros, pero por las dudas. */
const MAX_ENTRIES = 40
/** Las entradas que vienen del snapshot arrancan viejas: se muestran y se revalidan. */
const FROM_SNAPSHOT = -1

function txKey(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (v) qs.set(k, v)
  }
  return qs.toString()
}

/**
 * Hidratar el snapshot tiene que pasar antes del primer pintado, o se vería un
 * parpadeo esqueleto → datos. En el server no hay efecto de layout que valga.
 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function FinanzasProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rates, setRates] = useState<RateMap>(
    () => Object.fromEntries(RATED_CURRENCIES.map(c => [c, CURRENCY_META[c].defaultRate])),
  )
  const [rateList, setRateList] = useState<RateDetail[]>([])
  const [people, setPeople] = useState<PersonWithDebt[]>([])
  const [shared, setShared] = useState<SharedSummary>(EMPTY_SHARED)
  const [recurring, setRecurring] = useState<RecurringSummary>(EMPTY_RECURRING)
  const [plans, setPlans] = useState<DebtPlanWithCuotas[]>([])
  const [totalUsd, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [seed, setSeed] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const uid = useRef<string | null>(null)
  const firstLoad = useRef(true)

  const apply = useCallback((snap: Omit<Snapshot, 'at'>, v: number) => {
    setAccounts(snap.accounts)
    setCategories(snap.categories)
    setRates(snap.rates)
    setRateList(snap.rate_list)
    setPeople(snap.people)
    setShared(snap.shared)
    setRecurring(snap.recurring ?? EMPTY_RECURRING)
    setPlans(snap.plans ?? [])
    setTotal(snap.total_usd)
    for (const [key, data] of Object.entries(snap.tx)) {
      if (data) txCache.set(key, { v, data })
    }
    setSeed(n => n + 1)
  }, [])

  // Lo último que se vio en este dispositivo, pintado antes de tocar la red.
  useIsoLayoutEffect(() => {
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === '1')

    const claims = readSessionClaims()
    uid.current = claims?.sub ?? null
    setUserName(claims?.name ?? null)

    const snap = readSnapshot(uid.current)
    if (!snap) return

    apply(snap, FROM_SNAPSHOT)
    setLoading(false)
  }, [apply])

  const toggleHidden = useCallback(() => {
    setHidden(prev => {
      window.localStorage.setItem(HIDDEN_KEY, prev ? '0' : '1')
      return !prev
    })
  }, [])

  const reload = useCallback(async () => {
    const mutation = !firstLoad.current
    firstLoad.current = false
    setPending(true)

    const range = monthRange()
    const qs = new URLSearchParams({
      from: range.from, to: range.to, limit: MONTH_LIMIT, recent: String(RECENT),
      // El día del usuario, no el del servidor: de él depende si un fijo está
      // vencido o todavía no.
      today: todayISO(),
    })

    let res: Response
    try {
      res = await fetch(`/api/finanzas/bootstrap?${qs}`)
    } catch {
      setError(true)
      setPending(false)
      return
    }

    // Un 401 no significa "no tenés sesión": lo más común es abrir la app
    // después de horas con el access token vencido pero el refresh token vivo.
    // Antes esto no se veía porque el proxy refrescaba antes de que la página
    // cargara; sin él, el primer /bootstrap sale con el token viejo. Borrar el
    // snapshot acá dejaba al usuario sin sus datos por un token de una hora.
    if (res.status === 401) {
      const { data } = await createClient().auth.refreshSession()
      if (data.session) {
        try {
          res = await fetch(`/api/finanzas/bootstrap?${qs}`)
        } catch {
          setError(true)
          setPending(false)
          return
        }
      }
    }

    if (res.status === 401) {
      // Reintentado y sigue sin sesión: ahora sí está muerta, y lo cacheado no
      // le pertenece a quien esté por entrar.
      clearSnapshots()
      setError(true)
      setPending(false)
      return
    }
    if (!res.ok) {
      setError(true)
      setPending(false)
      return
    }

    const data = await res.json()

    // Si la cookie no se pudo leer al montar, el id del server es la red de
    // seguridad: el snapshot nunca se guarda sin saber de quién es.
    if (typeof data.uid === 'string') uid.current = data.uid

    // Las dos consultas que /bootstrap ya resolvió, guardadas con la clave con
    // la que las pantallas las van a buscar.
    const tx: Record<string, TxResult> = {}
    if (data.tx?.month) tx[txKey(monthQuery(range))] = data.tx.month
    if (data.tx?.recent) tx[txKey({ limit: String(RECENT) })] = data.tx.recent

    const next: Omit<Snapshot, 'at'> = {
      accounts: data.accounts ?? [],
      total_usd: data.total_usd ?? 0,
      rates: data.rates ?? {},
      rate_list: data.rate_list ?? [],
      categories: data.categories ?? [],
      people: data.people ?? [],
      shared: data.shared ?? EMPTY_SHARED,
      recurring: data.recurring ?? EMPTY_RECURRING,
      plans: data.plans ?? [],
      tx,
    }

    // Tras una mutación lo cacheado quedó viejo. No se tira: sube la versión, y
    // cada entrada vieja se sigue mostrando mientras se revalida. Vaciar el mapa
    // hacía que guardar un gasto dejara la lista en blanco un instante — el
    // mismo parpadeo que este sprint vino a sacar.
    if (mutation) {
      if (txCache.size > MAX_ENTRIES) txCache.clear()
      cacheVersion += 1
    }

    apply(next, cacheVersion)
    writeSnapshot(uid.current, next)
    setError(false)
    setLoading(false)
    setPending(false)
    setVersion(cacheVersion)
  }, [apply])

  // Una sola vez, aunque StrictMode monte el provider dos veces en desarrollo:
  // el segundo pase contaría como mutación y tiraría el caché recién llenado.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void reload()
  }, [reload])

  const value = useMemo<FinanzasData>(
    () => ({
      accounts, categories, rates, rateList, people, shared, recurring, plans, totalUsd,
      loading, stale: pending && !loading, pending, error,
      reload, version, seed, hidden, toggleHidden, userName,
    }),
    [accounts, categories, rates, rateList, people, shared, recurring, plans, totalUsd,
     loading, pending, error, reload, version, seed, hidden, toggleHidden, userName],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFinanzas(): FinanzasData {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFinanzas debe usarse dentro de <FinanzasProvider>')
  return ctx
}

/** La query del mes que comparten la Home y Movimientos sin filtros. */
export function monthQuery(range: { from: string; to: string }) {
  return { from: range.from, to: range.to, limit: MONTH_LIMIT }
}

/**
 * Movimientos con caché stale-while-revalidate. `loading` solo es true cuando
 * no hay absolutamente nada para esa consulta: si ya hay algo cacheado se
 * muestra mientras se revalida, que es lo que hace que navegar se sienta
 * instantáneo.
 */
export function useTransactions(params: Record<string, string | undefined>): {
  data: TxResult
  loading: boolean
} {
  const { version, pending, seed } = useFinanzas()
  const key = txKey(params)

  /*
    El estado arranca vacío SIEMPRE, aunque el caché ya tenga la respuesta.

    `txCache` es un Map de módulo: leerlo desde el inicializador del useState lo
    metía dentro del render, y el provider —que vive en el layout, o sea en otro
    límite de hidratación— alcanzaba a llenarlo antes de que la página hidratara.
    Resultado: el server había pintado un esqueleto y el cliente pintaba el
    número, React lo cantaba como hydration mismatch y tiraba el árbol entero
    para volver a generarlo. Empezar vacío y leer el caché en el efecto de layout
    mantiene el primer render idéntico al HTML del servidor, y como el efecto
    corre antes del pintado tampoco se ve ningún parpadeo.
  */
  const [data, setData] = useState<TxResult>(EMPTY)
  const [loading, setLoading] = useState(true)

  useIsoLayoutEffect(() => {
    let cancelled = false

    const entry = txCache.get(key)
    if (entry) {
      setData(entry.data)
      setLoading(false)
    } else {
      setData(EMPTY)
      setLoading(true)
    }

    // Ya está fresca para esta versión: nada que pedir.
    if (entry && entry.v === version) return
    // /bootstrap está en vuelo y puede traer justo esta consulta. Pedirla ahora
    // sería duplicar el viaje que ya se está haciendo.
    if (pending) return

    void (async () => {
      const res = await fetch(`/api/finanzas/transactions?${key}`)
      if (cancelled) return
      const fresh: TxResult = res.ok ? await res.json() : EMPTY
      if (cancelled) return
      txCache.set(key, { v: version, data: fresh })
      setData(fresh)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [key, version, pending, seed])

  return { data, loading }
}
