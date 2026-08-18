import { requireUser, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { refreshQuotes } from '@/lib/finanzas/quotes'

/**
 * Trae las cotizaciones del mercado y las guarda.
 *
 * Dos formas de entrar:
 *  · El cron diario de Vercel, con `Authorization: Bearer $CRON_SECRET`.
 *  · El usuario logueado, desde el botón "Actualizar ahora" de Ajustes.
 *
 * Escribe con el cliente admin porque `fin_quotes` es una tabla global sin
 * policies de escritura: son precios de mercado, no datos de nadie.
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  const fromCron = !!secret && auth === `Bearer ${secret}`

  if (!fromCron) {
    const { userId } = await requireUser()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const quotes = await refreshQuotes(createAdminClient())
  const traidas = Object.keys(quotes).length

  if (traidas === 0) {
    return NextResponse.json(
      { error: 'Ninguna fuente respondió. Se conservan las cotizaciones anteriores.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, quotes, traidas })
}

// El cron de Vercel pega con GET.
export async function GET(request: Request) {
  return POST(request)
}
