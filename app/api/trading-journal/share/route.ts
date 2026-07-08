import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { sessionId, toEmail } = await req.json()
  if (!sessionId || !toEmail) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const email = String(toEmail).toLowerCase().trim()

  const [{ data: session }, { data: senderProfile }, { data: project }] = await Promise.all([
    admin.from('tj_sessions').select('id, name').eq('id', sessionId).eq('user_id', user.id).single(),
    admin.from('profiles').select('name, email').eq('id', user.id).single(),
    admin.from('projects').select('id').eq('slug', 'trading-journal').single(),
  ])

  if (!session) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  // Buscar receptor con comparación case-insensitive
  const { data: receiver } = await admin
    .from('profiles')
    .select('id, name, role')
    .ilike('email', email)
    .maybeSingle()

  if (!receiver) return NextResponse.json({ error: 'El correo no está registrado en Acero Hub' }, { status: 404 })
  if (receiver.id === user.id) return NextResponse.json({ error: 'No puedes compartir una sesión contigo mismo' }, { status: 400 })

  // Verificar que el receptor tiene acceso a Trading Journal
  if (receiver.role !== 'admin' && project) {
    const { data: access } = await admin
      .from('project_access')
      .select('id')
      .eq('user_id', receiver.id)
      .eq('project_id', project.id)
      .maybeSingle()

    if (!access) {
      return NextResponse.json(
        { error: 'Este usuario no tiene permiso para usar Trading Journal' },
        { status: 403 }
      )
    }
  }

  const { data: existing } = await admin
    .from('tj_share_invitations')
    .select('id')
    .eq('session_id', sessionId)
    .eq('from_user_id', user.id)
    .eq('to_email', email)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Ya tienes una invitación pendiente para esta sesión con ese usuario' }, { status: 409 })

  const { data: invitation, error: invErr } = await admin
    .from('tj_share_invitations')
    .insert({ from_user_id: user.id, to_email: email, session_id: sessionId, status: 'pending' })
    .select()
    .single()
  if (invErr || !invitation) return NextResponse.json({ error: 'Error al crear la invitación' }, { status: 500 })

  const fromName = senderProfile?.name || senderProfile?.email || 'Alguien'

  await admin.from('tj_notifications').insert({
    user_id: receiver.id,
    type: 'session_share',
    payload: {
      invitationId: invitation.id,
      fromName,
      fromUserId:   user.id,
      sessionName:  session.name,
      sessionId,
    },
    read: false,
  })

  return NextResponse.json({ success: true })
}
