import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getJwks } from './jwks'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}

export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type Claims = {
  sub: string
  email?: string
  /** `name` lo firma el custom access token hook desde `public.profiles.name`
      (ver 20260818030000_custom_claims_projects.sql). */
  app_metadata?: { role?: string; name?: string }
}

/**
 * Identidad del request. Verifica la firma del JWT localmente en vez de pegarle
 * a /auth/v1/user, que era un round-trip completo a Supabase Auth por request.
 *
 * `role` sale del custom access token hook (ver
 * 20260813010000_custom_access_token_hook.sql). Si el hook todavía no está
 * registrado en el Dashboard el claim no viene y devuelve null — quien lo
 * necesite tiene que caer a consultar `profiles`. Ver requireApiAdmin().
 *
 * El cliente devuelto respeta RLS.
 */
export async function requireUser() {
  const supabase = await createClient()
  const keys = await getJwks()
  const { data } = await supabase.auth.getClaims(undefined, keys ? { keys } : undefined)

  if (!data) {
    return { supabase, userId: null as string | null, claims: null, role: null as string | null }
  }

  const claims = data.claims as unknown as Claims
  return {
    supabase,
    userId: claims.sub,
    claims,
    role: claims.app_metadata?.role ?? null,
  }
}

/**
 * Identidad **y perfil activo** del request (Finanzas, Sprint 8).
 *
 * Spec: documentos/finanzas/sprint_8_perfiles.md §4.2
 *
 * Devuelve los dos ids porque cumplen papeles distintos y ninguno reemplaza al
 * otro:
 *
 * - `profileId` es el que **filtra**: toda lectura del dominio lleva
 *   `.eq('profile_id', profileId)`. Es lo que aísla un perfil de otro.
 * - `userId` es el que **escribe**: todo insert sigue guardando `user_id`,
 *   porque es lo que sostiene RLS. Sin él, la fila no pasa la policy.
 *
 * La FK compuesta `(profile_id, user_id) → fin_profiles(id, user_id)` garantiza
 * que los dos no puedan quedar en desacuerdo.
 *
 * El perfil se lee de `?profile=<id>`; si no viene o es inválido, cae al
 * default (ver `resolveProfile`, que además lo crea si el usuario no tiene
 * ninguno). Nunca devuelve un `profileId` vacío con `userId` presente.
 */
export async function requireProfile(request?: Request) {
  const { supabase, userId, claims, role } = await requireUser()
  if (!userId) {
    return { supabase, userId: null as string | null, profileId: null as string | null, profiles: [], claims, role }
  }

  const { resolveProfile } = await import('./finanzas/profiles')

  // El perfil llega por dos vías, en este orden:
  //
  //   1. `?profile=` — explícito. Lo usa la suite de pruebas, que necesita
  //      hablar de varios perfiles desde una misma sesión.
  //   2. La cookie `fz_profile` — la que usa la app de verdad.
  //
  // La cookie es lo que hace que ninguna petición pueda "olvidarse" del perfil:
  // viaja sola. Depender de que cada punto de llamada agregara `?profile=`
  // falló tres veces, y siempre en silencio — leyendo y escribiendo en el
  // perfil default sin que nada lo dijera.
  const query = request ? new URL(request.url).searchParams.get('profile') : null
  const cookieStore = await cookies()
  const requested = query ?? cookieStore.get('fz_profile')?.value ?? null

  // El nombre solo se usa si hay que CREAR el perfil principal: es su nombre
  // inicial, en vez de un "Personal" genérico.
  const nombre = claims?.app_metadata?.name ?? null
  const { profileId, profiles } = await resolveProfile(supabase, userId, requested, nombre)

  return { supabase, userId, profileId, profiles, claims, role }
}
