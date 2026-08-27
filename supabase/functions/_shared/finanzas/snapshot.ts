// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { AccountWithBalance, BudgetsPayload, Category, DebtPlanWithCuotas, PasanakuWithState, PersonWithDebt, RateMap, RecurringSummary, SharedSummary } from './types.ts'
import type { RateDetail } from './rates.ts'
import type { SavingsGoalsPayload, TxResult } from './load.ts'

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
  /** Los planes de pago con sus cuotas (Sprint 4). */
  plans: DebtPlanWithCuotas[]
  /** Los pasanaku con su estado derivado (Sprint 5). */
  pasanaku: PasanakuWithState[]
  /** El progreso de presupuesto del período vigente, más los cierres de mes
      que quedaron sin responder (Sprint 6). El quick-add lo necesita en
      cualquier pantalla para poder bloquear un gasto. */
  budgets: BudgetsPayload
  /** Los ahorros con su saldo derivado, más el período pendiente de repartir
      si hay alguno (Sprint 7). El quick-add lo necesita en cualquier
      pantalla para el picker de "a qué ahorro corresponde". */
  savings: SavingsGoalsPayload
  /** Meses (`'2026-08'`) con al menos un movimiento, del más reciente al más
      viejo — puebla el filtro de mes de Movimientos. */
  months: string[]
  /** Las consultas de movimientos ya resueltas, por query string. */
  tx: Record<string, TxResult>
  /** Cuándo se guardó, en ms. */
  at: number
}

const PREFIX = 'fz:snap:'
/** Sube cuando cambia la forma del snapshot: descarta los viejos sin migrarlos.
 *  9 = Sprint 8, la clave pasa a incluir el perfil. */
const VERSION = 9
/** Un patrimonio de hace más de una semana ya no informa nada: mejor el esqueleto. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Tope de tamaño. Serializar de más bloquea el hilo principal en cada guardado. */
const MAX_BYTES = 512 * 1024

/**
 * La clave incluye el perfil (Sprint 8).
 *
 * Sin esto, cambiar de perfil mostraría el patrimonio del anterior en el primer
 * frame — exactamente el número falso que este archivo existe para evitar. El
 * `VERSION` que subió a 9 descarta de paso los snapshots viejos, que no sabrían
 * a qué perfil pertenecen.
 *
 * `profileId` puede faltar en el primer arranque, antes de que /bootstrap diga
 * cuál es el activo: ahí se usa un cajón propio en vez de mezclarlo con el de
 * un perfil real.
 */
function keyFor(uid: string, profileId: string | null): string {
  return `${PREFIX}${VERSION}:${uid}:${profileId ?? 'pendiente'}`
}

/* ─── Lectura y escritura ──────────────────────────────────────────────────── */

export function readSnapshot(uid: string | null, profileId: string | null = null): Snapshot | null {
  if (!uid) return null
  try {
    const raw = window.localStorage.getItem(keyFor(uid, profileId))
    if (!raw) return null

    const snap = JSON.parse(raw) as Snapshot
    if (!snap || typeof snap.at !== 'number' || Date.now() - snap.at > MAX_AGE_MS) {
      window.localStorage.removeItem(keyFor(uid, profileId))
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function writeSnapshot(uid: string | null, profileId: string | null, snap: Omit<Snapshot, 'at'>): void {
  if (!uid) return
  try {
    const raw = JSON.stringify({ ...snap, at: Date.now() })
    if (raw.length > MAX_BYTES) return
    window.localStorage.setItem(keyFor(uid, profileId), raw)
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
