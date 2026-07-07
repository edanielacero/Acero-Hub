import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: notifications } = await admin
    .from('tj_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const unread = (notifications ?? []).filter(n => !n.read).length
  return NextResponse.json({ notifications: notifications ?? [], unread })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { notificationId, action } = await req.json()

  if (action === 'read_all') {
    await admin.from('tj_notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    return NextResponse.json({ success: true })
  }

  if (!notificationId) return NextResponse.json({ error: 'notificationId requerido' }, { status: 400 })

  const { data: notif } = await admin
    .from('tj_notifications')
    .select('*')
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .single()
  if (!notif) return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 })

  if (action === 'read') {
    await admin.from('tj_notifications').update({ read: true }).eq('id', notificationId)
    return NextResponse.json({ success: true })
  }

  const invitationId = notif.payload?.invitationId
  if (!invitationId) return NextResponse.json({ error: 'Invitación inválida' }, { status: 400 })

  const { data: invitation } = await admin
    .from('tj_share_invitations')
    .select('*')
    .eq('id', invitationId)
    .single()
  if (!invitation) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })
  if (invitation.status !== 'pending') return NextResponse.json({ error: 'Esta invitación ya fue procesada' }, { status: 409 })

  if (action === 'reject') {
    await Promise.all([
      admin.from('tj_share_invitations').update({ status: 'rejected' }).eq('id', invitationId),
      admin.from('tj_notifications').update({ read: true }).eq('id', notificationId),
    ])
    return NextResponse.json({ success: true })
  }

  if (action === 'accept') {
    const { data: original } = await admin
      .from('tj_sessions')
      .select('*')
      .eq('id', invitation.session_id)
      .single()

    if (!original) {
      await Promise.all([
        admin.from('tj_share_invitations').update({ status: 'rejected' }).eq('id', invitationId),
        admin.from('tj_notifications').update({ read: true }).eq('id', notificationId),
      ])
      return NextResponse.json({ error: 'La sesión ya no existe' }, { status: 404 })
    }

    const { data: copy, error: sessionError } = await admin
      .from('tj_sessions')
      .insert({
        user_id:         user.id,
        type:            original.type,
        name:            original.name,
        description:     original.description,
        instrument:      original.instrument,
        capital_initial: original.capital_initial,
        is_archived:     false,
        is_favorite:     false,
      })
      .select()
      .single()

    if (sessionError || !copy) return NextResponse.json({ error: 'Error al aceptar la sesión' }, { status: 500 })

    const [{ data: varDefs }, { data: trades }] = await Promise.all([
      admin.from('tj_variable_definitions').select('*').eq('session_id', invitation.session_id),
      admin.from('tj_trades').select('*').eq('session_id', invitation.session_id),
    ])

    if (varDefs && varDefs.length > 0) {
      const varCopies = varDefs.map(({ id: _id, created_at: _ca, session_id: _sid, ...rest }) => ({
        ...rest,
        session_id: copy.id,
      }))
      await admin.from('tj_variable_definitions').insert(varCopies)
    }

    if (trades && trades.length > 0) {
      const tradeCopies = trades.map(({
        id: _id, created_at: _ca, session_id: _sid, linked_trade_id: _lt, ...rest
      }) => ({ ...rest, session_id: copy.id, linked_trade_id: null }))
      await admin.from('tj_trades').insert(tradeCopies)
    }

    await Promise.all([
      admin.from('tj_share_invitations').update({ status: 'accepted' }).eq('id', invitationId),
      admin.from('tj_notifications').update({ read: true }).eq('id', notificationId),
    ])

    return NextResponse.json({ success: true, sessionId: copy.id })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
