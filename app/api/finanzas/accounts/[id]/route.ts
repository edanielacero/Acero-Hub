import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

/** Cuántos movimientos tocan esta cuenta, como origen o como destino. */
async function txCount(
  supabase: Awaited<ReturnType<typeof requireProfile>>['supabase'],
  profileId: string,
  accountId: string,
): Promise<number> {
  const { count } = await supabase
    .from('fin_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  return count ?? 0
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'La cuenta necesita un nombre' }, { status: 400 })
    patch.name = name
  }

  if (body.currency !== undefined) {
    if (!CURRENCIES.includes(body.currency as Currency)) {
      return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    }
    // Cambiar la moneda reinterpretaría todos los movimientos ya registrados
    // en esta cuenta, que quedaron congelados con la moneda anterior.
    if (await txCount(supabase, profileId, id) > 0) {
      return NextResponse.json(
        { error: 'No se puede cambiar la moneda de una cuenta que ya tiene movimientos' },
        { status: 409 },
      )
    }
    patch.currency = body.currency
  }

  if (body.initial_balance !== undefined) patch.initial_balance = num(body.initial_balance)
  if (body.initial_balance_date !== undefined) patch.initial_balance_date = body.initial_balance_date
  if (body.sort_order !== undefined) patch.sort_order = num(body.sort_order)
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)

  if (body.is_investment !== undefined) {
    const wantsInvestment = Boolean(body.is_investment)
    const { data: currentAccount } = await supabase
      .from('fin_accounts').select('is_investment').eq('id', id).eq('profile_id', profileId).maybeSingle()

    // Cambiar el flag en CUALQUIER dirección con `gasto`/`ingreso ·
    // movimiento` ya cargados los deja ambiguos: isInvestmentAdjustment()
    // (lib/finanzas/transactions.ts) decide solo mirando el flag actual de la
    // cuenta, así que esas filas —actualizaciones de valor, aportes de
    // pasanaku o reembolsos— cambiarían de categoría con el toggle y
    // desaparecerían (o aparecerían) en Movimientos sin haberse tocado ellas
    // mismas. Antes solo se guardaba al DESmarcar (§7.2 de
    // contexto_finanzas.md); marcarla como inversión con aportes de pasanaku
    // ya registrados tenía el mismo problema y no lo bloqueaba nada.
    if (currentAccount && wantsInvestment !== currentAccount.is_investment) {
      const { count } = await supabase
        .from('fin_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('account_id', id)
        .in('type', ['gasto', 'ingreso'])
        .eq('flow_type', 'movimiento')

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: wantsInvestment
              ? 'No se puede marcar como inversión: ya tiene aportes de pasanaku o reembolsos registrados'
              : 'No se puede desmarcar como inversión: ya tiene actualizaciones de valor registradas',
          },
          { status: 409 },
        )
      }
    }
    patch.is_investment = wantsInvestment
  }

  const { data, error } = await supabase
    .from('fin_accounts')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', profileId)
    .select(ACCOUNT_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  return NextResponse.json({ account: data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  if (await txCount(supabase, profileId, id) > 0) {
    return NextResponse.json(
      { error: 'Esta cuenta tiene movimientos. Archivala en vez de borrarla para no perder su historial.' },
      { status: 409 },
    )
  }

  // fin_pasanaku.account_id es `on delete restrict`: sin este chequeo, un
  // pasanaku recién creado sin ningún aporte todavía (txCount en 0, porque
  // no es un movimiento) dejaba pasar el guard de arriba y el DELETE fallaba
  // recién en la base con el mensaje crudo del constraint de Postgres.
  const { count: pasanakuCount } = await supabase
    .from('fin_pasanaku')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('account_id', id)
  if ((pasanakuCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Esta cuenta tiene un pasanaku asociado. Archívala en vez de borrarla, o borra el pasanaku primero.' },
      { status: 409 },
    )
  }

  // Misma razón que el pasanaku: `fin_recurring.account_id`/`to_account_id`
  // son `on delete restrict`, así que un fijo que use esta cuenta hacía morir
  // el DELETE con el mensaje crudo del constraint. Se nombra el fijo, que es
  // lo único accionable.
  const { data: fijos } = await supabase
    .from('fin_recurring')
    .select('name')
    .eq('profile_id', profileId)
    .or(`account_id.eq.${id},to_account_id.eq.${id}`)

  if ((fijos ?? []).length > 0) {
    const nombres = (fijos ?? []).map(f => f.name as string).join(', ')
    return NextResponse.json(
      { error: `Esta cuenta la usan fijos tuyos (${nombres}). Cámbialos o bórralos antes de borrarla.` },
      { status: 409 },
    )
  }

  const { data: borradas, error } = await supabase
    .from('fin_accounts')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Esa cuenta no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
