import { createAdminClient, requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRates } from '@/lib/finanzas/exchange-rates'

// Invocable de dos formas:
// 1. Cron de Vercel (vercel.json) con `Authorization: Bearer $CRON_SECRET` — no tiene
//    sesión de usuario, así que refresca la tasa para todos los user_id que ya tengan
//    cuentas en Finanzas. Esto SÍ necesita el cliente admin: escribe para usuarios
//    distintos al que hace la request, algo que ninguna policy de RLS por diseño
//    (user_id = auth.uid()) puede autorizar — la validación de CRON_SECRET es la
//    puerta acá, no RLS.
// 2. Botón "actualizar" en /finanzas/tipo-cambio con sesión de usuario normal — solo
//    refresca la tasa del usuario logueado, vía RLS.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  let userIds: string[]
  let writeClient: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof requireUser>>['supabase']

  if (isCron) {
    const admin = createAdminClient()
    const { data, error } = await admin.from('fin_accounts').select('user_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    userIds = [...new Set((data ?? []).map(r => r.user_id as string))]
    writeClient = admin
  } else {
    const { supabase, userId } = await requireUser()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userIds = [userId]
    writeClient = supabase
  }

  const results = await fetchAllRates()

  if (userIds.length > 0) {
    const rows = userIds.flatMap(userId =>
      results
        .filter(r => r.ok)
        .map(r => {
          const { pair, rate, source } = (r as Extract<typeof r, { ok: true }>).rate
          return { user_id: userId, pair, rate, source, is_manual_override: false }
        }),
    )
    if (rows.length > 0) {
      const { error } = await writeClient.from('fin_exchange_rates').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ results, updatedFor: userIds.length })
}
