import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireInterno } from '../_shared/internal-auth.ts'
import { enviarPush, type Suscripcion } from '../_shared/push.ts'

/**
 * Manda una notificación de prueba a los dispositivos de un usuario.
 *
 * Existe porque "activé las notificaciones" y "las notificaciones funcionan"
 * son dos cosas distintas: entre una y otra hay claves VAPID, un service
 * worker, el permiso del navegador y el servicio de push de Apple o Google.
 * Sin una prueba, la primera señal de que algo está mal sería un fijo que
 * venció y del que nadie te avisó.
 *
 * NO escribe en `fin_notifications`: una prueba no es un hecho financiero, y
 * registrarla ocuparía una clave de deduplicación para siempre.
 *
 * Solo interna. La invoca `POST /api/finanzas/push/test`, que es quien
 * verifica que el usuario sea el dueño de los dispositivos.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (req) => {
  const rechazo = requireInterno(req)
  if (rechazo) return rechazo

  const body = await req.json().catch(() => ({}))
  const userId = body?.user_id
  if (typeof userId !== 'string') {
    return NextError('Falta user_id', 400)
  }

  const { data } = await supabase
    .from('fin_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  const subs = (data ?? []) as Suscripcion[]
  if (subs.length === 0) {
    return NextError('Este usuario no tiene ningún dispositivo activado', 404)
  }

  const r = await enviarPush(supabase, subs, {
    title: body?.title ?? 'Las notificaciones funcionan',
    body: body?.body ?? 'Así te vamos a avisar cuando venza un fijo o te pases del presupuesto.',
    url: '/finanzas/ajustes/notificaciones',
  })

  return new Response(JSON.stringify({ dispositivos: subs.length, ...r }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})

function NextError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}
