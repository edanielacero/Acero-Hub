import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/**
 * El dispositivo que acaba de aceptar recibir notificaciones.
 *
 * Usa `requireUser` y no `requireProfile`: una suscripción es del USUARIO, no
 * de un perfil. Un teléfono es un teléfono y recibe los avisos de todos los
 * perfiles que estén encendidos; qué perfil generó cada aviso se decide al
 * evaluarlo, no acá.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth

  if (typeof endpoint !== 'string' || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción incompleta' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null

  // `upsert` por endpoint: volver a activar en el mismo navegador devuelve el
  // MISMO endpoint, así que sin esto cada visita a Ajustes sumaría una fila.
  const { error } = await supabase
    .from('fin_push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, p256dh, auth, user_agent: userAgent },
      { onConflict: 'endpoint' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Y se limpian los endpoints viejos del MISMO dispositivo.
  //
  // El upsert por endpoint no alcanza: reinstalar la PWA hace que Safari genere
  // un endpoint NUEVO sin invalidar el anterior, y Apple sigue aceptando los
  // dos. El resultado es cada aviso llegando duplicado al mismo teléfono, para
  // siempre — no se cura solo, porque ninguno devuelve 410.
  //
  // El user agent es la señal disponible para reconocer al mismo aparato. Es
  // una heurística: dos iPhones idénticos del mismo dueño se pisarían entre
  // sí, y el que pierda deja de recibir hasta que vuelva a activar. Preferible
  // a la alternativa, que es recibir todo por duplicado sin salida.
  if (userAgent) {
    await supabase
      .from('fin_push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('user_agent', userAgent)
      .neq('endpoint', endpoint)
  }

  return NextResponse.json({ ok: true })
}

/** Desactivar en ESTE dispositivo. Los demás siguen recibiendo. */
export async function DELETE(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 })
  }

  await supabase
    .from('fin_push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
