import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from './supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * slug → id de `projects`. La tabla cambia cuando se agrega una mini-app nueva,
 * o sea casi nunca, así que no tiene sentido pagar una query por request. El
 * caché de Next se comparte entre instancias del mismo deploy; se invalida solo
 * al vencer el TTL o al redeployar.
 */
const projectIdBySlug = unstable_cache(
  async (slug: string): Promise<string | null> => {
    const { data } = await createAdminClient()
      .from('projects')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    return data?.id ?? null
  },
  ['project-id-by-slug'],
  { revalidate: 3600, tags: ['projects'] }
)

export type ProjectRow = {
  id: string
  name: string
  slug: string
  description: string | null
}

/** Catálogo completo de mini-apps. Mismo razonamiento de caché que arriba. */
export const listProjects = unstable_cache(
  async (): Promise<ProjectRow[]> => {
    const { data } = await createAdminClient()
      .from('projects')
      .select('id, name, slug, description')
      .order('name')
    return data ?? []
  },
  ['projects-list'],
  { revalidate: 3600, tags: ['projects'] }
)

type Options<F extends string> = {
  /** Campos extra de `profiles`. Sin esto no se consulta la tabla. */
  profileFields?: readonly F[]
}

type Profile = Record<string, string | null>

/**
 * Gate de acceso a una mini-app del Hub. Reemplaza el combo
 * `getUser()` + `profiles` + `project_access` que cada layout repetía en serie.
 *
 * Costo en el caso normal (admin, con el hook de claims registrado y sin pedir
 * campos de perfil): cero round-trips — el rol viaja firmado dentro del JWT.
 */
export async function requireProjectAccess<F extends string = never>(
  slug: string,
  { profileFields = [] as unknown as readonly F[] }: Options<F> = {}
): Promise<{ userId: string; role: string; profile: Profile | null }> {
  const { userId, role: claimRole } = await requireUser()
  if (!userId) redirect('/login')

  const admin = createAdminClient()

  // Solo se toca `profiles` si hacen falta campos extra, o si el hook de
  // custom claims todavía no está registrado y por eso no vino el rol.
  const needsProfile = profileFields.length > 0 || !claimRole
  const profilePromise = needsProfile
    ? admin
        .from('profiles')
        .select([...new Set<string>(['role', ...profileFields])].join(', '))
        .eq('id', userId)
        .single()
    : null

  // El id del proyecto se pide en paralelo con el perfil: hace falta solo si el
  // usuario no es admin, pero esperar a saberlo lo volvería un salto en serie.
  // Si el JWT ya dice que es admin no hace falta ni eso. El .catch() evita que
  // quede una promesa rechazada sin dueño cuando la rama admin no la espera.
  const projectPromise =
    claimRole === 'admin' ? null : projectIdBySlug(slug).catch(() => null)

  const profile = ((await profilePromise)?.data ?? null) as Profile | null
  const role = claimRole ?? profile?.role ?? 'user'

  if (role !== 'admin') {
    const projectId = await (projectPromise ?? projectIdBySlug(slug))
    if (!projectId) redirect('/')

    const { data: access } = await admin
      .from('project_access')
      .select('id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!access) redirect('/')
  }

  return { userId, role, profile }
}

/** Gate para mini-apps personales: el único requisito es ser admin. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId, role: claimRole } = await requireUser()
  if (!userId) redirect('/login')

  let role = claimRole
  if (!role) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    role = data?.role ?? 'user'
  }

  if (role !== 'admin') redirect('/')
  return { userId }
}


type ApiAdmin =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

/**
 * Gate de admin para route handlers: devuelve la respuesta de error en vez de
 * redirigir. Con el hook de custom claims registrado no cuesta ningún
 * round-trip; antes eran dos en serie (getUser + query a `profiles`).
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
