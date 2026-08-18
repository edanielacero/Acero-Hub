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
  app_metadata?: { role?: string }
}

/**
 * Identidad del request. Verifica la firma del JWT localmente en vez de pegarle
 * a /auth/v1/user, que era un round-trip completo a Supabase Auth por request.
 *
 * `role` sale del custom access token hook (ver
 * 20260813010000_custom_access_token_hook.sql). Si el hook todavía no está
 * registrado en el Dashboard el claim no viene y devuelve null — quien lo
 * necesite tiene que caer a consultar `profiles`. Ver requireProjectAccess().
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
