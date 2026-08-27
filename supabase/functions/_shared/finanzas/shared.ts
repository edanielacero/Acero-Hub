// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { num } from './money.ts'
import { debtState } from './splits.ts'
import type { Currency, Person, DebtWithContext, Scope } from './types.ts'

/**
 * Un split trae dos cosas de `fin_transactions` por caminos distintos — el
 * gasto que lo originó y el cobro que lo saldó — así que hay que desambiguar
 * el embed por nombre de constraint. Sin eso PostgREST no sabe cuál de las dos
 * claves foráneas seguir.
 */
export const DEBT_CTX_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, principal_usd, settled_tx_id, settled_margin_tx_id, waived_at, note, concept, incurred_on, plan_id, plan_installment_no, created_at,' +
  'person:fin_people!fin_debts_person_id_fkey(id,name,archived),' +
  'transaction:fin_transactions!fin_debts_transaction_id_fkey(id,date,description,amount,currency,category_id),' +
  // El cobro trae también dónde entró la plata y cuánto: el detalle de una
  // deuda saldada lo muestra, y era un dato que se escribía y nunca se leía.
  'settled:fin_transactions!fin_debts_settled_tx_id_fkey(id,date,amount,currency,account_id)'

/** Lo mismo, sin los embeds: para las rutas que solo escriben. */
export const DEBT_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, principal_usd, settled_tx_id, settled_margin_tx_id, waived_at, note, concept, incurred_on, plan_id, plan_installment_no'

export interface RawDebtRow {
  id: string
  transaction_id: string
  person_id: string
  amount: unknown
  currency: string
  amount_usd: unknown
  principal_usd: unknown
  settled_tx_id: string | null
  settled_margin_tx_id: string | null
  waived_at: string | null
  note: string | null
  concept: string | null
  incurred_on: string
  plan_id: string | null
  plan_installment_no: number | null
  created_at?: string
  person?: { id: string; name: string; archived: boolean } | null
  transaction?: {
    id: string; date: string; description: string | null
    amount: unknown; currency: string; category_id: string | null
  } | null
  settled?: {
    id: string; date: string
    amount?: unknown; currency?: string; account_id?: string
  } | null
}

/** La fecha en que se saldó: la del cobro, o la de la perdón. */
export function settledOn(row: { settled?: { date: string } | null; waived_at: string | null }): string | null {
  return row.settled?.date ?? row.waived_at ?? null
}

export function mapDebtContext(row: RawDebtRow): DebtWithContext {
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    person_id: row.person_id,
    amount: num(row.amount),
    currency: row.currency as Currency,
    amount_usd: num(row.amount_usd),
    principal_usd: num(row.principal_usd),
    settled_tx_id: row.settled_tx_id,
    settled_margin_tx_id: row.settled_margin_tx_id,
    waived_at: row.waived_at,
    note: row.note,
    concept: row.concept,
    // La fecha canónica de una deuda es `incurred_on`: con gasto padre se
    // hereda de él, y suelta la pone el usuario. Guardarla siempre evita
    // ramificar cada vez que se calcula una antigüedad o se ordena una lista.
    incurred_on: row.incurred_on,
    plan_id: row.plan_id,
    plan_installment_no: row.plan_installment_no,
    state: debtState(row),
    person: (row.person ?? { id: row.person_id, name: '—', archived: false }) as Person,
    // Cómo se cobró: a qué cuenta entró la plata, cuándo y cuánto. `null`
    // mientras siga pendiente o si se perdonó (ahí manda `waived_at`).
    settlement: row.settled
      ? {
          date: row.settled.date,
          account_id: row.settled.account_id ?? null,
          amount: row.settled.amount == null ? null : num(row.settled.amount),
          currency: (row.settled.currency ?? row.currency) as Currency,
        }
      : null,
    // `null` cuando la deuda no vino de ningún gasto: prestaste efectivo, te
    // deben una cuota. Es el caso que el modelo viejo no podía representar.
    transaction: row.transaction
      ? {
          id: row.transaction.id,
          date: row.transaction.date,
          description: row.transaction.description ?? null,
          amount: num(row.transaction.amount),
          currency: (row.transaction.currency ?? row.currency) as Currency,
          category_id: row.transaction.category_id ?? null,
        }
      : null,
  }
}

/** Todos los repartos del perfil con su contexto, del gasto más nuevo al más viejo. */
export async function readDebts(
  supabase: SupabaseClient,
  scope: Scope,
): Promise<{ rows: DebtWithContext[]; raw: RawDebtRow[] }> {
  const { data } = await supabase
    .from('fin_debts')
    .select(DEBT_CTX_COLS)
    .eq('profile_id', scope.profileId)

  const raw = (data ?? []) as unknown as RawDebtRow[]
  const rows = raw
    .map(mapDebtContext)
    .sort((a, b) => (a.incurred_on < b.incurred_on ? 1 : a.incurred_on > b.incurred_on ? -1 : 0))

  return { rows, raw }
}
