import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, password, name } = await request.json()
  if (!token || !password) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: invitation, error: invErr } = await admin
    .from('invitations')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .single()

  if (invErr || !invitation) return NextResponse.json({ error: 'Invitación inválida o expirada' }, { status: 400 })
  if (new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: 'Invitación expirada' }, { status: 400 })

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { name: name || invitation.name || invitation.email.split('@')[0] },
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const userId = authData.user.id

  await admin.from('profiles').upsert({
    id: userId,
    email: invitation.email,
    name: name || invitation.name || invitation.email.split('@')[0],
    role: 'user',
  })

  if (invitation.project_ids?.length > 0) {
    await admin.from('project_access').insert(
      invitation.project_ids.map((projectId: string) => ({
        user_id: userId,
        project_id: projectId,
        granted_by: invitation.created_by,
      }))
    )
  }

  await admin.from('invitations').update({ used_at: new Date().toISOString() }).eq('id', invitation.id)

  return NextResponse.json({ success: true, email: invitation.email })
}
