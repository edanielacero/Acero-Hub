import type {
  Currency, Person, RecentSplit, Split, SplitInput, SplitState, SplitWithContext,
  Transaction, TxType,
} from './types'
import { round2, roundFor } from './money'
import { decimalsFor } from './money'

export interface SplitValidation {
  ok: boolean
  error?: string
}

/**
 * Redondeo hacia abajo a la precisión de la moneda.
 *
 * El epsilon relativo no es paranoia: `3.30 / 3` da `1.0999999999999999` en
 * coma flotante, y un floor crudo lo bajaría a `1.09`, regalando un centavo por
 * persona en cada división que no cierra exacta en binario.
 */
export function floorTo(n: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency)
  const scaled = n * factor
  const eps = Math.abs(scaled) * 1e-9 + 1e-9
  return Math.floor(scaled + eps) / factor
}

/**
 * División pareja: **el que paga se come los centavos** (§4.2 del sprint).
 *
 * `participants` te incluye a vos. Cada una de las otras personas recibe la
 * parte redondeada hacia abajo, y tu parte es el resto.
 *
 *   Bs 350 entre 3  →  Ana 116.66 · Juan 116.66 · vos 116.68
 *
 * Redondear hacia arriba daría `116.67 × 3 = 350.01`: un centavo que no existe
 * y que rompería la invariante `Σ partes ≤ monto`. Hacia abajo, el sobrante
 * queda del lado del que puso la plata, que es el único reparto donde los
 * números cierran y donde el error, si lo hay, va en tu contra.
 */
export function evenSplit(
  amount: number,
  participants: number,
  currency: Currency,
): { shares: number[]; mine: number } {
  if (!Number.isFinite(amount) || amount <= 0 || participants < 2) {
    return { shares: [], mine: roundFor(Math.max(amount, 0), currency) }
  }

  const share = floorTo(amount / participants, currency)
  const shares = Array.from({ length: participants - 1 }, () => share)
  const mine = roundFor(amount - share * (participants - 1), currency)
  return { shares, mine }
}

/** Tu parte de un gasto compartido: lo que sobra después del reparto. */
export function myShare(amount: number, splits: { amount: number }[], currency: Currency): number {
  return roundFor(amount - splits.reduce((s, x) => s + x.amount, 0), currency)
}

/**
 * Estado derivado de los dos punteros. No hay columna `status` en la base a
 * propósito: un enum guardado puede desincronizarse del hecho que describe,
 * dos punteros no.
 */
export function splitState(split: Pick<Split, 'settled_tx_id' | 'waived_at'>): SplitState {
  if (split.settled_tx_id) return 'cobrado'
  if (split.waived_at) return 'condonado'
  return 'pendiente'
}

export function isOpen(split: Pick<Split, 'settled_tx_id' | 'waived_at'>): boolean {
  return splitState(split) === 'pendiente'
}

/**
 * El monto en USD de una parte se congela con el `exchange_rate` **del gasto
 * padre**, nunca con la tasa de hoy.
 *
 * Si cada parte hiciera su propia conversión, un gasto de Bs 350 registrado a
 * 6.96 y repartido tres días después a 7.20 daría partes que no suman al total,
 * y "cuánto es realmente mío" quedaría mal por la diferencia. La parte de un
 * gasto tiene que estar congelada con la misma foto que el gasto.
 */
export function freezeSplitUsd(amount: number, parentExchangeRate: number): number {
  return round2(amount * parentExchangeRate)
}

/** Normaliza un nombre para comparar: es la misma regla que el índice único. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Valida un reparto contra su gasto. Misma jerarquía que `validateInput`: la
 * base es la última línea de defensa, acá el mensaje se puede leer.
 */
export function validateSplits(
  splits: SplitInput[] | undefined | null,
  type: TxType,
  amount: number,
  currency: Currency,
  /** Las personas del usuario, para cruzar los que llegan por id con los que llegan por nombre. */
  knownPeople?: { id: string; name: string }[],
): SplitValidation {
  if (!splits || splits.length === 0) return { ok: true }

  if (type !== 'gasto') {
    return { ok: false, error: 'Solo un gasto se puede repartir entre personas' }
  }

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  // Los nombres de las personas ya conocidas, para poder detectar la fila que
  // llega por id y la que llega por nombre apuntando a la MISMA persona.
  const nameById = new Map(
    (knownPeople ?? []).map(p => [p.id, normalizeName(p.name)] as const),
  )

  for (const s of splits) {
    const id = s.person_id?.trim()
    const name = s.person_name?.trim()

    if (!id && !name) return { ok: false, error: 'Cada parte necesita una persona' }

    // Dos filas de la misma persona chocarían contra `unique (transaction_id,
    // person_id)` con un error de Postgres ilegible. Mejor acá.
    const key = id ? nameById.get(id) : normalizeName(name!)

    if (id) {
      if (seenIds.has(id)) return { ok: false, error: 'Una persona no puede aparecer dos veces en el reparto' }
      seenIds.add(id)
    }
    // La clave por nombre es la que cruza los dos caminos: una fila con
    // `person_id` de Ana y otra con `person_name: "Ana"` son la misma persona,
    // y sin esto solo se enteraba la base.
    if (key) {
      if (seenNames.has(key)) {
        return { ok: false, error: `${name ?? 'Esa persona'} aparece dos veces en el reparto`.trim() }
      }
      seenNames.add(key)
    }

    if (typeof s.amount !== 'number' || !Number.isFinite(s.amount) || s.amount <= 0) {
      return { ok: false, error: 'Cada parte tiene que ser mayor a cero' }
    }
  }

  // El reparto PUEDE superar al gasto, y es a propósito: pagás el plan de
  // Spotify y les cobrás un poco más a los tres. Tu parte pasa a ser negativa,
  // que es la forma correcta de decir "gané algo". Al revés también vale:
  // repartir de menos es invitar vos una parte.
  //
  // La única cota es la del sentido común, y la pone `maxTotal` desde la ruta
  // cuando hace falta. Acá no se topea nada más.

  return { ok: true }
}

/**
 * Tu parte de un gasto compartido, con su lectura.
 *
 * Si repartiste más de lo que costó, `mine` queda negativo: no es un error, es
 * la ganancia. Devolver el signo crudo y dejar que la UI lo interprete evita
 * que cada pantalla invente su propia convención.
 */
export function shareBreakdown(
  amount: number,
  splits: { amount: number }[],
  currency: Currency,
): { mine: number; kind: 'pagas' | 'ganas' | 'exacto' } {
  const mine = myShare(amount, splits, currency)
  if (mine > 0) return { mine, kind: 'pagas' }
  if (mine < 0) return { mine, kind: 'ganas' }
  return { mine: 0, kind: 'exacto' }
}

/* ─── Rollups ──────────────────────────────────────────────────────────────
   Las tres cifras de §4.4 del sprint. La distinción entre ellas es la razón de
   ser de la feature: sin `gasto_real`, pagar Spotify completo se vería como
   gastar $11.99 todos los meses. */

/** Solo lo que salió y no vuelve: `gasto` de consumo. */
export function gastoBrutoUsd(txs: Transaction[]): number {
  return round2(
    txs
      .filter(t => t.type === 'gasto' && t.flow_type !== 'movimiento')
      .reduce((s, t) => s + t.amount_usd, 0),
  )
}

/**
 * Lo que de ese bruto le corresponde a otros.
 *
 * Incluye los **pendientes**: la parte de Ana no es tu gasto, te la haya pagado
 * o no. Que pague es un problema de cobranza, no de gasto — si la app esperara
 * al cobro, el gasto real del mes cambiaría solo, semanas después, sin que vos
 * hayas hecho nada.
 *
 * Excluye los **condonados**: perdonarle los $3 a Ana es exactamente decidir
 * gastarlos vos, y por eso vuelven al gasto real.
 */
export function repartidoUsd(txs: Transaction[]): number {
  return round2(
    txs
      .filter(t => t.type === 'gasto' && t.flow_type !== 'movimiento')
      .flatMap(t => t.splits ?? [])
      .filter(s => !s.waived_at)
      .reduce((s, x) => s + x.amount_usd, 0),
  )
}

/** Lo que realmente te costó: bruto menos lo que le toca a otros. */
export function gastoRealUsd(txs: Transaction[]): number {
  return round2(gastoBrutoUsd(txs) - repartidoUsd(txs))
}

/**
 * Lo que te deben, sin filtrar por mes: es un saldo acumulado, no un flujo.
 * Una deuda de marzo sigue siendo una deuda en agosto.
 */
export function porCobrarUsd(splits: Pick<Split, 'settled_tx_id' | 'waived_at' | 'amount_usd'>[]): number {
  return round2(splits.filter(isOpen).reduce((s, x) => s + x.amount_usd, 0))
}

/** Días transcurridos entre dos fechas ISO, sin pasar por husos horarios. */
export function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

/* ─── Agrupado para la pantalla de Compartidos ─────────────────────────────── */

/** Agrupa las deudas abiertas por persona, de la que más debe a la que menos. */
export function groupByPerson(splits: SplitWithContext[], todayISO: string) {
  const map = new Map<string, SplitWithContext[]>()
  for (const s of splits) {
    const list = map.get(s.person_id)
    if (list) list.push(s)
    else map.set(s.person_id, [s])
  }

  return [...map.values()]
    .map(items => {
      const sorted = [...items].sort((a, b) => (a.transaction.date < b.transaction.date ? -1 : 1))
      const oldest = sorted[0]?.transaction.date
      return {
        person: sorted[0].person,
        open_usd: round2(sorted.reduce((s, x) => s + x.amount_usd, 0)),
        oldest_days: oldest ? daysBetween(oldest, todayISO) : null,
        splits: sorted,
      }
    })
    .sort((a, b) => b.open_usd - a.open_usd)
}

/**
 * Los últimos repartos distintos, para el "Repetir reparto" del quick-add.
 *
 * Es el sustituto barato de las plantillas del Sprint 8: para Spotify y
 * TradingView — los dos casos reales de hoy — resuelve el problema con un tap
 * y cero tablas nuevas. Se deriva de los gastos que la pantalla ya trajo.
 */
export function recentSplits(
  txs: (Transaction & { splits?: Split[] })[],
  peopleById: Map<string, Person>,
  limit = 3,
): RecentSplit[] {
  const out: RecentSplit[] = []
  const seen = new Set<string>()

  for (const tx of txs) {
    const splits = tx.splits ?? []
    if (splits.length === 0) continue

    const ids = splits.map(s => s.person_id).sort()
    const key = ids.join('|')
    if (seen.has(key)) continue

    const people = ids.map(id => peopleById.get(id)).filter((p): p is Person => Boolean(p))
    if (people.length !== ids.length) continue

    seen.add(key)
    out.push({
      label: tx.description?.trim() || 'Sin descripción',
      people,
      even: new Set(splits.map(s => roundFor(s.amount, tx.currency))).size === 1,
    })
    if (out.length >= limit) break
  }

  return out
}
