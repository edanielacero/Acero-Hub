'use client'

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
} from 'react'
import type { AccentKey, AccountWithBalance, BudgetsPayload, Category, DebtPlanWithCuotas, PasanakuWithState, PersonWithDebt, Profile, RateMap, RecurringSummary, SharedSummary } from '@/lib/finanzas/types'
import type { RateDetail } from '@/lib/finanzas/rates'
import type { SavingsGoalsPayload, TxResult } from '@/lib/finanzas/load'
import { CURRENCY_META, RATED_CURRENCIES } from '@/lib/finanzas/types'
import { monthRange, todayISO } from '@/lib/finanzas/transactions'
import { clearSnapshots, readSnapshot, writeSnapshot, type Snapshot } from '@/lib/finanzas/snapshot'
import { readSessionClaims } from '@/lib/session-claims'
import { createClient } from '@/lib/supabase'
import { readProfilePref, writeProfilePref } from './profile-pref'
import { fzFetch } from './fz-fetch'

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
  /** Los pasanaku con su estado derivado (aportes, si ya recibiste tu turno). */
  pasanaku: PasanakuWithState[]
  /** Presupuesto del período vigente + cierres de mes sin responder (Sprint 6). */
  budgets: BudgetsPayload
  /** Ahorros con su saldo derivado + el período pendiente de repartir, si
      hay alguno (Sprint 7). */
  savings: SavingsGoalsPayload
  /** Meses (`'2026-08'`) con al menos un movimiento, del más reciente al más
      viejo — puebla el filtro de mes de Movimientos. */
  months: string[]
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

  /* ── Perfiles (Sprint 8) ── */
  /** Los perfiles del usuario, para el selector. Solo los no archivados. */
  profiles: Profile[]
  /** El id del perfil activo. Null hasta que /bootstrap lo confirme. */
  profileId: string | null
  /** El acento del perfil activo — ya aplicado sobre `#fz-root`. */
  accent: AccentKey
  /**
   * Cambia de perfil sin recargar la página: repinta el acento, cambia la
   * clave del snapshot y vuelve a pedir /bootstrap.
   */
  switchProfile: (id: string, accentHint?: AccentKey) => void
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

const EMPTY_BUDGETS: BudgetsPayload = {
  general: null, categories: [], pending_closures: [], categories_without_line: [],
}

const EMPTY_SAVINGS: SavingsGoalsPayload = {
  goals: [], pending_period: null, pending_surplus_usd: 0, available_funds: [],
  budget_reserved_usd: 0, free_usd: 0, savable_usd: 0, budget_pending_closures: 0,
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
  const [pasanaku, setPasanaku] = useState<PasanakuWithState[]>([])
  const [budgets, setBudgets] = useState<BudgetsPayload>(EMPTY_BUDGETS)
  const [savings, setSavings] = useState<SavingsGoalsPayload>(EMPTY_SAVINGS)
  const [months, setMonths] = useState<string[]>([])
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

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profileId, setProfileId] = useState<string | null>(null)
  const [accent, setAccent] = useState<AccentKey>('verde')
  // El perfil que va en el próximo /bootstrap. En un ref además del estado
  // porque `reload` lo lee y no debe recrearse cada vez que cambia.
  const wantedProfile = useRef<string | null>(null)

  const apply = useCallback((snap: Omit<Snapshot, 'at'>, v: number) => {
    setAccounts(snap.accounts)
    setCategories(snap.categories)
    setRates(snap.rates)
    setRateList(snap.rate_list)
    setPeople(snap.people)
    setShared(snap.shared)
    setRecurring(snap.recurring ?? EMPTY_RECURRING)
    setPlans(snap.plans ?? [])
    setPasanaku(snap.pasanaku ?? [])
    setBudgets(snap.budgets ?? EMPTY_BUDGETS)
    setSavings(snap.savings ?? EMPTY_SAVINGS)
    setMonths(snap.months ?? [])
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

    // El perfil de este dispositivo, antes de tocar la red: de él dependen la
    // clave del snapshot y el color del primer frame.
    const pref = readProfilePref()
    wantedProfile.current = pref.id
    setProfileId(pref.id)
    setAccent(pref.accent)

    const snap = readSnapshot(uid.current, pref.id)
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

    // Con qué perfil sale ESTE request. Si al volver la respuesta el usuario ya
    // cambió a otro, lo que trae es de un cajón que ya no está mirando: se
    // descarta. Sin esta marca, una respuesta lenta del perfil anterior podía
    // aterrizar después de la del nuevo y dejar la plata de uno bajo el nombre
    // del otro — con el localStorage apuntando al equivocado, así que la
    // próxima apertura heredaba el error.
    const pedido = wantedProfile.current

    const range = monthRange()
    const qs = new URLSearchParams({
      from: range.from, to: range.to, limit: MONTH_LIMIT, recent: String(RECENT),
      // El día del usuario, no el del servidor: de él depende si un fijo está
      // vencido o todavía no.
      today: todayISO(),
    })
    // El perfil activo de este dispositivo. Si no hay (primer arranque) o si es
    // inválido, el server cae al default en silencio y lo dice en la respuesta.
    if (wantedProfile.current) qs.set('profile', wantedProfile.current)

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
      // Un fallo del perfil anterior no debe pintar de rojo el que se está
      // mirando ahora.
      if (wantedProfile.current === pedido) setError(true)
      setPending(false)
      return
    }

    const data = await res.json()

    // Llegó tarde: el usuario ya está en otro perfil.
    if (wantedProfile.current !== pedido) return

    // Si la cookie no se pudo leer al montar, el id del server es la red de
    // seguridad: el snapshot nunca se guarda sin saber de quién es.
    if (typeof data.uid === 'string') uid.current = data.uid

    // El perfil que el server resolvió puede NO ser el que se pidió: un id
    // archivado, borrado desde otro dispositivo o de otro usuario cae al
    // default. Por eso el activo manda sobre lo que había en localStorage.
    const activos: Profile[] = (data.profiles ?? []).filter((p: Profile) => !p.archived)
    setProfiles(activos)
    if (typeof data.profile === 'string') {
      const actual = (data.profiles ?? []).find((p: Profile) => p.id === data.profile)
      const nuevoAccent: AccentKey = actual?.accent ?? 'verde'
      wantedProfile.current = data.profile
      setProfileId(data.profile)
      setAccent(nuevoAccent)
      writeProfilePref({ id: data.profile, accent: nuevoAccent })
    }

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
      pasanaku: data.pasanaku ?? [],
      budgets: data.budgets ?? EMPTY_BUDGETS,
      savings: data.savings ?? EMPTY_SAVINGS,
      months: data.months ?? [],
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
    writeSnapshot(uid.current, wantedProfile.current, next)
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

  /**
   * Cambia de perfil sin recargar la página.
   *
   * El acento se pinta de inmediato desde lo que ya sabemos del perfil, sin
   * esperar a /bootstrap: es el color el que dice en cuál estás, y medio
   * segundo del color anterior es medio segundo diciendo algo falso.
   *
   * Los datos, en cambio, sí esperan. Se marca `loading` para que las pantallas
   * pinten su esqueleto en vez de mostrar los números del perfil anterior como
   * si fueran de este — mismo criterio que el snapshot: un número de otro
   * perfil no es "todavía no sé", es un número equivocado.
   */
  const switchProfile = useCallback((id: string, accentHint?: AccentKey) => {
    if (id === wantedProfile.current) return

    // `accentHint` existe para el perfil recién creado.
    //
    // `profiles` acá es el de ESTA renderización. Quien acaba de crear un perfil
    // y llama a esto en el mismo handler todavía tiene la lista vieja capturada
    // en su closure, así que el perfil nuevo no está y el `find` fallaba: el
    // switch se descartaba en silencio y el usuario quedaba en el perfil
    // anterior creyendo que estaba en el nuevo. Con el color en la mano no hace
    // falta encontrarlo en la lista — /bootstrap confirma el resto.
    const destino = profiles.find(p => p.id === id)
    if (!destino && !accentHint) return

    const accentNuevo = destino?.accent ?? accentHint!
    wantedProfile.current = id
    setProfileId(id)
    setAccent(accentNuevo)
    writeProfilePref({ id, accent: accentNuevo })

    // Lo cacheado es del perfil anterior: no sirve para este.
    txCache.clear()
    cacheVersion += 1

    const snap = readSnapshot(uid.current, id)
    if (snap) {
      apply(snap, FROM_SNAPSHOT)
    } else {
      setLoading(true)
    }
    void reload()
  }, [profiles, apply, reload])

  // El acento vive en `#fz-root`, el mismo nodo donde theme.css define todos
  // los tokens. Se escribe por efecto y no en el JSX porque el provider no
  // renderiza ese div — lo hace el layout, que es un server component.
  //
  // **Layout effect, no effect.** `useEffect` corre DESPUÉS del primer paint,
  // así que la app se pintaba un frame en verde antes de tomar el color del
  // perfil. No es solo un parpadeo: durante ese frame el color está diciendo
  // que estás en otro perfil, y el color es justamente lo que evita registrar
  // un movimiento donde no va.
  useIsoLayoutEffect(() => {
    document.getElementById('fz-root')?.setAttribute('data-accent', accent)
  }, [accent])

  const value = useMemo<FinanzasData>(
    () => ({
      accounts, categories, rates, rateList, people, shared, recurring, plans, pasanaku, budgets, savings, months, totalUsd,
      loading, stale: pending && !loading, pending, error,
      reload, version, seed, hidden, toggleHidden, userName,
      profiles, profileId, accent, switchProfile,
    }),
    [accounts, categories, rates, rateList, people, shared, recurring, plans, pasanaku, budgets, savings, months, totalUsd,
     loading, pending, error, reload, version, seed, hidden, toggleHidden, userName,
     profiles, profileId, accent, switchProfile],
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
 * El progreso de presupuesto de una categoría, si tiene línea propia — lo
 * que el quick-add necesita para decidir si un gasto nuevo se bloquea
 * (§4.6 de sprint_6_presupuesto.md). El tope general no se resuelve acá
 * porque nunca bloquea: no hace falta buscarlo para esta decisión puntual.
 */
export function budgetLineFor(budgets: BudgetsPayload, categoryId: string | null) {
  if (!categoryId) return undefined
  return budgets.categories.find(c => c.category_ids.includes(categoryId))
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
      const res = await fzFetch(`/api/finanzas/transactions?${key}`)
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
