import { createClient, createAdminClient } from '@/lib/supabase-server'
import { getResend } from '@/lib/resend'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { email, name, projectIds } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const admin = createAdminClient()
  const { error: dbError } = await admin.from('invitations').insert({
    email,
    name: name || null,
    token,
    expires_at: expiresAt,
    created_by: user.id,
    project_ids: projectIds || [],
  })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`

  await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to: email,
    subject: 'Te invitaron a Acero Hub',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#f5f5f5;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Acero Hub</h2>
        <p style="color:#888;font-size:14px;margin-bottom:32px;">
          Hola${name ? ` ${name}` : ''}, tienes una invitación para acceder a Acero Hub.
        </p>
        <a href="${inviteUrl}" style="display:inline-block;background:#f5f5f5;color:#0a0a0a;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
          Aceptar invitación →
        </a>
        <p style="color:#444;font-size:12px;margin-top:32px;">
          Este enlace expira en 7 días. Si no esperabas este correo, ignóralo.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
