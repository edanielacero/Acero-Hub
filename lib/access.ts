import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from './supabase-server'

type ApiAdmin =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

/**
 * Gate de admin para route handlers: devuelve la respuesta de error en vez de
 * redirigir. Con el custom access token hook registrado el rol viaja firmado en
 * el JWT y esto no cuesta ningún round-trip; el fallback a `profiles` cubre el
 * caso de que el hook se desregistre.
 *
 * El gate de NAVEGACIÓN de las mini-apps no vive acá sino en proxy.ts, contra
 * los permisos del token. Este es el que protege los DATOS, y por eso no se
 * apoya solo en el claim.
 */
export async function requireApiAdmin(): Promise<ApiAdmin> {
  const { supabase, userId, role: claimRole } = await requireUser()
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    }
  }

  let role = claimRole
  if (!role) {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    role = data?.role ?? 'user'
  }

  if (role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Prohibido' }, { status: 403 }),
    }
  }

  return { ok: true, userId, supabase }
}
