// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type {
  Currency, Debt, DebtInput, DebtState, DebtWithContext, Transaction, TxType,
} from './types.ts'
import { round2, roundFor } from './money.ts'
import { decimalsFor } from './money.ts'

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
export function debtState(split: Pick<Debt, 'settled_tx_id' | 'waived_at'>): DebtState {
  if (split.settled_tx_id) return 'cobrado'
  if (split.waived_at) return 'perdonado'
  return 'pendiente'
}

export function isOpen(split: Pick<Debt, 'settled_tx_id' | 'waived_at'>): boolean {
  return debtState(split) === 'pendiente'
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
export function freezeDebtUsd(amount: number, parentExchangeRate: number): number {
  return round2(amount * parentExchangeRate)
}

/** Normaliza un nombre para comparar: es la misma regla que el índice único. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
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
 * Lo que de ese bruto le corresponde a otros — solo la parte que es
 * RECUPERAR costo real, nunca el margen.
 *
 * Incluye los **pendientes**: la parte de Ana no es tu gasto, te la haya pagado
 * o no. Que pague es un problema de cobranza, no de gasto — si la app esperara
 * al cobro, el gasto real del mes cambiaría solo, semanas después, sin que vos
 * hayas hecho nada.
 *
 * Excluye los **perdonados**: perdonarle los $3 a Ana es exactamente decidir
 * gastarlos vos, y por eso vuelven al gasto real.
 *
 * Suma `principal_usd`, no `amount_usd`: si repartiste por encima de lo que
 * pagaste, ese margen no es costo de nadie — es ganancia, y se cuenta recién
 * cuando de verdad la cobrás (§ debts/settle), no acá. Sumar `amount_usd`
 * dejaría el gasto real negativo antes de haber cobrado un centavo.
 */
export function repartidoUsd(txs: Transaction[]): number {
  return round2(
    txs
      .filter(t => t.type === 'gasto' && t.flow_type !== 'movimiento')
      .flatMap(t => t.debts ?? [])
      .filter(s => !s.waived_at)
      .reduce((s, x) => s + x.principal_usd, 0),
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
export function porCobrarUsd(splits: Pick<Debt, 'settled_tx_id' | 'waived_at' | 'amount_usd'>[]): number {
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

/**
 * De las deudas abiertas, cuáles ameritan la alerta de "Te deben" en la
 * Home. Una suelta (`plan_installment_no` null) cuenta siempre — no tiene
 * fecha propia, así que no hay "cuándo" que esperar. Una cuota de un plan sí
 * tiene la suya (`incurred_on` es la fecha que le tocaba según el calendario
 * del plan, ver `installmentDate` en plans.ts): solo cuenta si ya venció o
 * si vence dentro de `days` días, y en ese caso pesa por SU monto propio —
 * quien llame a esto suma `amount_usd` de lo que devuelva, nunca el
 * pendiente total del plan (feedback del usuario: no adelantar cuotas que
 * todavía faltan).
 */
export function debtsNeedingAttention<T extends Pick<DebtWithContext, 'plan_installment_no' | 'incurred_on'>>(
  debts: T[], todayISO: string, days = 7,
): T[] {
  return debts.filter(d => d.plan_installment_no == null || daysBetween(todayISO, d.incurred_on) <= days)
}

/* ─── Agrupado para la pantalla de Compartidos ─────────────────────────────── */

/** Agrupa las deudas abiertas por persona, de la que más debe a la que menos. */
export function groupByPerson(debts: DebtWithContext[], todayISO: string) {
  const map = new Map<string, DebtWithContext[]>()
  for (const s of debts) {
    const list = map.get(s.person_id)
    if (list) list.push(s)
    else map.set(s.person_id, [s])
  }

  return [...map.values()]
    .map(items => {
      const sorted = [...items].sort((a, b) => (a.incurred_on < b.incurred_on ? -1 : 1))
      const oldest = sorted[0]?.incurred_on
      return {
        person: sorted[0].person,
        open_usd: round2(sorted.reduce((s, x) => s + x.amount_usd, 0)),
        oldest_days: oldest ? daysBetween(oldest, todayISO) : null,
        debts: sorted,
      }
    })
    .sort((a, b) => b.open_usd - a.open_usd)
}

/**
 * Cómo se llama una deuda en pantalla.
 *
 * Si vino de un gasto, la describe el gasto. Si es suelta, el concepto que
 * escribió el usuario — que por eso es obligatorio en ese caso.
 */
export function debtLabel(d: Pick<DebtWithContext, 'concept' | 'transaction'>): string {
  return d.transaction?.description?.trim() || d.concept?.trim() || 'Sin descripción'
}

/**
 * El nombre de una deuda **con el número de cuota recalculado**.
 *
 * El `concept` de una cuota trae el ordinal horneado al crearse
 * (`"Préstamo a Ana · cuota 2/4"`), y al **regenerar** un plan ese número
 * queda viejo: las cuotas nuevas se numeran desde el máximo anterior
 * (`cuota 5`, `cuota 6`…) mientras la lista del plan las muestra por su
 * posición actual (`Cuota 3/6`). El mismo pago decía dos cosas distintas
 * según la pantalla — en el plan una, y al tocar "Cobrar" otra.
 *
 * Acá el ordinal sale siempre de la posición en la lista viva del plan, que es
 * lo único que no envejece. Una deuda sin plan no se toca: ahí el `concept` es
 * el nombre de verdad.
 */
export function debtLabelInPlan(
  d: Pick<DebtWithContext, 'concept' | 'transaction' | 'plan_id' | 'id'>,
  plans: { id: string; concept: string; cuotas: { id: string }[] }[],
): string {
  if (!d.plan_id) return debtLabel(d)
  const plan = plans.find(p => p.id === d.plan_id)
  if (!plan) return debtLabel(d)
  const i = plan.cuotas.findIndex(c => c.id === d.id)
  if (i < 0) return debtLabel(d)
  return `${plan.concept} · cuota ${i + 1}/${plan.cuotas.length}`
}
