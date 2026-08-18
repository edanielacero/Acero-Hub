import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_USD_BOB_RATE, type Settings } from './types'
import { num } from './money'

/**
 * Devuelve los ajustes del usuario, creando la fila con la tasa por defecto la
 * primera vez. Todas las rutas que escriben transacciones dependen de esto: sin
 * tasa no se puede congelar la conversión a USD.
 */
export async function ensureSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<Settings> {
  const { data } = await supabase
    .from('fin_settings')
    .select('usd_bob_rate, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (data) {
    return { usd_bob_rate: num(data.usd_bob_rate, DEFAULT_USD_BOB_RATE), updated_at: data.updated_at }
  }

  const { data: created } = await supabase
    .from('fin_settings')
    .insert({ user_id: userId, usd_bob_rate: DEFAULT_USD_BOB_RATE })
    .select('usd_bob_rate, updated_at')
    .single()

  return {
    usd_bob_rate: num(created?.usd_bob_rate, DEFAULT_USD_BOB_RATE),
    updated_at: created?.updated_at ?? new Date().toISOString(),
  }
}
