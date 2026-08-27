import webpush from 'npm:web-push@3.6.7'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Envío de push del navegador.
 *
 * Estructura tomada de `_shared/push.ts` de Acrosoft CRM, adaptada al Hub: sus
 * propias tablas (`fin_push_subscriptions`), sus propias claves VAPID, su
 * propio proyecto. No comparte nada con el CRM salvo la forma.
 */

/** Cuántos envíos en paralelo por tanda. Con más, el servicio de push empieza a
 *  rechazar por rate limit y los errores tapan a los reales. */
const TANDA = 25

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:acrosagency@gmail.com'

let vapidListo = false
function ensureVapid() {
  if (vapidListo) return
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    throw new Error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en los secretos de la función')
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidListo = true
}

export interface Suscripcion {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface Payload {
  title: string
  body: string
  url?: string
}

/**
 * Manda un aviso a todos los dispositivos de una lista.
 *
 * Las suscripciones muertas se borran en el momento: `web-push` devuelve 404 o
 * 410 cuando el navegador desinstaló la PWA o limpió sus datos. Sin esa
 * limpieza, la tabla se llena de endpoints muertos, cada corrida gasta llamadas
 * en ellos y sus errores tapan a los reales.
 *
 * Cualquier OTRO error (red, 5xx del servicio de push) no borra nada: se
 * reintenta solo en la corrida siguiente, que llega en 15 minutos.
 */
export async function enviarPush(
  supabase: SupabaseClient,
  subs: Suscripcion[],
  payload: Payload,
): Promise<{ ok: number; fallaron: number; muertas: number }> {
  if (subs.length === 0) return { ok: 0, fallaron: 0, muertas: 0 }
  ensureVapid()

  const json = JSON.stringify(payload)
  let ok = 0
  let fallaron = 0
  const vencidas: string[] = []

  const mandarUna = async (s: Suscripcion) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
      )
      ok++
    } catch (err) {
      fallaron++
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) vencidas.push(s.id)
    }
  }

  for (let i = 0; i < subs.length; i += TANDA) {
    await Promise.all(subs.slice(i, i + TANDA).map(mandarUna))
  }

  if (vencidas.length > 0) {
    await supabase.from('fin_push_subscriptions').delete().in('id', vencidas)
  }

  return { ok, fallaron, muertas: vencidas.length }
}
