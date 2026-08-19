import type { SupabaseClient } from '@supabase/supabase-js'
import { num } from './money'
import { debtState } from './splits'
import type { Currency, Person, DebtWithContext } from './types'

/**
 * Un split trae dos cosas de `fin_transactions` por caminos distintos — el
 * gasto que lo originó y el cobro que lo saldó — así que hay que desambiguar
 * el embed por nombre de constraint. Sin eso PostgREST no sabe cuál de las dos
 * claves foráneas seguir.
 */
export const DEBT_CTX_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, settled_tx_id, waived_at, note, concept, incurred_on, created_at,' +
  'person:fin_people!fin_debts_person_id_fkey(id,name,archived),' +
  'transaction:fin_transactions!fin_debts_transaction_id_fkey(id,date,description,amount,currency,category_id),' +
  'settled:fin_transactions!fin_debts_settled_tx_id_fkey(id,date)'

/** Lo mismo, sin los embeds: para las rutas que solo escriben. */
export const DEBT_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, settled_tx_id, waived_at, note, concept, incurred_on'

interface RawDebtRow {
  id: string
  transaction_id: string
  person_id: string
  amount: unknown
  currency: string
  amount_usd: unknown
  settled_tx_id: string | null
  waived_at: string | null
  note: string | null
  concept: string | null
  incurred_on: string
  created_at?: string
  person?: { id: string; name: string; archived: boolean } | null
  transaction?: {
    id: string; date: string; description: string | null
    amount: unknown; currency: string; category_id: string | null
  } | null
  settled?: { id: string; date: string } | null
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
    settled_tx_id: row.settled_tx_id,
    waived_at: row.waived_at,
    note: row.note,
    concept: row.concept,
    // La fecha canónica de una deuda es `incurred_on`: con gasto padre se
    // hereda de él, y suelta la pone el usuario. Guardarla siempre evita
    // ramificar cada vez que se calcula una antigüedad o se ordena una lista.
    incurred_on: row.incurred_on,
    state: debtState(row),
    person: (row.person ?? { id: row.person_id, name: '—', archived: false }) as Person,
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

/** Todos los repartos del usuario con su contexto, del gasto más nuevo al más viejo. */
export async function readDebts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: DebtWithContext[]; raw: RawDebtRow[] }> {
  const { data } = await supabase
    .from('fin_debts')
    .select(DEBT_CTX_COLS)
    .eq('user_id', userId)

  const raw = (data ?? []) as unknown as RawDebtRow[]
  const rows = raw
    .map(mapDebtContext)
    .sort((a, b) => (a.incurred_on < b.incurred_on ? 1 : a.incurred_on > b.incurred_on ? -1 : 0))

  return { rows, raw }
}
