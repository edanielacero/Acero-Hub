import { createBrowserClient } from '@supabase/ssr'
import { navigatorLock } from '@supabase/auth-js'

/**
 * Sin `lock`, cada pestaña refresca el token de sesión por su cuenta. Con
 * varias pestañas de mini-apps abiertas (uso normal de este Hub) y el token
 * vencido, todas corren a refrescarlo casi al mismo tiempo contra el mismo
 * refresh token de un solo uso — la que pierde la carrera queda sin sesión
 * válida y `SessionKeeper` la manda a /login aunque el usuario siga logueado
 * en el resto. `navigatorLock` serializa el refresco entre pestañas del mismo
 * navegador usando la Web Locks API.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { lock: navigatorLock } }
  )
}
