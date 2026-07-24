import { createAdminClient } from '@/lib/supabase-server'
import { isRequirableVariableType, isVariableValueEmpty } from './required-fields'

type AdminClient = ReturnType<typeof createAdminClient>

// Devuelve el label de la primera variable obligatoria sin valor, o null si todas están completas.
export async function findMissingRequiredVariable(
  admin: AdminClient, sessionId: string, customFields: Record<string, unknown>,
): Promise<string | null> {
  const { data: required } = await admin
    .from('tj_variable_definitions')
    .select('key, label, type')
    .eq('session_id', sessionId)
    .eq('is_required', true)
    .eq('is_active', true)

  for (const v of required ?? []) {
    if (!isRequirableVariableType(v.type)) continue
    if (isVariableValueEmpty(v.type, customFields?.[v.key])) return v.label
  }
  return null
}
