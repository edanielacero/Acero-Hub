import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { CAMPANA_COLS, cargarCampanas, hoyServidor, mapCampana } from '@/lib/ads-analizador/load'
import { validarAlta } from '@/lib/ads-analizador/validar'

/** Todas las campañas del usuario, cada una con su semáforo ya calculado. */
export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const hoy = hoyServidor()
    const campaigns = await cargarCampanas(supabase, hoy)
    return NextResponse.json({ campaigns, hoy })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Alta de una campaña. `roas_objetivo` no se acepta acá: nace automático. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const v = validarAlta(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('ads_campaigns')
    .insert({ ...v.valor, user_id: userId })
    .select(CAMPANA_COLS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Esta campaña ya está trackeada.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ campana: mapCampana(data) }, { status: 201 })
}
