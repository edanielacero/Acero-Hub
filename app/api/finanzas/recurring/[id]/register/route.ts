import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { crossCurrencySuggestion, num, round2 } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, todayISO, isValidDate } from '@/lib/finanzas/transactions'
import { freezeDebtUsd } from '@/lib/finanzas/splits'
import { periodOf, resolveSplits } from '@/lib/finanzas/recurring'
import { assertBalance, assertSavingsGoal } from '@/lib/finanzas/load'
import { periodOfDate } from '@/lib/finanzas/savings'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import type { Currency, Recurring, RecurringSplit, TxType } from '@/lib/finanzas/types'


const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, recurring_id, savings_goal_id, savings_flow, savings_period'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

/**
 * Instanciar un fijo: crea el gasto real y su reparto.
 *
 * **Nunca se dispara solo.** Es una decisión de producto cerrada en el
 * documento de contexto: si la app posteara sola, el día que Spotify te cambie
 * el precio o te rebote el pago tendrías un gasto que no ocurrió y un saldo que
 * no cuadra con la cuenta real. La app te dice qué falta; el gasto lo confirmás
 * vos.
 *
 * Todo lo que viene en el body pisa a la plantilla solo para ESTA instancia:
 * la plantilla no se modifica salvo que lo pidas aparte.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) ?? {}

  const [{ data: plantilla }, { data: templateSplits }] = await Promise.all([
    supabase
      .from('fin_recurring')
      .select('id, name, icon, amount, account_id, category_id, frequency, day_of_month, month_of_year, active, note, starts_on, savings_goal_id, to_account_id')
      .eq('id', id).eq('profile_id', profileId).maybeSingle(),
    supabase
      .from('fin_recurring_splits')
      .select('id, recurring_id, person_id, amount')
      .eq('profile_id', profileId).eq('recurring_id', id),
  ])

  if (!plantilla) return NextResponse.json({ error: 'Fijo no encontrado' }, { status: 404 })

  const base = {
    ...(plantilla as unknown as Recurring),
    amount: num(plantilla.amount),
    day_of_month: num(plantilla.day_of_month, 1),
    month_of_year: plantilla.month_of_year === null ? null : num(plantilla.month_of_year),
  }

  const hoy = todayISO()

  // La fecha por defecto es la que le toca en el período vigente, no hoy: si
  // Spotify cobra el 5 y lo registrás el 18, el cargo fue el 5. Anotarlo hoy
  // correría el gasto de mes en los bordes y ensuciaría cualquier reporte.
  const date = typeof body.date === 'string' && isValidDate(body.date)
    ? body.date
    : periodOf(base, hoy).due

  // El período se calcula sobre la fecha PEDIDA, no sobre hoy. Con un fijo que
  // arranca meses atrás se registra marzo estando en agosto, y comparar contra
  // el período de hoy dejaría duplicar marzo cuantas veces se quisiera.
  const { from, to } = periodOf(base, date)

  // Idempotencia: dos toques al botón no generan dos gastos. Se chequea contra
  // el período, no contra la fecha exacta, porque el segundo toque podría traer
  // otra fecha dentro del mismo mes.
  if (body.force !== true) {
    const { data: yaEsta } = await supabase
      .from('fin_transactions')
      .select('id, date')
      .eq('profile_id', profileId).eq('recurring_id', id)
      .gte('date', from).lte('date', to)
      .limit(1)

    if ((yaEsta ?? []).length > 0) {
      return NextResponse.json(
        { error: `${base.name} ya está registrado en ese período`, transaction_id: yaEsta![0].id },
        { status: 409 },
      )
    }
  }

  const accountId = typeof body.account_id === 'string' && body.account_id ? body.account_id : base.account_id
  if (!accountId) return NextResponse.json({ error: 'Elige de qué cuenta sale' }, { status: 400 })

  const { data: accountRow } = await supabase
    .from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId).eq('id', accountId).maybeSingle()
  if (!accountRow) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })
  const account = mapAccount(accountRow)

  const amount = body.amount === undefined ? base.amount : num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  /**
   * Un fijo de AHORRO (Sprint 7) genera una **transferencia** a su cuenta de
   * ahorro, tageada con el ahorro — no un gasto. Es el mismo módulo de Fijos
   * con un atributo opcional, igual que el reparto de los compartidos: mismo
   * día del mes, mismo pendiente/vencido, mismo botón de registrar; lo único
   * que cambia es qué movimiento sale al final.
   */
  const esAhorro = !!base.savings_goal_id
  const tipo: TxType = esAhorro ? 'transferencia' : 'gasto'

  // La cuenta de ahorro se elige al REGISTRAR, igual que la de origen: la
  // plantilla solo guarda la última usada como default.
  //
  // Sin ninguna de las dos, el default es la MISMA cuenta de origen — mismo
  // criterio que `POST /savings-goals/[id]/save`: la plata ya está ahí, solo
  // pasa a estar apartada. La migración 20260826000000 hizo opcional
  // `to_account_id` justo para esto; exigirlo acá dejaba un fijo de ahorro
  // perfectamente válido sin forma de registrarse.
  const toAccountId = esAhorro
    ? (typeof body.to_account_id === 'string' && body.to_account_id ? body.to_account_id : (base.to_account_id ?? accountId))
    : null

  // Registrar un fijo crea un movimiento NUEVO, así que aplica la misma regla
  // que `POST /transactions`: un ahorro archivado no se puede elegir de cero
  // (`assertSavingsGoal` sin `allowArchived`). Sin esto, archivar un ahorro y
  // dejar su fijo activo hacía que cada registro metiera plata en un ahorro
  // que la pantalla de Ahorros ni siquiera lista — un aporte invisible, con
  // 201 y sin una sola advertencia. Archivar no congela la historia (clase
  // b08fdb4: el fijo se sigue pausando, renombrando y editando), pero tampoco
  // sigue produciendo historia nueva.
  if (esAhorro) {
    const goalError = await assertSavingsGoal(supabase, scope, base.savings_goal_id as string)
    if (goalError) {
      return NextResponse.json(
        { error: `${goalError}. Pausa este fijo o desarchívalo para seguir aportando.` },
        { status: 400 },
      )
    }
  }

  // Misma regla dura de saldo que /transactions, no una excepción para esta
  // pantalla — y una transferencia consume saldo igual que un gasto.
  const balanceError = await assertBalance(supabase, scope, account, tipo, amount)
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const currency = account.currency as Currency
  const { rates } = await ensureRates(supabase, userId)
  const frozen = freezeConversion(amount, currency, rates)

  // El lado que llega se congela aparte, igual que en cualquier transferencia
  // cross-currency: aportar desde una cuenta en Bs a un ahorro en USD tiene que
  // guardar lo que REALMENTE entró, no una reconversión con la tasa de hoy.
  let destino: { id: string; currency: Currency } | null = null
  if (esAhorro) {
    const { data: destinoRow } = await supabase
      .from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId).eq('id', toAccountId!).maybeSingle()
    if (!destinoRow) return NextResponse.json({ error: 'La cuenta de ahorro no existe' }, { status: 400 })
    const cuentaDestino = mapAccount(destinoRow)
    // Origen y destino iguales SÍ es válido acá, al revés que en una
    // transferencia común: apartar un ahorro dentro de la misma cuenta no
    // mueve la plata de lugar, la etiqueta. Es el caso más frecuente, y el
    // que la pantalla de Ahorros ya usaba de default.
    destino = { id: cuentaDestino.id, currency: cuentaDestino.currency as Currency }
  }

  const toAmount = destino && destino.currency !== currency
    ? crossCurrencySuggestion(amount, currency, destino.currency, rates)
    : null
  const frozenTo = toAmount != null && destino ? freezeConversion(toAmount, destino.currency, rates) : null

  const { data: tx, error: txError } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: profileId,
      type: tipo,
      // Una transferencia siempre es 'movimiento': el aporte al ahorro no
      // ensucia el gasto real del mes, que es justo el punto de que sea un
      // fijo de ahorro y no un gasto fijo.
      flow_type: esAhorro ? 'movimiento' : 'consumo',
      date,
      account_id: accountId,
      to_account_id: destino?.id ?? null,
      category_id: esAhorro ? null : (body.category_id === undefined ? base.category_id : (body.category_id || null)),
      amount,
      currency,
      to_amount: toAmount,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      to_amount_usd: frozenTo?.amount_usd ?? null,
      to_exchange_rate: frozenTo?.exchange_rate ?? null,
      description: typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : base.name,
      recurring_id: id,
      // Un fijo de ahorro siempre APORTA — para eso existe.
      savings_goal_id: esAhorro ? base.savings_goal_id : null,
      savings_flow: esAhorro ? 'aporte' : null,
      // A qué mes pertenece el aporte (Ronda 9). Un fijo aporta DENTRO del mes
      // en que cae su fecha, a diferencia del reparto de fin de mes, que se
      // registra después y lleva el mes que organiza. Con esto la tabla del
      // detalle marca el mes correcto y el botón "Ahorrar" sabe si ya hubo
      // aporte para ese plan ese mes.
      savings_period: esAhorro ? periodOfDate(date) : null,
    })
    .select(TX_COLS)
    .single()

  if (txError || !tx) {
    return NextResponse.json({ error: txError?.message ?? 'No se pudo registrar' }, { status: 400 })
  }

  // Las partes parejas se calculan con el monto de ESTE mes, no con el que
  // tenía la plantilla cuando la creaste.
  //
  // Un fijo de AHORRO nunca genera deudas: no le estás cobrando a nadie una
  // parte de tu propio ahorro, y una deuda cuelga de un gasto (`fin_debts.
  // transaction_id`), no de una transferencia. La UI ya no ofrece el reparto
  // en ese caso; esto ataja una plantilla que venía compartida de antes y se
  // convirtió en ahorro con sus partes viejas todavía en la base.
  const partes = esAhorro ? [] : resolveSplits(
    (templateSplits ?? []).map(s => ({
      person_id: s.person_id,
      amount: s.amount === null ? null : num(s.amount),
    })) as RecurringSplit[],
    amount,
    currency,
  )

  // Si repartiste más de lo que pagaste, el excedente es ganancia — y esa se
  // reconoce recién cuando de verdad la cobrás (§ debts/settle), no acá. Cada
  // deuda congela cuánto de sí misma es recuperar costo real, prorrateado: si
  // repartido ≤ pagado, `ratio` da 1 y no cambia nada (caso de siempre).
  const totalRepartido = partes.reduce((s, pt) => s + pt.amount, 0)
  const ratio = totalRepartido > amount ? Math.min(1, amount / totalRepartido) : 1

  let debts: unknown[] = []
  if (partes.length > 0) {
    const { data: creados, error: splitError } = await supabase
      .from('fin_debts')
      .insert(partes.map(pt => {
        const amount_usd = freezeDebtUsd(pt.amount, frozen.exchange_rate)
        return {
          user_id: userId, profile_id: profileId,
          transaction_id: tx.id,
          person_id: pt.person_id,
          amount: pt.amount,
          currency,
          amount_usd,
          principal_usd: Math.min(amount_usd, round2(amount_usd * ratio)),
          // La deuda nace el día del gasto, no el día que lo registraste. Sin
          // esto, registrar Spotify tarde hacía que la deuda pareciera más nueva
          // de lo que es: "hace 1 día" cuando en realidad son 14. Y la lista de
          // Deudas ordena por esta fecha, así que también salía mal ordenada.
          incurred_on: date,
        }
      }))
      .select(DEBT_COLS)

    if (splitError) {
      // Misma compensación que en el Sprint 2: si el reparto no entra, el gasto
      // no queda. El peor caso posible es un gasto normal sin reparto.
      await supabase.from('fin_transactions').delete().eq('id', tx.id).eq('profile_id', profileId)
      return NextResponse.json({ error: `No se pudo guardar el reparto: ${splitError.message}` }, { status: 400 })
    }
    debts = creados ?? []
  }

  // "Spotify subió de precio": actualizar la plantilla es explícito, nunca un
  // efecto colateral de registrar un mes más caro.
  if (body.update_template === true && amount !== base.amount) {
    await supabase.from('fin_recurring')
      .update({ amount, updated_at: new Date().toISOString() })
      .eq('id', id).eq('profile_id', profileId)
  }

  // La cuenta de ahorro elegida queda como default para la próxima vez —
  // mismo espíritu que `account_id` en la plantilla: no obliga a nada, solo
  // evita volver a elegir lo mismo todos los meses.
  if (esAhorro && toAccountId && toAccountId !== base.to_account_id) {
    await supabase.from('fin_recurring')
      .update({ to_account_id: toAccountId, updated_at: new Date().toISOString() })
      .eq('id', id).eq('profile_id', profileId)
  }

  return NextResponse.json({ transaction: { ...tx, debts } }, { status: 201 })
}
