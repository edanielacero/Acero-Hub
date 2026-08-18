/**
 * Caché del JWKS del proyecto, compartido entre el proxy y el código de server.
 *
 * getClaims() verifica el JWT contra la clave pública del proyecto (ES256), lo
 * que en teoría no cuesta red. En la práctica sí costaba: auth-js cachea el
 * JWKS en la instancia del cliente (`this.jwks`), y acá se crea un cliente
 * nuevo en cada request — así que ese caché nacía vacío y bajaba el JWKS otra
 * vez, cada vez. A nivel de módulo sobrevive mientras la instancia siga
 * caliente, y getClaims() pasa a ser de verdad una verificación local.
 *
 * Sin dependencias de `next/headers` a propósito: el proxy corre en el runtime
 * de middleware, donde ese import no existe.
 */
import type { JWK } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const JWKS_TTL_MS = 10 * 60 * 1000

let keys: JWK[] | null = null
let fetchedAt = 0
let inFlight: Promise<JWK[] | null> | null = null

export async function getJwks(): Promise<JWK[] | null> {
  if (keys && Date.now() - fetchedAt < JWKS_TTL_MS) return keys

  // Una sola bajada aunque entren varios requests juntos con el caché frío.
  inFlight ??= (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      })
      if (!res.ok) return null
      const data = (await res.json()) as { keys?: JWK[] }
      if (!data.keys?.length) return null
      keys = data.keys
      fetchedAt = Date.now()
      return keys
    } catch {
      // Si falla, getClaims() cae solo a su propio camino (bajar el JWKS o,
      // en última instancia, getUser()). Nunca deja a nadie sin autenticar.
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
