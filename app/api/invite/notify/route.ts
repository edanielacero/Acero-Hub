import { createClient, createAdminClient } from '@/lib/supabase-server'
import { getResend } from '@/lib/resend'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/` },
  })

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  const loginUrl = linkData.properties?.action_link

  const { error: emailError } = await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to: email,
    subject: 'Acceso a Acero Hub',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#f5f5f5;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Acero Hub</h2>
        <p style="color:#888;font-size:14px;margin-bottom:32px;">
          El administrador te ha dado acceso a Acero Hub. Usa este enlace para ingresar:
        </p>
        <a href="${loginUrl}" style="display:inline-block;background:#f5f5f5;color:#0a0a0a;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
          Ingresar a Acero Hub →
        </a>
        <p style="color:#444;font-size:12px;margin-top:32px;">
          Este enlace es de un solo uso y expira en 24 horas.
        </p>
      </div>
    `,
  })

  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
