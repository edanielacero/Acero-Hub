import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from './splits'
import type { Person, DebtInput } from './types'

export const PERSON_COLS = 'id, name, emoji, archived'

/**
 * Busca una persona activa por nombre, comparando como el índice único de la
 * base (`lower(name)`). Es lo que hace que crear al vuelo desde el quick-add
 * nunca explote por tipear dos veces lo mismo.
 */
export async function findPersonByName(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<Person | null> {
  const { data } = await supabase
    .from('fin_people')
    .select(PERSON_COLS)
    .eq('user_id', userId)
    .eq('archived', false)

  const key = normalizeName(name)
  return (data ?? []).find(p => normalizeName(p.name) === key) ?? null
}

/**
 * Resuelve los `person_name` de un reparto a ids reales, creando las personas
 * que falten. Devuelve el reparto con `person_id` en todas las filas.
 *
 * Si dos filas traen el mismo nombre nuevo, la validación previa ya las rechazó
 * — acá se asume que los nombres son distintos entre sí.
 */
export async function resolvePeople(
  supabase: SupabaseClient,
  userId: string,
  splits: DebtInput[],
): Promise<{ resolved: { person_id: string; amount: number }[]; error?: string }> {
  const resolved: { person_id: string; amount: number }[] = []

  for (const s of splits) {
    if (s.person_id) {
      resolved.push({ person_id: s.person_id, amount: s.amount })
      continue
    }

    const name = (s.person_name ?? '').trim()
    if (!name) return { resolved: [], error: 'Cada parte necesita una persona' }

    const existing = await findPersonByName(supabase, userId, name)
    if (existing) {
      resolved.push({ person_id: existing.id, amount: s.amount })
      continue
    }

    const { data, error } = await supabase
      .from('fin_people')
      .insert({ user_id: userId, name })
      .select(PERSON_COLS)
      .single()

    // Carrera con otro request que creó la misma persona: se relee en vez de
    // fallar. El índice único es el que decide, no quién llegó primero.
    if (error) {
      const retry = await findPersonByName(supabase, userId, name)
      if (!retry) return { resolved: [], error: `No se pudo crear a "${name}"` }
      resolved.push({ person_id: retry.id, amount: s.amount })
      continue
    }
    resolved.push({ person_id: data.id, amount: s.amount })
  }

  return { resolved }
}

/** Verifica que todas las personas del reparto existan y sean del usuario. */
export async function assertOwnedPeople(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null
  const { data } = await supabase
    .from('fin_people')
    .select('id')
    .eq('user_id', userId)
    .in('id', ids)

  const found = new Set((data ?? []).map(p => p.id))
  const missing = ids.filter(id => !found.has(id))
  return missing.length > 0 ? 'Alguna de las personas del reparto no existe' : null
}
