import type { SupabaseClient } from '@supabase/supabase-js'
import { num } from './money'
import { splitState } from './splits'
import type { Currency, Person, SplitWithContext } from './types'

/**
 * Un split trae dos cosas de `fin_transactions` por caminos distintos — el
 * gasto que lo originó y el cobro que lo saldó — así que hay que desambiguar
 * el embed por nombre de constraint. Sin eso PostgREST no sabe cuál de las dos
 * claves foráneas seguir.
 */
export const SPLIT_CTX_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, settled_tx_id, waived_at, note, created_at,' +
  'person:fin_people!fin_splits_person_id_fkey(id,name,emoji,archived),' +
  'transaction:fin_transactions!fin_splits_transaction_id_fkey(id,date,description,amount,currency,category_id),' +
  'settled:fin_transactions!fin_splits_settled_tx_id_fkey(id,date)'

/** Lo mismo, sin los embeds: para las rutas que solo escriben. */
export const SPLIT_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, settled_tx_id, waived_at, note'

interface RawSplitRow {
  id: string
  transaction_id: string
  person_id: string
  amount: unknown
  currency: string
  amount_usd: unknown
  settled_tx_id: string | null
  waived_at: string | null
  note: string | null
  created_at?: string
  person?: { id: string; name: string; emoji: string | null; archived: boolean } | null
  transaction?: {
    id: string; date: string; description: string | null
    amount: unknown; currency: string; category_id: string | null
  } | null
  settled?: { id: string; date: string } | null
}

/** La fecha en que se saldó: la del cobro, o la de la condonación. */
export function settledOn(row: { settled?: { date: string } | null; waived_at: string | null }): string | null {
  return row.settled?.date ?? row.waived_at ?? null
}

export function mapSplitContext(row: RawSplitRow): SplitWithContext {
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
    state: splitState(row),
    person: (row.person ?? { id: row.person_id, name: '—', emoji: null, archived: false }) as Person,
    transaction: {
      id: row.transaction?.id ?? row.transaction_id,
      date: row.transaction?.date ?? '',
      description: row.transaction?.description ?? null,
      amount: num(row.transaction?.amount),
      currency: (row.transaction?.currency ?? row.currency) as Currency,
      category_id: row.transaction?.category_id ?? null,
    },
  }
}

/** Todos los repartos del usuario con su contexto, del gasto más nuevo al más viejo. */
export async function readSplits(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: SplitWithContext[]; raw: RawSplitRow[] }> {
  const { data } = await supabase
    .from('fin_splits')
    .select(SPLIT_CTX_COLS)
    .eq('user_id', userId)

  const raw = (data ?? []) as unknown as RawSplitRow[]
  const rows = raw
    .map(mapSplitContext)
    .sort((a, b) => (a.transaction.date < b.transaction.date ? 1 : a.transaction.date > b.transaction.date ? -1 : 0))

  return { rows, raw }
}
