import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/** Borrar un aporte histórico — nunca tocó ningún saldo, así que no hay
    nada que compensar: se borra y listo. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('fin_pasanaku_historico').delete().eq('id', id).eq('profile_id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
