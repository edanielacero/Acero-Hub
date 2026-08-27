/**
 * Autorización de las funciones internas de Finanzas.
 *
 * Inspirado en `_shared/internal-auth.ts` de Acrosoft CRM, con una diferencia
 * deliberada: acá el disparador NO usa la service role key.
 *
 * POR QUÉ UN SECRETO PROPIO
 *
 * `pg_cron` tiene que llevar el secreto escrito en la definición del job, que
 * vive en la tabla `cron.job`. Poner ahí la service role key significa que la
 * llave de toda la base queda en una fila de Postgres, y que rotarla obliga a
 * reescribir todos los jobs.
 *
 * `FIN_CRON_SECRET` solo sirve para disparar estas funciones. Si se filtra, lo
 * peor que alguien puede hacer es pedir que se evalúen las notificaciones —
 * molesto, no grave. Y rotarlo es cambiar un secreto y un job.
 *
 * (Detalle que costó encontrar: el runtime de Edge Functions tiene la clave
 * NUEVA de Supabase, `sb_secret_…` de 41 caracteres, mientras que `.env.local`
 * guarda la JWT legacy de 219. Las dos son válidas y son distintas, así que
 * compararlas entre sí nunca iba a funcionar.)
 */

export function esInterno(req: Request): boolean {
  const secreto = Deno.env.get('FIN_CRON_SECRET')
  if (!secreto) return false

  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  return timingSafeEqual(auth, secreto)
}

/** Devuelve la respuesta de rechazo, o `null` si la llamada es legítima. */
export function requireInterno(req: Request): Response | null {
  if (esInterno(req)) return null
  return new Response(JSON.stringify({ error: 'No autorizado' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre secretos sale antes en el primer carácter distinto, y esa
 * diferencia de microsegundos es suficiente para adivinar el secreto de a un
 * carácter por vez. Acá el riesgo es bajo, pero la versión correcta cuesta
 * cinco líneas.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return dif === 0
}
