import { createAdminClient } from '@/lib/supabase-server'
import { predictScore } from './predict'

const AUTO_BET_PROFILE_NAME = 'Dani'
const WINDOW_MS = 30 * 60 * 1000
// 2026-06-30 matches were already hand-set to the prediction ahead of time —
// skip them here so the 30-min-before mechanism doesn't recompute/overwrite them.
const EXCLUDED_DATE = '2026-06-30'
const toLocalDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })

/**
 * Auto-places (or overwrites) Dani's bet with the AI score prediction once a match
 * is within 30 minutes of kickoff. Registered as already paid (payment_confirmed
 * = true) — it's not real money owed, just an automated prediction entry.
 * Meant to be called from routes that already poll periodically (sync-today),
 * so it runs naturally whenever the app is in active use near kickoff time.
 */
export async function autoBetDani(): Promise<number> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles')
    .select('id')
    .eq('name', AUTO_BET_PROFILE_NAME)
    .single()
  if (!profile) return 0

  const { data: matches } = await admin
    .from('mundial_matches')
    .select('id, home_team, away_team, status, home_score, away_score, match_date')
  if (!matches) return 0

  const now = Date.now()
  const due = matches.filter(m => {
    if (m.status !== 'SCHEDULED' && m.status !== 'TIMED') return false
    if (m.home_team === 'Por definir' || m.away_team === 'Por definir') return false
    if (toLocalDate(m.match_date) === EXCLUDED_DATE) return false
    const diff = new Date(m.match_date).getTime() - now
    return diff >= 0 && diff <= WINDOW_MS
  })
  if (due.length === 0) return 0

  let count = 0
  for (const m of due) {
    const { home, away } = predictScore(m.home_team, m.away_team)
    const { error } = await admin.from('mundial_bets').upsert({
      profile_id: profile.id,
      match_id: m.id,
      home_score_bet: home,
      away_score_bet: away,
      payment_confirmed: true,
    }, { onConflict: 'profile_id,match_id' })
    if (!error) count++
  }
  return count
}
