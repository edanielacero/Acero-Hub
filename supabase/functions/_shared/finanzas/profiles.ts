// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ACCENT_KEYS, PROFILE_COLS, SEED_CATEGORIES, type AccentKey, type Profile } from './types.ts'

/**
 * Perfiles: los cajones de finanzas aislados de un mismo usuario (Sprint 8).
 *
 * Spec: documentos/finanzas/sprint_8_perfiles.md
 *
 * Dos cosas que conviene tener presentes al tocar este archivo:
 *
 * 1. **RLS protege entre usuarios, no entre perfiles.** `auth.uid()` no sabe en
 *    qué perfil estás — el perfil activo es un concepto del request. El
 *    aislamiento entre tus propios perfiles lo aplica el filtro `profile_id` de
 *    cada consulta, no la base. Lo que la base sí garantiza, vía la FK compuesta
 *    `(profile_id, user_id)`, es que nunca escribas en el perfil de otro.
 *
 * 2. **Nunca hay un usuario sin perfil.** `resolveProfile` lo crea si falta, con
 *    sus categorías sembradas. Esa rama no existe en la UI.
 */

/** Las tablas cuyo contenido pertenece a un perfil. `fin_rates`, `fin_quotes` y
 *  `fin_settings` quedan afuera a propósito: son globales del usuario. */
export const PROFILE_TABLES = [
  'fin_accounts', 'fin_transactions', 'fin_categories', 'fin_people',
  'fin_debts', 'fin_debt_plans', 'fin_recurring', 'fin_recurring_splits',
  'fin_pasanaku', 'fin_pasanaku_historico', 'fin_budget_periods',
  'fin_budget_lines', 'fin_budget_line_categories', 'fin_budget_extensions',
  'fin_budget_closures', 'fin_savings_goals', 'fin_savings_closures',
] as const

/**
 * El acento que le toca a un perfil nuevo: la primera clave libre.
 *
 * Del sexto en adelante se reciclan las paletas — se repite color antes que
 * bloquear la creación. Nadie va a llegar ahí, y si llega, el perfil funciona
 * igual.
 */
export function nextAccent(usados: AccentKey[]): AccentKey {
  return ACCENT_KEYS.find(a => !usados.includes(a)) ?? ACCENT_KEYS[usados.length % ACCENT_KEYS.length]
}

/**
 * Cómo se llama el perfil principal de alguien.
 *
 * El nombre de pila del usuario, no "Personal". La app ya lo saluda así en la
 * Home, y el encabezado muestra el nombre del perfil activo cuando hay más de
 * uno: con el nombre de pila, el título dice lo mismo tengas un perfil o tres.
 * Con el nombre completo diría "Daniel" con uno y "Daniel Acero" con dos.
 *
 * Es solo el valor inicial: el principal se puede renombrar como cualquier otro
 * (es indeleble, no inmutable).
 *
 * Si el Hub no tiene un nombre real cargado, `public.profiles.name` guarda el
 * prefijo del email (ver `handle_new_user` en schema.sql) — y como la Home ya
 * saluda con eso, el perfil toma lo mismo. Que el título cambiara de texto al
 * crear un segundo perfil sería peor que un nombre feo. `'Personal'` queda solo
 * para el caso de que no haya absolutamente nada.
 */
export function defaultProfileName(nombreUsuario?: string | null): string {
  return nombreUsuario?.trim().split(/\s+/)[0] || 'Personal'
}

/** Un nombre libre a partir de `base` — "Empresa", "Empresa 2", "Empresa 3"… */
export function freeName(base: string, tomados: string[]): string {
  const lower = tomados.map(n => n.toLowerCase())
  if (!lower.includes(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    if (!lower.includes(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
  }
}

export async function listProfiles(supabase: SupabaseClient, userId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('fin_profiles')
    .select(PROFILE_COLS)
    .eq('user_id', userId)
    .order('sort_order')
    .order('created_at')

  return (data ?? []) as Profile[]
}

/**
 * Siembra las 14 categorías iniciales en un perfil.
 *
 * Idempotente por la misma razón que `POST /seed`: lee lo que ya hay e inserta
 * solo lo que falta, así correrlo dos veces no duplica ni pisa un rename.
 */
export async function seedProfileCategories(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('fin_categories')
    .select('name, kind')
    .eq('profile_id', profileId)

  const taken = new Set((existing ?? []).map(c => `${c.kind}:${c.name}`))
  const missing = SEED_CATEGORIES
    .map((c, i) => ({ ...c, sort_order: i }))
    .filter(c => !taken.has(`${c.kind}:${c.name}`))

  if (missing.length === 0) return

  await supabase.from('fin_categories').insert(
    missing.map(c => ({
      user_id: userId,
      profile_id: profileId,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
      sort_order: c.sort_order,
    })),
  )
}

/**
 * Crea un perfil y lo deja usable: nace con las categorías semilla y **nada
 * más**. Sin cuentas, sin personas, sin fijos, sin ahorros.
 *
 * No se copia nada del perfil de origen: clonar cuentas obligaría a decidir qué
 * hacer con los saldos iniciales, y no se pidió.
 */
export async function createProfile(
  supabase: SupabaseClient,
  userId: string,
  input: { name: string; accent?: AccentKey; is_default?: boolean },
): Promise<{ profile: Profile | null; error: string | null }> {
  const existentes = await listProfiles(supabase, userId)

  const accent = input.accent ?? nextAccent(existentes.map(p => p.accent))
  const name = input.name.trim()
  if (!name) return { profile: null, error: 'El perfil necesita un nombre' }

  if (existentes.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    return { profile: null, error: 'Ya tienes un perfil con ese nombre' }
  }

  const { data, error } = await supabase
    .from('fin_profiles')
    .insert({
      user_id: userId,
      name,
      accent,
      is_default: input.is_default ?? existentes.length === 0,
      sort_order: existentes.length,
    })
    .select(PROFILE_COLS)
    .single()

  if (error || !data) return { profile: null, error: error?.message ?? 'No se pudo crear el perfil' }

  const profile = data as Profile
  await seedProfileCategories(supabase, userId, profile.id)
  return { profile, error: null }
}

/**
 * El perfil activo de este request.
 *
 * 1. `requested` si es del usuario y no está archivado.
 * 2. Si no, el default.
 * 3. Si el usuario no tiene ninguno, se le crea acá mismo.
 *
 * Un `requested` inválido —de otro usuario, archivado, o borrado desde otro
 * dispositivo— **no es un error**: cae al default en silencio. El cliente se
 * entera porque la respuesta trae el perfil activo y corrige su localStorage.
 * Devolver 403 rompería la app de alguien que solo tiene un localStorage viejo.
 */
export async function resolveProfile(
  supabase: SupabaseClient,
  userId: string,
  requested?: string | null,
  nombreUsuario?: string | null,
): Promise<{ profileId: string; profiles: Profile[] }> {
  let profiles = await listProfiles(supabase, userId)

  if (profiles.length === 0) {
    const { profile } = await createProfile(supabase, userId, {
      name: defaultProfileName(nombreUsuario),
      accent: 'verde',
      is_default: true,
    })
    if (profile) return { profileId: profile.id, profiles: [profile] }

    // Carrera con otro request del mismo usuario: la primera apertura de la app
    // dispara varias llamadas casi a la vez y todas encuentran cero perfiles.
    // El `unique (user_id, name)` deja pasar una sola, así que las demás llegan
    // acá. Se relee en vez de fallar: el índice decide quién creó, no quién
    // llegó primero. Sin esto, la segunda devolvía un perfil vacío y la ruta
    // respondía 401 — un "No autorizado" en la primera pantalla que ve alguien
    // que acaba de entrar. Mismo patrón que `resolvePeople` para las personas.
    profiles = await listProfiles(supabase, userId)
    if (profiles.length === 0) return { profileId: '', profiles: [] }
  }

  const pedido = requested && profiles.find(p => p.id === requested && !p.archived)
  if (pedido) return { profileId: pedido.id, profiles }

  const def = profiles.find(p => p.is_default) ?? profiles.find(p => !p.archived) ?? profiles[0]
  return { profileId: def.id, profiles }
}

/**
 * ¿Este perfil tiene algo cargado?
 *
 * Es lo que decide entre borrar y archivar (§4.4), y lo que la UI necesita
 * saber ANTES de ofrecer el botón: sin esto habría que intentar el borrado y
 * mostrar un 409 después del click.
 *
 * Mira las **16 tablas** del perfil, no solo cuentas y movimientos. Una versión
 * anterior miraba dos, y un perfil con una persona cargada se reportaba vacío:
 * la UI ofrecía "Borrar", el borrado fallaba a mitad de camino y se llevaba las
 * categorías puestas. Ver `20260827020000_finanzas_perfiles_borrado_atomico.sql`.
 *
 * Las categorías no cuentan: todo perfil nace con 14 y exigir borrarlas a mano
 * para poder borrar el perfil sería un trámite absurdo.
 *
 * El cálculo vive en una función de Postgres porque el listado lo necesita para
 * CADA perfil: 16 consultas por perfil serían 16×N viajes para pintar un menú.
 */
export async function profileHasData(supabase: SupabaseClient, profileId: string): Promise<boolean> {
  const { data } = await supabase.rpc('fin_profile_has_data', { p_profile: profileId })
  return data === true
}

/** Motivo por el que no se pudo borrar, o `null` si se borró. */
export type DeleteProfileResult = 'not_found' | 'is_default' | 'has_data' | null

/**
 * Borra un perfil vacío, en una sola transacción.
 *
 * Verifica y borra dentro de la misma función de Postgres — si el borrado del
 * perfil falla por un `on delete restrict` que el chequeo no previó, el de las
 * categorías se deshace con él. Antes eran dos operaciones sueltas desde el
 * server y un fallo a mitad dejaba el perfil vivo y sin categorías.
 */
export async function deleteProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<DeleteProfileResult | 'error'> {
  const { data, error } = await supabase.rpc('fin_delete_profile', { p_profile: profileId })
  if (error) return 'error'
  return (data ?? null) as DeleteProfileResult
}
