import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { DEFAULT_PROFILE_NAME } from '@/lib/finanzas/profiles'

// Un solo chequeo de identidad + todas las lecturas de referencia en paralelo,
// para los consumidores que necesitan varias a la vez al montar (Inicio,
// QuickAddProvider, ProfileProvider) — en vez de que cada uno pague su propio
// round-trip de sesión por separado. transactions queda afuera a propósito:
// es contenido dinámico con filtros propios por página, no dato de referencia.
export async function GET() {
  const { supabase, userId, claims } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data: accounts, error: accountsError },
    { data: categories, error: categoriesError },
    { data: rates, error: ratesError },
    { data: rules, error: rulesError },
    { data: profiles, error: profilesError },
    { data: profile },
  ] = await Promise.all([
    supabase.from('fin_accounts').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('fin_categories').select('*').eq('user_id', userId).order('name'),
    supabase.from('fin_exchange_rates').select('*').eq('user_id', userId).order('fetched_at', { ascending: false }).limit(60),
    supabase.from('fin_category_rules').select('*').eq('user_id', userId).order('priority', { ascending: false }),
    supabase.from('fin_profiles').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('profiles').select('name, email').eq('id', userId).single(),
  ])

  const error = accountsError || categoriesError || ratesError || rulesError || profilesError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let finalProfiles = profiles ?? []
  if (finalProfiles.length === 0) {
    const { data: created, error: createError } = await supabase
      .from('fin_profiles')
      .insert({ user_id: userId, name: DEFAULT_PROFILE_NAME, is_default: true })
      .select()
      .single()
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
    finalProfiles = [created]
  }

  return NextResponse.json({
    accounts: accounts ?? [],
    categories: categories ?? [],
    rates: rates ?? [],
    rules: rules ?? [],
    profiles: finalProfiles,
    me: { name: profile?.name || profile?.email?.split('@')[0] || 'ahí', email: profile?.email ?? claims?.email },
  })
}
