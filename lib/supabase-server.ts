import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  )
}

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Identidad vía getClaims() (verifica el JWT, gratis en round-trips desde que
// el proyecto firma con clave asimétrica) en vez de getUser() (siempre pega
// la red). El cliente devuelto respeta RLS — pensado para rutas que ya no
// necesitan createAdminClient() para sus queries de datos.
export async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data) return { supabase, userId: null as string | null, claims: null }
  return { supabase, userId: data.claims.sub, claims: data.claims }
}
