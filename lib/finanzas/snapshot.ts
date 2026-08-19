import type { AccountWithBalance, Category, PersonWithDebt, RateMap, RecurringSummary, SharedSummary } from './types'
import type { RateDetail } from './rates'
import type { TxResult } from './load'
import { readSessionClaims } from '../session-claims'

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

/** El `sub` de la sesión. Envuelve a readSessionClaims() para no cambiar a los
    llamadores, que solo necesitan saber de quién es el snapshot. */
export function currentUserId(): string | null {
  return readSessionClaims()?.sub ?? null
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
