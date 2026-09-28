import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { listarCampanasActivas, MetaError } from '@/lib/ads-analizador/meta-api'
import { normalizarAdAccount } from '@/lib/ads-analizador/validar'

/** Campañas activas de una cuenta publicitaria, para el picker de "Agregar campaña". */
export async function GET(request: Request) {
  const { userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuenta = normalizarAdAccount(new URL(request.url).searchParams.get('ad_account_id'))
  if (!cuenta) {
    return NextResponse.json({ error: 'La cuenta publicitaria tiene que ser act_ seguido de números.' }, { status: 400 })
  }

  try {
    const campaigns = await listarCampanasActivas(cuenta)
    return NextResponse.json({ campaigns })
  } catch (e) {
    const sinToken = e instanceof MetaError && /Falta configurar/.test(e.message)
    return NextResponse.json(
      { error: sinToken ? 'La conexión con Meta todavía no está configurada. Pega el ID a mano por ahora.' : (e as Error).message },
      { status: sinToken ? 503 : 502 },
    )
  }
}
