import type { AccountWithBalance, Category, PersonWithDebt, RateMap, RecurringSummary, SharedSummary } from './types'
import type { RateDetail } from './rates'
import type { TxResult } from './load'

/**
 * La última respuesta de /bootstrap, guardada en el dispositivo.
 *
 * Sin esto, abrir la app mostraba $0 durante todo lo que tardara la red — y $0
 * no es "todavía no sé", es un número falso. Con el snapshot, el patrimonio que
 * aparece en el primer frame es el real de la última vez, y el dato fresco lo
 * corrige cuando llega. Es el mismo trato que hace una app de banco.
 */
export interface Snapshot {
  accounts: AccountWithBalance[]
  total_usd: number
  rates: RateMap
  rate_list: RateDetail[]
  categories: Category[]
  people: PersonWithDebt[]
  shared: SharedSummary
  recurring: RecurringSummary
  /** Las consultas de movimientos ya resueltas, por query string. */
  tx: Record<string, TxResult>
  /** Cuándo se guardó, en ms. */
  at: number
}

const PREFIX = 'fz:snap:'
/** Sube cuando cambia la forma del snapshot: descarta los viejos sin migrarlos. */
const VERSION = 2
/** Un patrimonio de hace más de una semana ya no informa nada: mejor el esqueleto. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Tope de tamaño. Serializar de más bloquea el hilo principal en cada guardado. */
const MAX_BYTES = 512 * 1024

function keyFor(uid: string): string {
  return `${PREFIX}${VERSION}:${uid}`
}

/* ─── Identidad ────────────────────────────────────────────────────────────
   El snapshot se guarda por usuario. Sin eso, dos cuentas en el mismo
   navegador se verían el patrimonio de la otra durante el primer frame —
   RLS protege los datos reales, pero no un caché mal llaveado. */

function b64ToText(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, '='))
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** `sb-<ref>-auth-token`, y sus trozos `.0`, `.1`… cuando no entra en una cookie. */
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.(\d+))?$/

/**
 * El `sub` del JWT, leído de la cookie de sesión sin tocar la red.
 *
 * Tiene que ser síncrono: si hubiera que esperar a `getSession()`, el snapshot
 * llegaría después del primer frame y no habría servido de nada.
 *
 * La cookie se busca por forma y no por nombre exacto para no depender de tener
 * la URL del proyecto disponible en el bundle del navegador.
 */
export function currentUserId(): string | null {
  try {
    let entera = ''
    const trozos: { i: number; v: string }[] = []

    for (const cookie of document.cookie.split('; ')) {
      const corte = cookie.indexOf('=')
      if (corte < 0) continue

      const match = AUTH_COOKIE.exec(cookie.slice(0, corte))
      if (!match) continue

      const valor = decodeURIComponent(cookie.slice(corte + 1))
      if (match[1] === undefined) entera = valor
      else trozos.push({ i: Number(match[1]), v: valor })
    }

    const raw = entera || trozos.sort((a, b) => a.i - b.i).map(t => t.v).join('')
    if (!raw) return null

    const json = raw.startsWith('base64-') ? b64ToText(raw.slice(7)) : raw
    const token = JSON.parse(json)?.access_token
    if (typeof token !== 'string') return null

    const sub = JSON.parse(b64ToText(token.split('.')[1]))?.sub
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

/* ─── Lectura y escritura ──────────────────────────────────────────────────── */

export function readSnapshot(uid: string | null): Snapshot | null {
  if (!uid) return null
  try {
    const raw = window.localStorage.getItem(keyFor(uid))
    if (!raw) return null

    const snap = JSON.parse(raw) as Snapshot
    if (!snap || typeof snap.at !== 'number' || Date.now() - snap.at > MAX_AGE_MS) {
      window.localStorage.removeItem(keyFor(uid))
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function writeSnapshot(uid: string | null, snap: Omit<Snapshot, 'at'>): void {
  if (!uid) return
  try {
    const raw = JSON.stringify({ ...snap, at: Date.now() })
    if (raw.length > MAX_BYTES) return
    window.localStorage.setItem(keyFor(uid), raw)
  } catch {
    // Cuota llena o modo privado: el snapshot es una mejora, nunca un requisito.
  }
}

/** Borra todos los snapshots. Se llama cuando el server dice que no hay sesión. */
export function clearSnapshots(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) window.localStorage.removeItem(k)
  } catch {}
}
