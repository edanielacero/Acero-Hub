import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { loadShared } from '@/lib/finanzas/load'
import { monthRange } from '@/lib/finanzas/transactions'

/** Todo el panel de Compartidos en un solo viaje. */
export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El mes lo puede fijar el cliente: "cobrado este mes" tiene que medirse
  // contra su calendario, no contra el UTC del servidor.
  const url = new URL(request.url)
  const fallback = monthRange()
  const range = {
    from: url.searchParams.get('from') || fallback.from,
    to: url.searchParams.get('to') || fallback.to,
  }

  return NextResponse.json(await loadShared(supabase, userId, range))
}
