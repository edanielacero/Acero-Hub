import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, isValidDate, todayISO } from '@/lib/finanzas/transactions'
import { assertBalance } from '@/lib/finanzas/load'
import { listProfiles } from '@/lib/finanzas/profiles'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, savings_goal_id, savings_flow, savings_reason, linked_tx_id, linked_profile_id'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

/**
 * Transferencia entre perfiles.
 *
 * Sale de una cuenta del perfil activo, entra a una cuenta de OTRO de tus
 * perfiles (todos son tuyos — mismo `user_id`, ver `fin_profiles`). Nunca
 * cruza el FK compuesto que protege `fin_transactions` (`account_id`/
 * `to_account_id` tienen que vivir en el mismo `profile_id` que la fila, ver
 * 20260827000000): en vez de eso crea DOS filas, una por perfil, y las une
 * con `linked_tx_id`/`linked_profile_id` (20260908000000).
 *
 * Es de ida solamente. No hay un "traer": el otro perfil recibe pasivamente
 * (una fila `ingreso` + `movimiento`, que sube su saldo sin contar como
 * ingreso real — mismo mecanismo que un reembolso, ver `ingresoUsd`); si
 * quiere mandar de vuelta, hace su propio POST acá, con SU perfil activo.
 */
export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const body = (await request.json().catch(() => ({}))) ?? {}

  const accountId = typeof body.account_id === 'string' ? body.account_id : ''
  const toProfileId = typeof body.to_profile_id === 'string' ? body.to_profile_id : ''
  const toAccountId = typeof body.to_account_id === 'string' ? body.to_account_id : ''
  const amount = num(body.amount, NaN)
  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : todayISO()
  const description = typeof body.description === 'string' ? body.description.trim() || null : null

  if (!accountId) return NextResponse.json({ error: 'Elige de qué cuenta sale' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }
  if (!toProfileId || toProfileId === profileId) {
    return NextResponse.json({ error: 'Elige otro perfil como destino' }, { status: 400 })
  }
  if (!toAccountId) return NextResponse.json({ error: 'Elige a qué cuenta llega' }, { status: 400 })

  const [{ data: accountRow }, profiles] = await Promise.all([
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId).eq('id', accountId).maybeSingle(),
    listProfiles(supabase, userId),
  ])
  if (!accountRow) return NextResponse.json({ error: 'La cuenta de origen no existe' }, { status: 400 })
  const account = mapAccount(accountRow)

  // `listProfiles` trae TODOS tus perfiles (archivados incluidos) — un
  // archivado no es un destino válido, mismo criterio que el resto de la app.
  const origenPerfil = profiles.find(p => p.id === profileId)
  const destinoPerfil = profiles.find(p => p.id === toProfileId && !p.archived)
  if (!destinoPerfil) return NextResponse.json({ error: 'Ese perfil destino no existe' }, { status: 400 })

  const { data: destAccountRow } = await supabase
    .from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', toProfileId).eq('id', toAccountId).maybeSingle()
  if (!destAccountRow) return NextResponse.json({ error: 'La cuenta destino no existe' }, { status: 400 })
  const destAccount = mapAccount(destAccountRow)

  // Misma regla que cualquier transferencia entre monedas distintas
  // (`validateInput` en lib/finanzas/transactions.ts): si difieren, hace
  // falta declarar cuánto llegó de verdad; si no, el recibido es opcional
  // (sirve para registrar una comisión) y nunca puede superar lo que salió.
  const crossCurrency = account.currency !== destAccount.currency
  const toAmountRaw = body.to_amount == null ? null : num(body.to_amount, NaN)
  if (crossCurrency) {
    if (toAmountRaw == null || !Number.isFinite(toAmountRaw) || toAmountRaw <= 0) {
      return NextResponse.json(
        { error: `Indica cuánto llegó realmente a ${destAccount.name} (${destAccount.currency})` },
        { status: 400 },
      )
    }
  } else if (toAmountRaw != null) {
    if (!Number.isFinite(toAmountRaw) || toAmountRaw <= 0) {
      return NextResponse.json({ error: 'El monto recibido debe ser mayor a cero' }, { status: 400 })
    }
    if (toAmountRaw > amount) {
      return NextResponse.json({ error: 'En la misma moneda no puede llegar más de lo que salió' }, { status: 400 })
    }
  }
  const recibido = toAmountRaw ?? amount

  // Misma regla dura de saldo que cualquier gasto o transferencia: no puede
  // dejar la cuenta de origen en negativo. El destino solo recibe, no tiene
  // piso que cuidar.
  const balanceError = await assertBalance(supabase, scope, account, 'transferencia', amount, null, null)
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const { rates } = await ensureRates(supabase, userId)
  const frozen = freezeConversion(amount, account.currency, rates)
  const frozenTo = freezeConversion(recibido, destAccount.currency, rates)

  // Fila B primero: entra al otro perfil. `ingreso` + `movimiento` es el mismo
  // mecanismo que ya usa la app para "esto sube el saldo pero no es plata que
  // ganaste" (ver el comentario de `ingresoUsd` sobre el reembolso de
  // Spotify) — `computeBalances` ya lo suma al saldo del destino sin tocar
  // código, e `isConsumo`/`ingresoUsd` ya lo excluyen de cualquier reporte de
  // ingresos, también sin tocar código.
  //
  // Va primero porque no necesita el id de la otra: `fin_tx_transfer_shape`
  // (20260908010000) solo exige `linked_tx_id` en la pata `transferencia`, así
  // que esta puede nacer sin vínculo y completarlo recién al final.
  const { data: filaB, error: errorB } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: toProfileId,
      type: 'ingreso', flow_type: 'movimiento',
      date, account_id: destAccount.id, to_account_id: null, category_id: null,
      amount: recibido, currency: destAccount.currency,
      to_amount: null, exchange_rate: frozenTo.exchange_rate, amount_usd: frozenTo.amount_usd,
      to_amount_usd: null, to_exchange_rate: null,
      description: description ?? `Transferencia de ${origenPerfil?.name ?? 'otro perfil'}`,
      savings_goal_id: null, savings_flow: null, savings_reason: null,
      linked_profile_id: profileId,
    })
    .select(TX_COLS)
    .single()

  if (errorB || !filaB) {
    return NextResponse.json({ error: errorB?.message ?? 'No se pudo registrar la transferencia' }, { status: 400 })
  }

  // Fila A: sale del perfil activo, ya con `linked_tx_id` puesto — nace
  // completa, no hace falta un update después. `to_account_id` siempre null:
  // no puede apuntar a una cuenta de otro perfil, el FK compuesto lo impide.
  const { data: filaA, error: errorA } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: profileId,
      type: 'transferencia', flow_type: 'movimiento',
      date, account_id: account.id, to_account_id: null, category_id: null,
      amount, currency: account.currency,
      to_amount: null, exchange_rate: frozen.exchange_rate, amount_usd: frozen.amount_usd,
      to_amount_usd: null, to_exchange_rate: null,
      description: description ?? `Transferencia a ${destinoPerfil.name}`,
      savings_goal_id: null, savings_flow: null, savings_reason: null,
      linked_tx_id: filaB.id, linked_profile_id: toProfileId,
    })
    .select(TX_COLS)
    .single()

  if (errorA || !filaA) {
    // Peor caso posible: no haber hecho nada, no una fila que llega sin salir.
    await supabase.from('fin_transactions').delete().eq('id', filaB.id).eq('profile_id', toProfileId)
    return NextResponse.json({ error: errorA?.message ?? 'No se pudo registrar el lado que sale' }, { status: 400 })
  }

  const { error: linkError } = await supabase
    .from('fin_transactions')
    .update({ linked_tx_id: filaA.id })
    .eq('id', filaB.id)
    .eq('profile_id', toProfileId)

  if (linkError) {
    await supabase.from('fin_transactions').delete().eq('id', filaA.id).eq('profile_id', profileId)
    await supabase.from('fin_transactions').delete().eq('id', filaB.id).eq('profile_id', toProfileId)
    return NextResponse.json({ error: linkError.message }, { status: 400 })
  }

  return NextResponse.json(
    { transaction: { ...filaA, debts: [] } },
    { status: 201 },
  )
}
