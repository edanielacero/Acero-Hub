import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const PREF_COLS =
  'fijos, presupuesto, ahorro, deudas, recordar_anotar, recordar_mediodia, recordar_noche, timezone'

const TIPOS = ['fijos', 'presupuesto', 'ahorro', 'deudas', 'recordar_anotar'] as const

const DEFAULTS = {
  fijos: true, presupuesto: true, ahorro: true, deudas: true, recordar_anotar: true,
  recordar_mediodia: '14:00', recordar_noche: '21:00', timezone: 'America/La_Paz',
}

/**
 * Los switches de notificaciones, más el estado real de este dispositivo.
 *
 * `this_device` es lo que le permite a la pantalla mostrar "Activar" o
 * "Desactivar acá" sin adivinar: el mismo usuario puede tener el push activado
 * en el celular y no en la computadora.
 */
export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const endpoint = new URL(request.url).searchParams.get('endpoint')

  const [{ data: prefs }, { data: subs }] = await Promise.all([
    supabase.from('fin_notif_prefs').select(PREF_COLS).eq('user_id', userId).maybeSingle(),
    supabase.from('fin_push_subscriptions').select('endpoint').eq('user_id', userId),
  ])

  return NextResponse.json({
    // Sin fila todavía: los defaults. Quien activó el push y no entró acá
    // quiere que le avisen de todo.
    prefs: prefs ?? DEFAULTS,
    devices: (subs ?? []).length,
    this_device: !!endpoint && (subs ?? []).some(s => s.endpoint === endpoint),
  })
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }

  for (const t of TIPOS) {
    if (body[t] !== undefined) patch[t] = Boolean(body[t])
  }

  for (const h of ['recordar_mediodia', 'recordar_noche'] as const) {
    if (body[h] === undefined) continue
    // Solo HH:MM. Un valor libre acá terminaría en un `time` inválido y el job
    // fallaría en silencio a las 2 de la mañana.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body[h]))) {
      return NextResponse.json({ error: 'La hora tiene que ser HH:MM' }, { status: 400 })
    }
    patch[h] = body[h]
  }

  if (typeof body.timezone === 'string' && body.timezone.length <= 64) {
    patch.timezone = body.timezone
  }

  const { data, error } = await supabase
    .from('fin_notif_prefs')
    .upsert(patch, { onConflict: 'user_id' })
    .select(PREF_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ prefs: data })
}
