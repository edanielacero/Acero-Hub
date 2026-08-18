import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { loadRecurring } from '@/lib/finanzas/load'
import { resolvePeople } from '@/lib/finanzas/people'
import type { Frequency, RecurringInput } from '@/lib/finanzas/types'

export const RECURRING_COLS =
  'id, name, emoji, amount, account_id, category_id, frequency, day_of_month, month_of_year, active, note'

const FREQUENCIES: Frequency[] = ['mensual', 'anual']

/** El reparto por defecto tal como llega del cliente, sin confiar en nada. */
export function readTemplateSplits(raw: unknown) {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return []
  return raw.map(r => ({
    person_id: typeof r?.person_id === 'string' ? r.person_id : undefined,
    person_name: typeof r?.person_name === 'string' ? r.person_name : undefined,
    // `null` es deliberado y significa "parte pareja": se calcula al registrar.
    amount: r?.amount === null || r?.amount === undefined ? null : num(r.amount, NaN),
  }))
}

export function validateRecurring(body: Partial<RecurringInput>): string | null {
  if (!body.name || !body.name.trim()) return 'El fijo necesita un nombre'
  if (!body.account_id) return 'Elegí de qué cuenta sale'
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    return 'El monto debe ser mayor a cero'
  }
  const freq = body.frequency ?? 'mensual'
  if (!FREQUENCIES.includes(freq)) return 'Frecuencia inválida'

  const day = body.day_of_month ?? 1
  if (!Number.isInteger(day) || day < 1 || day > 31) return 'El día tiene que estar entre 1 y 31'

  if (freq === 'anual') {
    const m = body.month_of_year
    if (!Number.isInteger(m) || (m as number) < 1 || (m as number) > 12) {
      return 'Un fijo anual necesita saber en qué mes cae'
    }
  }
  return null
}

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json(await loadRecurring(supabase, userId, todayISO()))
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const input: Partial<RecurringInput> = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    emoji: typeof body.emoji === 'string' ? body.emoji || null : null,
    amount: num(body.amount, NaN),
    account_id: body.account_id,
    category_id: body.category_id ?? null,
    frequency: body.frequency ?? 'mensual',
    day_of_month: body.day_of_month === undefined ? 1 : num(body.day_of_month),
    month_of_year: body.month_of_year == null ? null : num(body.month_of_year),
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
  }
  if (input.frequency === 'mensual') input.month_of_year = null

  const invalid = validateRecurring(input)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  // La cuenta tiene que ser tuya: de ella sale la moneda del fijo.
  const { data: account } = await supabase
    .from('fin_accounts').select('id').eq('user_id', userId).eq('id', input.account_id!).maybeSingle()
  if (!account) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_recurring')
    .insert({ user_id: userId, ...input })
    .select(RECURRING_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const splits = readTemplateSplits(body.splits) ?? []
  if (splits.length > 0) {
    const { resolved, error: peopleError } = await resolvePeople(
      supabase, userId,
      // `resolvePeople` espera montos reales; acá el monto puede ser null
      // (parte pareja) y solo importa resolver la persona.
      splits.map(s => ({ ...s, amount: 1 })),
    )
    if (peopleError) {
      await supabase.from('fin_recurring').delete().eq('id', data.id).eq('user_id', userId)
      return NextResponse.json({ error: peopleError }, { status: 400 })
    }

    const { error: splitError } = await supabase.from('fin_recurring_splits').insert(
      resolved.map((r, i) => ({
        user_id: userId,
        recurring_id: data.id,
        person_id: r.person_id,
        amount: splits[i].amount == null || Number.isNaN(splits[i].amount) ? null : splits[i].amount,
      })),
    )
    if (splitError) {
      // Compensación: si el reparto no entra, la plantilla no debe quedar a
      // medias. Igual que en el Sprint 2, el peor caso es que quede un fijo sin
      // reparto — una fila válida, no un dato roto.
      await supabase.from('fin_recurring').delete().eq('id', data.id).eq('user_id', userId)
      return NextResponse.json({ error: `No se pudo guardar el reparto: ${splitError.message}` }, { status: 400 })
    }
  }

  return NextResponse.json({ recurring: data }, { status: 201 })
}
