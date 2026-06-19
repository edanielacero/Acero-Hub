import { createAdminClient } from '@/lib/supabase-server'
import { getWorldCupMatches } from '@/lib/football-api'
import { NextResponse } from 'next/server'

async function runSync() {
  const matches = await getWorldCupMatches()
  const admin = createAdminClient()

  const rows = matches.map(m => ({
    id: m.id,
    home_team: m.homeTeam?.name ?? 'Por definir',
    home_tla: m.homeTeam?.tla ?? '???',
    home_crest: m.homeTeam?.crest ?? null,
    away_team: m.awayTeam?.name ?? 'Por definir',
    away_tla: m.awayTeam?.tla ?? '???',
    away_crest: m.awayTeam?.crest ?? null,
    match_date: m.utcDate,
    status: m.status,
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
    stage: m.stage,
    group_name: m.group,
    synced_at: new Date().toISOString(),
  }))

  const { error } = await admin.from('mundial_matches').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)

  return rows.length
}

// GET — called by Vercel Cron every hour
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const synced = await runSync()
    return NextResponse.json({ synced })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// POST — called manually from admin panel or auto-sync on page load
export async function POST() {
  try {
    const synced = await runSync()
    return NextResponse.json({ synced })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
