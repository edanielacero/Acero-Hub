import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num, round2 } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, validateInput } from '@/lib/finanzas/transactions'
import { freezeSplitUsd, validateSplits } from '@/lib/finanzas/splits'
import { assertOwnedPeople, resolvePeople } from '@/lib/finanzas/people'
import { SPLIT_COLS } from '@/lib/finanzas/shared'
import { readSplitInput } from '../route'
import type { Account, Currency, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

interface SplitRow {
  id: string
  person_id: string
  amount: number
  currency: Currency
  amount_usd: number
  settled_tx_id: string | null
  waived_at: string | null
}

async function readSplits(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string,
  txId: string,
): Promise<SplitRow[]> {
  const { data } = await supabase
    .from('fin_splits')
    .select(SPLIT_COLS)
    .eq('user_id', userId)
    .eq('transaction_id', txId)

  return (data ?? []).map(s => ({
    id: s.id,
    person_id: s.person_id,
    amount: num(s.amount),
    currency: s.currency as Currency,
    amount_usd: num(s.amount_usd),
    settled_tx_id: s.settled_tx_id,
    waived_at: s.waived_at,
  }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const [{ data: current }, { data: accountRows }, existingSplits] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select(TX_COLS)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('user_id', userId),
    readSplits(supabase, userId, id),
  ])

  if (!current) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })

  const accountsById = new Map<string, Account>(
    (accountRows ?? []).map(r => {
      const a = mapAccount(r)
      return [a.id, a]
    }),
  )

  const pick = <T,>(next: T | undefined, prev: T): T => (next === undefined ? prev : next)

  const merged: Partial<TransactionInput> = {
    type: pick(body.type, current.type),
    date: pick(body.date, current.date),
    account_id: pick(body.account_id, current.account_id),
    to_account_id: pick(body.to_account_id, current.to_account_id),
    category_id: pick(body.category_id, current.category_id),
    amount: body.amount === undefined ? num(current.amount) : num(body.amount, NaN),
    to_amount:
      body.to_amount === undefined
        ? current.to_amount === null ? null : num(current.to_amount)
        : body.to_amount == null ? null : num(body.to_amount),
    description:
      body.description === undefined
        ? current.description
        : typeof body.description === 'string'
          ? body.description.trim() || null
          : null,
  }

  // Pasar a transferencia limpia la categoría; salir de transferencia limpia
  // el destino y el monto recibido. Sin esto el check constraint rechaza el update.
  if (merged.type === 'transferencia') {
    merged.category_id = null
  } else {
    merged.to_account_id = null
    merged.to_amount = null
  }

  const check = validateInput(merged, accountsById)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const currency = accountsById.get(merged.account_id!)!.currency

  /* ─── Reparto ─────────────────────────────────────────────────────────────
     Mandar `splits` reemplaza el reparto completo. No mandarlo lo deja intacto:
     editar la descripción de un gasto compartido no debería obligar a reenviar
     todo el reparto. */

  const incoming = readSplitInput(body.splits)
  const settled = existingSplits.filter(s => s.settled_tx_id)

  if (existingSplits.length > 0 && merged.type !== 'gasto') {
    return NextResponse.json(
      { error: 'Este gasto tiene un reparto. Quitalo antes de cambiarle el tipo.' },
      { status: 400 },
    )
  }

  if (incoming !== undefined) {
    const conocidas = (await supabase.from('fin_people').select('id, name').eq('user_id', userId)).data ?? []

    const splitCheck = validateSplits(incoming, merged.type!, merged.amount!, currency, conocidas)
    if (!splitCheck.ok) return NextResponse.json({ error: splitCheck.error }, { status: 400 })

    const ownedError = await assertOwnedPeople(
      supabase, userId,
      incoming.map(s => s.person_id).filter((x): x is string => Boolean(x)),
    )
    if (ownedError) return NextResponse.json({ error: ownedError }, { status: 400 })
  }
  // Bajar el gasto por debajo de lo repartido ya no se rechaza: el reparto
  // puede superar al gasto a propósito (le cobrás de más y ganás la
  // diferencia). Lo que antes era un error ahora es una decisión válida.

  // La tasa se recongela solo si cambió algo que la involucra: el monto, la
  // cuenta (y con ella la moneda), o una tasa enviada explícitamente desde el
  // formulario. Editar solo la descripción no toca la conversión histórica.
  const rateExplicit = body.exchange_rate !== undefined
  const amountChanged = body.amount !== undefined && num(body.amount) !== num(current.amount)
  const accountChanged = body.account_id !== undefined && body.account_id !== current.account_id

  let exchange_rate = num(current.exchange_rate)
  let amount_usd = num(current.amount_usd)

  if (rateExplicit || amountChanged || accountChanged) {
    if (rateExplicit) {
      // Una tasa mandada a mano es el factor congelado directo: USD por unidad.
      const factor = num(body.exchange_rate, NaN)
      if (!Number.isFinite(factor) || factor <= 0) {
        return NextResponse.json({ error: 'La tasa debe ser mayor a cero' }, { status: 400 })
      }
      exchange_rate = factor
      amount_usd = round2(merged.amount! * factor)
    } else {
      const { rates } = await ensureRates(supabase, userId)
      const frozen = freezeConversion(merged.amount!, currency, rates)
      exchange_rate = frozen.exchange_rate
      amount_usd = frozen.amount_usd
    }
  }

  const { data, error } = await supabase
    .from('fin_transactions')
    .update({
      type: merged.type,
      flow_type: merged.type === 'transferencia' ? 'movimiento' : current.flow_type,
      date: merged.date,
      account_id: merged.account_id,
      to_account_id: merged.to_account_id,
      category_id: merged.category_id,
      amount: merged.amount,
      currency,
      to_amount: merged.to_amount,
      exchange_rate,
      amount_usd,
      description: merged.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  /* ─── Reconciliar el reparto ─────────────────────────────────────────────── */

  const rateChanged = exchange_rate !== num(current.exchange_rate) || currency !== current.currency

  if (incoming !== undefined) {
    const { resolved, error: peopleError } = await resolvePeople(supabase, userId, incoming)
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    const byPerson = new Map(existingSplits.map(s => [s.person_id, s]))
    const target = new Map(resolved.map(r => [r.person_id, r.amount]))

    // Un split cobrado no se puede borrar ni cambiar de monto: hay un
    // movimiento real apuntándolo. Primero hay que deshacer el cobro.
    const bloqueado = settled.find(s => !target.has(s.person_id) || target.get(s.person_id) !== s.amount)
    if (bloqueado) {
      return NextResponse.json(
        { error: 'Hay partes ya cobradas en este gasto. Deshacé el cobro antes de cambiar el reparto.' },
        { status: 409 },
      )
    }

    // Cada escritura se revisa. Sin esto, un insert rechazado por la base
    // devolvía 200 y el usuario veía "guardado" con un reparto a medias.
    let fallo: string | null = null

    const toDelete = existingSplits.filter(s => !target.has(s.person_id)).map(s => s.id)
    if (toDelete.length > 0) {
      const { error: delError } = await supabase
        .from('fin_splits').delete().eq('user_id', userId).in('id', toDelete)
      if (delError) fallo = delError.message
    }

    for (const [personId, amount] of target) {
      if (fallo) break
      const prev = byPerson.get(personId)
      const payload = {
        amount,
        currency,
        amount_usd: freezeSplitUsd(amount, exchange_rate),
      }
      if (prev) {
        if (prev.amount !== amount || rateChanged) {
          const { error: upError } = await supabase
            .from('fin_splits').update(payload).eq('user_id', userId).eq('id', prev.id)
          if (upError) fallo = upError.message
        }
      } else {
        const { error: insError } = await supabase.from('fin_splits').insert({
          user_id: userId, transaction_id: id, person_id: personId, ...payload,
        })
        if (insError) fallo = insError.message
      }
    }

    if (fallo) {
      // El movimiento ya se actualizó y el reparto puede haber quedado a
      // medias. Se devuelve el estado real junto al error para que la pantalla
      // muestre lo que de verdad hay en la base, no lo que se intentó guardar.
      return NextResponse.json(
        {
          error: `El movimiento se guardó, pero el reparto quedó incompleto: ${fallo}`,
          transaction: { ...data, splits: await readSplits(supabase, userId, id) },
        },
        { status: 409 },
      )
    }
  } else if (rateChanged && existingSplits.length > 0) {
    // El reparto no cambió, pero el gasto se recongeló con otra tasa. Si las
    // partes conservaran la vieja, dejarían de sumar al total y "cuánto es
    // realmente mío" quedaría mal por la diferencia.
    for (const s of existingSplits) {
      const { error: reError } = await supabase
        .from('fin_splits')
        .update({ currency, amount_usd: freezeSplitUsd(s.amount, exchange_rate) })
        .eq('user_id', userId)
        .eq('id', s.id)
      if (reError) {
        return NextResponse.json(
          {
            error: `El movimiento se guardó, pero no se pudo recongelar el reparto: ${reError.message}`,
            transaction: { ...data, splits: await readSplits(supabase, userId, id) },
          },
          { status: 409 },
        )
      }
    }
  }

  const splits = await readSplits(supabase, userId, id)
  return NextResponse.json({ transaction: { ...data, splits } })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const splits = await readSplits(supabase, userId, id)

  // Un split cobrado cuyo gasto padre desaparece dejaría un ingreso en la
  // cuenta sin nada que lo explique. El `on delete restrict` de la base lo
  // impide igual; acá el mensaje se puede leer.
  const cobrados = splits.filter(s => s.settled_tx_id).length
  if (cobrados > 0) {
    return NextResponse.json(
      { error: `Este gasto tiene ${cobrados} parte(s) ya cobrada(s). Deshacé el cobro antes de borrarlo.` },
      { status: 409 },
    )
  }

  if (splits.length > 0) {
    const { error: splitError } = await supabase
      .from('fin_splits')
      .delete()
      .eq('user_id', userId)
      .eq('transaction_id', id)

    if (splitError) return NextResponse.json({ error: splitError.message }, { status: 400 })
  }

  const { error } = await supabase
    .from('fin_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
