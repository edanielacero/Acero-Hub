import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { BUDGET_LINE_COLS } from '../route'

/**
 * `archived`, `name` y/o `category_ids`. `input_currency` y `retroactive`
 * siguen siendo inmutables (se eligen una sola vez, al crear la línea —
 * §3.1 del spec); para el monto de cada mes está `/period`, y para el
 * rollover, `/close`.
 *
 * Las categorías SÍ se pueden cambiar: con grupos de varias, "agregarle una
 * más" es algo que se espera poder hacer sin empezar de cero — borrar y
 * recrear costaría todo el historial (montos por mes, ampliaciones, cierres
 * con su arrastre). Se reemplaza el conjunto entero, no de a una: es lo que
 * el selector del sheet ya arma. La exclusividad entre líneas la sigue
 * garantizando el índice único de `fin_budget_line_categories`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || (body.archived === undefined && body.name === undefined && body.category_ids === undefined)) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)
  if (body.name !== undefined) patch.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null

  let categoryIds: string[] | null = null
  if (body.category_ids !== undefined) {
    const raw: string[] = Array.isArray(body.category_ids)
      ? body.category_ids.filter((c: unknown): c is string => typeof c === 'string' && !!c)
      : []
    const ids = [...new Set(raw)]
    // Una línea sin ninguna categoría no significa nada — y el trigger de la
    // base la borraría entera, que no es lo que "editar" debería hacer.
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Elige al menos una categoría' }, { status: 400 })
    }

    const { data: categories } = await supabase
      .from('fin_categories').select('id, kind, archived').eq('profile_id', profileId).in('id', ids)
    if ((categories ?? []).length !== ids.length) {
      return NextResponse.json({ error: 'Alguna de esas categorías no existe' }, { status: 400 })
    }
    if ((categories ?? []).some(c => c.kind !== 'gasto')) {
      return NextResponse.json({ error: 'El presupuesto solo aplica a categorías de gasto' }, { status: 400 })
    }
    if ((categories ?? []).some(c => c.archived)) {
      return NextResponse.json({ error: 'No se puede presupuestar una categoría archivada' }, { status: 400 })
    }

    // Chequeo previo para un mensaje legible: las que ya estén tomadas por
    // OTRA línea. Las de esta misma no cuentan — se están reescribiendo.
    const { data: taken } = await supabase
      .from('fin_budget_line_categories').select('category_id, line_id').eq('profile_id', profileId).in('category_id', ids)
    if ((taken ?? []).some(t => t.line_id !== id)) {
      return NextResponse.json({ error: 'Alguna de esas categorías ya tiene un presupuesto' }, { status: 409 })
    }

    categoryIds = ids
  }

  const { data, error } = Object.keys(patch).length > 0
    ? await supabase
        .from('fin_budget_lines')
        .update(patch)
        .eq('id', id).eq('profile_id', profileId)
        .select(BUDGET_LINE_COLS)
        .single()
    : await supabase
        .from('fin_budget_lines')
        .select(BUDGET_LINE_COLS)
        .eq('id', id).eq('profile_id', profileId)
        .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (categoryIds) {
    // Se agregan las nuevas ANTES de sacar las viejas: si se borraran primero
    // y la línea se quedara un instante sin ninguna, el trigger de limpieza
    // (`fin_budget_line_categories_cleanup`) la borraría entera.
    const { error: insertError } = await supabase
      .from('fin_budget_line_categories')
      .upsert(
        categoryIds.map(category_id => ({ user_id: userId, profile_id: profileId, line_id: id, category_id })),
        { onConflict: 'line_id,category_id', ignoreDuplicates: true },
      )
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    const { error: deleteError } = await supabase
      .from('fin_budget_line_categories')
      .delete()
      .eq('profile_id', profileId).eq('line_id', id)
      .not('category_id', 'in', `(${categoryIds.join(',')})`)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  // Archivar deja la línea invisible en todos lados (`loadBudgets` solo trae
  // `archived = false`) — sin esto sus categorías quedaban "reservadas" para
  // siempre por el índice único de `fin_budget_line_categories`, sin ninguna
  // línea activa que las mostrara.
  if (patch.archived === true) {
    await supabase.from('fin_budget_line_categories').delete().eq('line_id', id).eq('profile_id', profileId)
  }

  return NextResponse.json({ line: data })
}

/**
 * Sin `409` posible: una línea es configuración, no historial de plata real.
 * `on delete cascade` se lleva sus períodos, ampliaciones y cierres.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: borradas, error } = await supabase.from('fin_budget_lines').delete().eq('id', id).eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Ese presupuesto no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
