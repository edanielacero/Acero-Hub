import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/** Borrar un aporte histórico — nunca tocó ningún saldo, así que no hay
    nada que compensar: se borra y listo. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: borradas, error } = await supabase.from('fin_pasanaku_historico').delete().eq('id', id).eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Ese aporte no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
