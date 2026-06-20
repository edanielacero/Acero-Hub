'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { isClosed, isLive, stageLabel } from '@/lib/football-api'
import { teamSearchTokens, teamNameEs } from '@/lib/team-names-es'

const STORAGE_KEY = 'mundial_profile_token'

interface Match {
  id: number; home_team: string; home_tla: string; home_crest: string
  away_team: string; away_tla: string; away_crest: string
  match_date: string; status: string; home_score: number | null; away_score: number | null
  stage: string; group_name: string | null; bet_amount: number | null
  kickoff_at: string | null
}
interface Bet {
  id: string; profile_id: string; match_id: number
  home_score_bet: number; away_score_bet: number
  payment_confirmed: boolean; prize_paid: boolean
  mundial_profiles: { name: string; color: string }
}
interface Profile { id: string; name: string; color: string; token: string }
interface Settings { qr_image_url: string | null; bet_amount: number }
interface TeamStanding {
  team: string; tla: string; crest: string
  played: number; won: number; drawn: number; lost: number
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number
}
interface GroupStanding { group: string; table: TeamStanding[] }

// ─── Sub-components ────────────────────────────────────────────────────

function Countdown({ matchDate }: { matchDate: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const tick = () => {
      const diff = new Date(matchDate).getTime() - Date.now()
      if (diff <= 0) { setText('Cerrado'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setText(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [matchDate])
  return <span>{text}</span>
}

// Tracks actual kick-off times detected at runtime (scheduled time ≠ actual start).
// Keyed by match ID. Persisted to localStorage so it survives page refreshes.
const KICKOFF_KEY = (id: number) => `wc26_kickoff_${id}`

// Records the actual kick-off moment for a match.
// Called when a status transition to IN_PLAY is detected.
// Subtracts 60s to compensate for football-data.org free-tier live delay.
function recordKickoff(matchId: number) {
  const key = KICKOFF_KEY(matchId)
  if (typeof window === 'undefined' || localStorage.getItem(key)) return
  localStorage.setItem(key, new Date(Date.now() - 60_000).toISOString())
}

// Calculates display string from elapsed minutes since kick-off.
function elapsedToDisplay(elapsedMin: number): string {
  if (elapsedMin < 0) return "0'"
  if (elapsedMin <= 45) return `${Math.floor(elapsedMin)}'`
  if (elapsedMin <= 62) return `45+${Math.floor(elapsedMin - 45)}'`
  const matchMin = Math.floor(elapsedMin - 62) + 46
  if (matchMin <= 90) return `${matchMin}'`
  if (matchMin <= 107) return `90+${matchMin - 90}'`
  const etMin = Math.floor(elapsedMin - 107) + 91
  if (etMin <= 105) return `${etMin}'`
  return `105+${etMin - 105}'`
}

// Live match clock. Priority for reference time: DB kickoff_at → localStorage → scheduled match_date.
// DB value is set server-side when IN_PLAY is first detected (most accurate).
// localStorage is a client-side fallback captured at the same transition moment.
// match_date (scheduled) is the last resort and may be off if the match started late.
function LiveClock({ matchId, matchDate, status, kickoffAt }: { matchId: number; matchDate: string; status: string; kickoffAt?: string | null }) {
  const [display, setDisplay] = useState('·')

  useEffect(() => {
    const update = () => {
      if (status === 'PAUSED') { setDisplay('HT'); return }
      if (status === 'PENALTY_SHOOTOUT') { setDisplay('PSO'); return }
      const local = typeof window !== 'undefined' ? localStorage.getItem(KICKOFF_KEY(matchId)) : null
      const ref = new Date(kickoffAt ?? local ?? matchDate).getTime()
      setDisplay(elapsedToDisplay((Date.now() - ref) / 60000))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [matchId, matchDate, status, kickoffAt])

  return <>{display}</>
}

type BetStatus = 'winning' | 'possible' | 'eliminated'

function getBetStatus(bet: Bet, match: Match): BetStatus {
  if (match.status === 'FINISHED') {
    if (match.home_score === bet.home_score_bet && match.away_score === bet.away_score_bet) return 'winning'
    return 'eliminated'
  }
  if (!isLive(match.status)) return 'possible'
  if (match.home_score === bet.home_score_bet && match.away_score === bet.away_score_bet) return 'winning'
  if ((match.home_score ?? 0) > bet.home_score_bet || (match.away_score ?? 0) > bet.away_score_bet) return 'eliminated'
  return 'possible'
}

function computeStandings(allMatches: Match[]): GroupStanding[] {
  const groupMap = new Map<string, Map<string, TeamStanding>>()
  for (const m of allMatches) {
    if (!m.group_name) continue
    if (!groupMap.has(m.group_name)) groupMap.set(m.group_name, new Map())
    const group = groupMap.get(m.group_name)!
    if (!group.has(m.home_team)) group.set(m.home_team, { team: m.home_team, tla: m.home_tla, crest: m.home_crest, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 })
    if (!group.has(m.away_team)) group.set(m.away_team, { team: m.away_team, tla: m.away_tla, crest: m.away_crest, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 })
    if (m.status !== 'FINISHED' || m.home_score === null || m.away_score === null) continue
    const home = { ...group.get(m.home_team)! }
    const away = { ...group.get(m.away_team)! }
    home.played++; away.played++
    home.goalsFor += m.home_score; home.goalsAgainst += m.away_score
    away.goalsFor += m.away_score; away.goalsAgainst += m.home_score
    if (m.home_score > m.away_score) { home.won++; home.points += 3; away.lost++ }
    else if (m.home_score < m.away_score) { away.won++; away.points += 3; home.lost++ }
    else { home.drawn++; home.points++; away.drawn++; away.points++ }
    home.goalDiff = home.goalsFor - home.goalsAgainst
    away.goalDiff = away.goalsFor - away.goalsAgainst
    group.set(m.home_team, home); group.set(m.away_team, away)
  }
  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, teamsMap]) => ({
      group: name.replace(/^GROUP_/, ''),
      table: Array.from(teamsMap.values()).sort((a, b) =>
        b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)
      )
    }))
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })
}

const numInput = "w-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-center text-[#f5f5f5] outline-none focus:border-[#555] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

function MatchCard({ match, myBet, allBets, profiles, token, qrUrl, betAmount, pot, carryoverPart, isNext, onBetPlaced }: {
  match: Match; myBet?: Bet; allBets: Bet[]; profiles: Profile[]
  token: string; qrUrl: string | null; betAmount: number; pot: number; carryoverPart?: number; isNext?: boolean; onBetPlaced: () => void
}) {
  const [home, setHome] = useState<string | number>(myBet?.home_score_bet ?? '')
  const [away, setAway] = useState<string | number>(myBet?.away_score_bet ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentMode, setPaymentMode] = useState<null | 'qr' | 'cash'>(null)

  const closed = isClosed(match.match_date)
  const live = isLive(match.status)
  const finished = match.status === 'FINISHED'
  const betsForMatch = allBets.filter(b => b.match_id === match.id)
  const scoresReady = home !== '' && away !== ''

  const handleBet = async () => {
    if (home === '' || away === '') return
    setLoading(true); setError('')
    const res = await fetch('/api/mundial/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, matchId: match.id, homeScore: Number(home), awayScore: Number(away) }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error) }
    else { setPaymentMode(null); onBetPlaced() }
    setLoading(false)
  }

  return (
    <div className={`rounded-2xl overflow-hidden ${
      live
        ? 'border-2 border-green-500/40 bg-[#0b110a] shadow-[0_0_28px_rgba(34,197,94,0.08)]'
        : isNext
        ? 'border-2 border-blue-500/40 bg-[#090d14] shadow-[0_0_28px_rgba(59,130,246,0.08)]'
        : 'bg-[#111] border border-[#1e1e1e]'
    }`}>

      {/* ── Bote banner (upcoming/live only) ── */}
      {pot > 0 && !finished && (
        <div className={`px-5 py-3 flex items-center justify-between gap-3 ${
          live   ? 'bg-green-500/10' :
          isNext ? 'bg-blue-500/8' :
          'bg-amber-500/7'
        }`}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {isNext && !live && (
                <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full uppercase tracking-[0.15em] border border-blue-500/25">
                  Próximo
                </span>
              )}
              <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                live ? 'text-green-500' : isNext ? 'text-blue-500' : 'text-amber-600'
              }`}>
                Bote en juego
              </span>
            </div>
            {(carryoverPart ?? 0) > 0 && (
              <span className="text-[9px] text-amber-700 font-[family-name:var(--font-body)]">
                incl. Bs {carryoverPart} acumulado de anteriores
              </span>
            )}
          </div>
          <span className={`text-2xl font-black tabular-nums shrink-0 ${
            live ? 'text-green-400' : isNext ? 'text-blue-400' : 'text-amber-400'
          }`}>
            Bs {pot}
          </span>
        </div>
      )}

      <div className="px-5 pt-4 pb-4">

        {/* Stage + status */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-[#3a3a3a] uppercase tracking-[0.15em] font-[family-name:var(--font-body)]">
            {stageLabel(match.stage)}{match.group_name ? ` · ${match.group_name.replace('GROUP_', 'Grupo ')}` : ''}
          </span>
          {live ? (
            match.status === 'PAUSED' ? (
              <span className="flex items-center gap-1.5 bg-amber-500/12 border border-amber-500/25 text-amber-400 text-[10px] font-black px-2.5 py-1 rounded-full tracking-[0.1em]">
                DESCANSO · HT
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-red-500/12 border border-red-500/25 text-red-400 text-[10px] font-black px-2.5 py-1 rounded-full tracking-[0.1em]">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
                EN VIVO · <LiveClock matchId={match.id} matchDate={match.match_date} status={match.status} kickoffAt={match.kickoff_at} />
              </span>
            )
          ) : (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-[0.05em] border ${
              finished ? 'bg-[#1a1a1a] text-[#555] border-transparent' :
              closed   ? 'bg-amber-500/8 text-amber-600 border-amber-500/15' :
              isNext   ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
              'bg-[#1a1a1a] text-[#bbb] border-[#2a2a2a]'
            }`}>
              {finished ? 'FINALIZADO' : closed ? 'CERRADO' : formatDate(match.match_date)}
            </span>
          )}
        </div>

        {/* Teams + score */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            {match.home_crest
              ? <img src={match.home_crest} alt="" className="w-10 h-10 object-contain" />
              : <div className="w-10 h-10 rounded-full bg-[#1a1a1a]" />}
            <span className="text-[11px] font-bold text-[#bbb] text-center leading-tight">
              {match.home_tla || match.home_team}
            </span>
          </div>
          <div className="text-center shrink-0 px-2">
            {(live || finished) ? (
              <span className="text-4xl font-black text-[#f5f5f5] tabular-nums tracking-tighter">
                {match.home_score ?? 0}–{match.away_score ?? 0}
              </span>
            ) : (
              <span className="text-lg font-black text-[#2a2a2a] tracking-widest">VS</span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5 flex-1">
            {match.away_crest
              ? <img src={match.away_crest} alt="" className="w-10 h-10 object-contain" />
              : <div className="w-10 h-10 rounded-full bg-[#1a1a1a]" />}
            <span className="text-[11px] font-bold text-[#bbb] text-center leading-tight">
              {match.away_tla || match.away_team}
            </span>
          </div>
        </div>

        {/* Finished: winner or carryover */}
        {finished && pot > 0 && (() => {
          const winners = betsForMatch.filter(b =>
            b.home_score_bet === match.home_score && b.away_score_bet === match.away_score
          )
          if (winners.length > 0) {
            const prize = winners.length > 1 ? Math.floor(pot / winners.length) : pot
            return (
              <div className="mt-4 bg-green-500/8 border border-green-500/15 rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[11px] font-medium text-green-600">
                    {winners.length > 1 ? `${winners.length} ganadores · Bs ${prize} c/u` : 'Ganador'}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {winners.map(w => {
                      const prof = profiles.find(p => p.id === w.profile_id)
                      return prof ? (
                        <div key={w.id} className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: prof.color }}>
                            {prof.name.charAt(0)}
                          </div>
                          <span className="text-xs font-semibold text-green-400">{prof.name}</span>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-2xl font-bold tabular-nums text-green-400">Bs {prize}</span>
                  {winners.length > 1 && (
                    <span className="text-[10px] text-green-700 tabular-nums">Bs {pot} total</span>
                  )}
                </div>
              </div>
            )
          }
          return (
            <div className="mt-4 bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl px-5 py-3 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-[#555]">Sin ganador</span>
                <span className="text-[11px] text-[#3a3a3a]">Bote acumulado al siguiente</span>
              </div>
              <span className="text-2xl font-bold tabular-nums text-[#666]">Bs {pot}</span>
            </div>
          )
        })()}

        {/* ── Bet section: open match ── */}
        {!closed && !finished && (
          <>
            {myBet ? (
              /* Existing bet — simple update */
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-[#777] font-[family-name:var(--font-body)]">Tu apuesta:</span>
                <input type="number" min="0" max="20" value={home} onChange={e => setHome(e.target.value)} className={numInput} />
                <span className="text-[#555] font-bold text-sm">–</span>
                <input type="number" min="0" max="20" value={away} onChange={e => setAway(e.target.value)} className={numInput} />
                <button onClick={handleBet} disabled={loading || !scoresReady}
                  className="ml-auto text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-[#f5f5f5] hover:border-[#444] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                  {loading ? '...' : 'Actualizar'}
                </button>
              </div>
            ) : paymentMode === null ? (
              /* New bet — score entry + payment choice */
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#777] font-[family-name:var(--font-body)]">Tu predicción:</span>
                  <input type="number" min="0" max="20" value={home} onChange={e => setHome(e.target.value)} className={numInput} />
                  <span className="text-[#555] font-bold text-sm">–</span>
                  <input type="number" min="0" max="20" value={away} onChange={e => setAway(e.target.value)} className={numInput} />
                </div>
                {scoresReady && (
                  <div className="flex gap-2">
                    {qrUrl && (
                      <button onClick={() => setPaymentMode('qr')}
                        className="flex-1 text-xs font-semibold bg-[#f5f5f5] text-[#0a0a0a] px-3 py-2 rounded-xl hover:bg-white transition-colors cursor-pointer">
                        Pagar QR
                      </button>
                    )}
                    <button onClick={() => setPaymentMode('cash')}
                      className="flex-1 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-[#f5f5f5] hover:border-[#444] px-3 py-2 rounded-xl transition-colors cursor-pointer">
                      Pagar Efectivo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Payment confirmation step */
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#777] font-[family-name:var(--font-body)]">
                  <span>Predicción:</span>
                  <span className="font-bold text-[#f5f5f5] tabular-nums">{home} – {away}</span>
                  <span className="text-[#333] mx-0.5">·</span>
                  <span>{paymentMode === 'qr' ? 'Pago por QR' : 'Pago en efectivo'}</span>
                </div>

                {paymentMode === 'qr' && qrUrl && (
                  <div className="flex flex-col items-center gap-2 py-4 bg-[#0e0e0e] rounded-xl border border-[#1e1e1e]">
                    <img src={qrUrl} alt="QR de pago" className="w-40 h-40 object-contain rounded-lg" />
                    <p className="text-[11px] text-[#666] font-[family-name:var(--font-body)]">Escanea y paga Bs {betAmount}</p>
                  </div>
                )}
                {paymentMode === 'cash' && (
                  <div className="py-4 px-4 bg-[#0e0e0e] rounded-xl border border-[#1e1e1e] text-center">
                    <p className="text-sm font-bold text-[#f5f5f5]">Bs {betAmount}</p>
                    <p className="text-[11px] text-[#666] mt-1 font-[family-name:var(--font-body)]">Entrégalo en efectivo al admin</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button onClick={() => setPaymentMode(null)}
                    className="text-xs text-[#555] hover:text-[#888] cursor-pointer font-[family-name:var(--font-body)] px-3 py-2">
                    ← Volver
                  </button>
                  <button onClick={handleBet} disabled={loading}
                    className="flex-1 text-xs font-semibold bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-500 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                    {loading ? '...' : '✓ Ya Pagué · Registrar apuesta'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Closed/finished — show my result */}
        {(closed || finished) && myBet && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-[#666] font-[family-name:var(--font-body)]">Tu apuesta:</span>
            <span className={`text-xs font-bold tabular-nums ${
              finished
                ? getBetStatus(myBet, match) === 'winning' ? 'text-green-400' : 'text-red-400'
                : 'text-[#aaa]'
            }`}>
              {myBet.home_score_bet} – {myBet.away_score_bet}
            </span>
            {finished && getBetStatus(myBet, match) === 'winning' && (
              <span className="text-[10px] text-green-400 font-medium font-[family-name:var(--font-body)]">¡Acertaste!</span>
            )}
          </div>
        )}
        {!myBet && (closed || finished) && (
          <div className="mt-3">
            <span className="text-xs text-[#444] italic font-[family-name:var(--font-body)]">Sin apuesta</span>
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-1.5 font-[family-name:var(--font-body)]">{error}</p>}
      </div>

      {/* ── Predictions table (only users who bet) ── */}
      {betsForMatch.length > 0 && (
        <div className="border-t border-[#1a1a1a] px-4 py-3">
          <div className="grid grid-cols-2 gap-1">
            {betsForMatch.map(bet => {
              const prof = profiles.find(p => p.id === bet.profile_id)
              if (!prof) return null
              const status = getBetStatus(bet, match)
              return (
                <div key={bet.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                  status === 'winning'                      ? 'bg-green-500/8 border-green-500/15' :
                  status === 'eliminated'                   ? 'bg-red-500/6 border-red-500/10' :
                  (live && status === 'possible')           ? 'bg-amber-500/7 border-amber-500/12' :
                  'bg-[#0f0f0f] border-[#1a1a1a]'
                }`}>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: prof.color }}>
                    {prof.name.charAt(0)}
                  </div>
                  <span className="text-[11px] text-[#888] font-[family-name:var(--font-body)] truncate flex-1">{prof.name}</span>
                  <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                    status === 'winning'             ? 'text-green-400' :
                    status === 'eliminated'          ? 'text-red-400' :
                    (live && status === 'possible')  ? 'text-amber-400' :
                    'text-[#ccc]'
                  }`}>
                    {bet.home_score_bet}–{bet.away_score_bet}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payment/prize footer */}
      {finished && myBet && (
        <div className="border-t border-[#1a1a1a] px-5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-[#666] font-[family-name:var(--font-body)]">
            {myBet.prize_paid ? '✓ Premio entregado' : 'Premio pendiente'}
          </span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${myBet.payment_confirmed ? 'bg-green-500/12 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
            {myBet.payment_confirmed ? 'Pagado' : 'Pago pendiente'}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────

export default function MundialPage() {
  const [phase, setPhase] = useState<'loading' | 'selecting' | 'betting'>('loading')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [allBets, setAllBets] = useState<Bet[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'finished' | 'groups'>('upcoming')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const supabase = createClient()
    const { data: profs } = await supabase.from('mundial_profiles').select('*').order('created_at')
    setProfiles(profs ?? [])
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const found = (profs ?? []).find((p: Profile) => p.token === stored)
      if (found) { await loadBettingData(found); return }
    }
    setPhase('selecting')
  }

  async function loadBettingData(p: Profile) {
    const supabase = createClient()
    const [{ data: m }, { data: b }, { data: s }] = await Promise.all([
      supabase.from('mundial_matches').select('*').order('match_date'),
      supabase.from('mundial_bets').select('*, mundial_profiles(name, color)'),
      supabase.from('mundial_settings').select('*').eq('id', 1).single(),
    ])
    if (!m?.length) {
      fetch('/api/mundial/sync', { method: 'POST' }).then(async res => {
        if (res.ok) {
          const { data: fresh } = await supabase.from('mundial_matches').select('*').order('match_date')
          setMatches(fresh ?? [])
        }
      })
    }
    setProfile(p)
    setMatches(m ?? [])
    setAllBets(b ?? [])
    setSettings(s ?? null)
    setPhase('betting')
  }

  const refreshBets = useCallback(async () => {
    const supabase = createClient()
    const { data: b } = await supabase.from('mundial_bets').select('*, mundial_profiles(name, color)')
    setAllBets(b ?? [])
  }, [])

  async function selectProfile(p: Profile) {
    localStorage.setItem(STORAGE_KEY, p.token)
    await loadBettingData(p)
  }

  function switchProfile() {
    localStorage.removeItem(STORAGE_KEY)
    setProfile(null)
    setPhase('selecting')
  }

  // Realtime
  useEffect(() => {
    if (phase !== 'betting') return
    const supabase = createClient()
    const channel = supabase
      .channel('mundial-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mundial_matches' }, payload => {
        const updated = payload.new as Match
        setMatches(prev => prev.map(m => {
          if (m.id !== updated.id) return m
          if (!isLive(m.status) && isLive(updated.status)) recordKickoff(m.id)
          // Never decrease score — Realtime can deliver stale data from a brief API race
          return {
            ...updated,
            home_score: updated.home_score !== null && (m.home_score === null || updated.home_score >= m.home_score) ? updated.home_score : m.home_score,
            away_score: updated.away_score !== null && (m.away_score === null || updated.away_score >= m.away_score) ? updated.away_score : m.away_score,
          }
        }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mundial_bets' }, () => {
        refreshBets()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [phase, refreshBets])

  // Keep a stable ref to matches so polling intervals never go stale
  const matchesRef = useRef(matches)
  useEffect(() => { matchesRef.current = matches }, [matches])

  // Poll ALL live matches every 10s with a single API call.
  // One batch request regardless of how many matches are live simultaneously,
  // preventing rate limit issues (free tier: 10 req/min) during simultaneous group-stage matches.
  useEffect(() => {
    if (phase !== 'betting') return
    const pollLive = async () => {
      const hasLive = matchesRef.current.some(m => isLive(m.status))
      if (!hasLive) return
      const res = await fetch('/api/mundial/live-all').then(r => r.json()).catch(() => null)
      const updates: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null; kickoffAt: string | null }> = res?.matches ?? []
      if (updates.length > 0) {
        setMatches(prev => prev.map(m => {
          const u = updates.find(u => u.id === m.id)
          if (!u) return m
          if (!isLive(m.status) && isLive(u.status)) recordKickoff(m.id)
          return {
            ...m,
            status: u.status,
            home_score: u.homeScore !== null && (m.home_score === null || u.homeScore >= m.home_score) ? u.homeScore : m.home_score,
            away_score: u.awayScore !== null && (m.away_score === null || u.awayScore >= m.away_score) ? u.awayScore : m.away_score,
            kickoff_at: u.kickoffAt ?? m.kickoff_at,
          }
        }))
      }
    }
    pollLive()
    const id = setInterval(pollLive, 10_000)
    return () => clearInterval(id)
  }, [phase])

  // Poll upcoming-within-2h every 20s (to catch kick-off status changes quickly)
  useEffect(() => {
    if (phase !== 'betting') return
    const pollUpcoming = async () => {
      const now = Date.now()
      const soon = matchesRef.current.filter(m =>
        (m.status === 'SCHEDULED' || m.status === 'TIMED') &&
        new Date(m.match_date).getTime() - now < 2 * 60 * 60 * 1000
      )
      if (!soon.length) return
      const settled = await Promise.allSettled(
        soon.map(m => fetch(`/api/mundial/live?id=${m.id}`).then(r => r.json()))
      )
      const updates: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null; kickoffAt: string | null }> = []
      settled.forEach(r => { if (r.status === 'fulfilled' && r.value?.id) updates.push(r.value) })
      if (updates.length > 0) {
        setMatches(prev => prev.map(m => {
          const u = updates.find(u => u.id === m.id)
          if (!u) return m
          if (!isLive(m.status) && isLive(u.status)) recordKickoff(m.id)
          return { ...m, status: u.status, home_score: u.homeScore, away_score: u.awayScore, kickoff_at: u.kickoffAt ?? m.kickoff_at }
        }))
      }
    }
    pollUpcoming()
    const id = setInterval(pollUpcoming, 20_000)
    return () => clearInterval(id)
  }, [phase])

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <span className="text-[#444] text-sm">Cargando...</span>
      </div>
    )
  }

  // ── Profile selector ──
  if (phase === 'selecting') {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
        {/* Background rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[700, 520, 360, 220].map(s => (
            <div key={s} className="absolute rounded-full border border-white/[0.025]" style={{ width: s, height: s }} />
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#ffffff06_0%,_transparent_65%)] pointer-events-none" />

        <div className="w-full max-w-xl flex flex-col items-center gap-10 relative">

          {/* Hero */}
          <div className="text-center flex flex-col items-center gap-2">
            {/* Trophy SVG */}
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-amber-400 mb-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2h12v7a6 6 0 0 1-12 0V2z"/><path d="M6 7H3a2 2 0 0 0 0 4h3"/><path d="M18 7h3a2 2 0 0 1 0 4h-3"/>
              <path d="M12 15v4"/><path d="M8 19h8"/>
            </svg>
            <p className="text-[10px] font-bold tracking-[0.45em] uppercase text-[#444] font-[family-name:var(--font-body)]">FIFA · Copa del Mundo</p>
            <h1 className="text-[72px] font-black tracking-tighter text-[#f0f0f0] leading-none">MUNDIAL</h1>
            <h2 className="text-[52px] font-black tracking-tighter text-amber-400 leading-none -mt-2">2026</h2>
          </div>

          <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#3a3a3a] font-[family-name:var(--font-body)]">
            Elige tu perfil
          </p>

          {/* Profiles */}
          {!profiles.length ? (
            <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">El admin aún no ha creado perfiles.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full">
              {profiles.map(p => (
                <button key={p.id} onClick={() => selectProfile(p)} className="group cursor-pointer">
                  <div className="relative rounded-2xl overflow-hidden border border-white/5 group-hover:border-white/15 transition-all duration-300 group-hover:scale-[1.05] group-hover:shadow-xl"
                    style={{ background: `linear-gradient(150deg, ${p.color}cc 0%, ${p.color}66 100%)` }}>
                    <div className="pt-7 pb-9 flex items-center justify-center">
                      <span className="text-4xl font-black text-white/90 drop-shadow-lg leading-none">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-2 py-2">
                      <p className="text-[10px] font-bold text-white/90 text-center uppercase tracking-wider truncate">
                        {p.name}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Betting view ──
  const liveMatches = matches.filter(m => isLive(m.status))
  const upcomingAll = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
  const finishedAll = matches.filter(m => m.status === 'FINISHED').slice().reverse()

  const betAmount = settings?.bet_amount ?? 5
  const qrUrl = settings?.qr_image_url ?? null

  function effectiveAmount(match: Match) {
    return match.bet_amount ?? betAmount
  }

  // Pre-compute pots for every match.
  // Finished: count ALL bets (regardless of payment_confirmed) + accumulated carryover.
  // Upcoming/live: only payment_confirmed bets (money actually collected so far).
  const potMap: Record<number, number> = {}
  const carryover = (() => {
    const sorted = [...finishedAll].sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
    let acc = 0
    for (const m of sorted) {
      const matchBets = allBets.filter(b => b.match_id === m.id)
      const pot = matchBets.length * effectiveAmount(m) + acc
      potMap[m.id] = pot
      const hasWinner = matchBets.some(b => b.home_score_bet === m.home_score && b.away_score_bet === m.away_score)
      acc = hasWinner ? 0 : pot
    }
    return acc
  })()
  // The carryover goes to the very next match to be played (first live, otherwise first upcoming)
  const nextMatchId = (liveMatches[0] ?? upcomingAll[0])?.id ?? null
  for (const m of [...liveMatches, ...upcomingAll]) {
    const base = allBets.filter(b => b.match_id === m.id).length * effectiveAmount(m)
    potMap[m.id] = m.id === nextMatchId ? base + carryover : base
  }

  // Date grouping helpers (Bolivia timezone UTC-4)
  function toLocalDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
  }
  function dateLabel(dateStr: string) {
    const today    = toLocalDate(new Date().toISOString())
    const tomorrow = toLocalDate(new Date(Date.now() + 86_400_000).toISOString())
    if (dateStr === today)    return 'Hoy'
    if (dateStr === tomorrow) return 'Mañana'
    const [y, mo, d] = dateStr.split('-').map(Number)
    return new Date(y, mo - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const upcomingDates  = [...new Set(upcomingAll.map(m => toLocalDate(m.match_date)))].sort()
  const todayDate      = toLocalDate(new Date().toISOString())
  const defaultDate    = upcomingDates.includes(todayDate) ? todayDate : (upcomingDates[0] ?? todayDate)
  const currentDate    = selectedDate ?? defaultDate
  const matchesForDate = upcomingAll.filter(m => toLocalDate(m.match_date) === currentDate)

  // Shared props for every MatchCard (betAmount is overridden per-match at call site)
  const cardProps = { profiles, token: profile!.token, qrUrl, onBetPlaced: refreshBets }

  const groupStandings = computeStandings(matches)

  // WC 2026: best 8 third-place teams (of 12) also qualify to Round of 32.
  // Ranked by: points → goal diff → goals scored → team name (FIFA tiebreaker rules).
  const best8Thirds = new Set(
    groupStandings
      .filter(gs => gs.table.length >= 3)
      .map(gs => gs.table[2])
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.team.localeCompare(b.team)
      )
      .slice(0, 8)
      .map(t => t.team)
  )

  // Search filter (supports Spanish and English team names)
  const q = searchQuery.trim().toLowerCase()
  const searchActive = q.length > 0
  function matchesQuery(m: Match) {
    return (
      teamSearchTokens(m.home_team, m.home_tla).includes(q) ||
      teamSearchTokens(m.away_team, m.away_tla).includes(q)
    )
  }
  const searchLive     = searchActive ? liveMatches.filter(matchesQuery)  : []
  const searchUpcoming = searchActive ? upcomingAll.filter(matchesQuery)  : []
  const searchFinished = searchActive ? finishedAll.filter(matchesQuery)  : []
  const searchAny      = searchLive.length + searchUpcoming.length + searchFinished.length > 0

  return (
    <div className="min-h-screen bg-[#080808] px-4 py-10">
      <div className="max-w-lg mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col leading-none gap-0.5">
            <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-[#3a3a3a] font-[family-name:var(--font-body)]">FIFA</span>
            <span className="text-xl font-black tracking-tight text-[#f0f0f0]">
              MUNDIAL <span className="text-amber-400">26</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ backgroundColor: profile!.color }}>
                {profile!.name.charAt(0)}
              </div>
              <span className="text-sm font-semibold text-[#ccc]">{profile!.name}</span>
            </div>
            <button onClick={switchProfile}
              className="text-[11px] text-[#444] hover:text-[#888] transition-colors font-[family-name:var(--font-body)] cursor-pointer border border-[#222] hover:border-[#333] px-2.5 py-1 rounded-lg">
              Salir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#444] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar equipo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl pl-9 pr-9 py-2.5 text-sm text-[#f5f5f5] placeholder-[#3a3a3a] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
          />
          {searchActive && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888] cursor-pointer transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Search results */}
        {searchActive && (
          <div className="flex flex-col gap-4">
            {!searchAny && (
              <p className="text-center py-10 text-sm text-[#555] font-[family-name:var(--font-body)]">
                Sin resultados para &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            )}
            {searchLive.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>
                  <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.15em] font-[family-name:var(--font-body)]">En vivo</span>
                </div>
                {searchLive.map(m => (
                  <MatchCard key={m.id} match={m}
                    myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                    allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                    carryoverPart={m.id === nextMatchId ? carryover : 0} isNext={m.id === nextMatchId} {...cardProps} />
                ))}
              </div>
            )}
            {searchUpcoming.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] font-[family-name:var(--font-body)]">Próximos</p>
                {searchUpcoming.map(m => (
                  <MatchCard key={m.id} match={m}
                    myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                    allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                    carryoverPart={m.id === nextMatchId ? carryover : 0} isNext={m.id === nextMatchId} {...cardProps} />
                ))}
              </div>
            )}
            {searchFinished.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] font-[family-name:var(--font-body)]">Finalizados</p>
                {searchFinished.map(m => (
                  <MatchCard key={m.id} match={m}
                    myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                    allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0} {...cardProps} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live — always above tabs */}
        {!searchActive && liveMatches.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.15em] font-[family-name:var(--font-body)]">En vivo</span>
            </div>
            {liveMatches.map(m => (
              <MatchCard key={m.id} match={m}
                myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                carryoverPart={m.id === nextMatchId ? carryover : 0}
                isNext={m.id === nextMatchId} {...cardProps} />
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        {!searchActive && <div className="flex gap-1 bg-[#111] border border-[#1e1e1e] rounded-xl p-1">
          {(['upcoming', 'finished', 'groups'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-[0.1em] rounded-lg transition-all duration-200 cursor-pointer ${
                activeTab === tab
                  ? 'bg-[#f5f5f5] text-[#0a0a0a] shadow-sm'
                  : 'text-[#555] hover:text-[#888]'
              }`}>
              {tab === 'upcoming' ? 'Próximos'
                : tab === 'finished' ? 'Anteriores'
                : 'Grupos'}
            </button>
          ))}
        </div>}

        {/* ── Upcoming tab ── */}
        {!searchActive && activeTab === 'upcoming' && (
          <div className="flex flex-col gap-5">

            {/* Date pills */}
            {upcomingDates.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
                {upcomingDates.map(date => (
                  <button key={date} onClick={() => setSelectedDate(date)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      currentDate === date
                        ? 'bg-[#f5f5f5] text-[#0a0a0a]'
                        : 'bg-[#111] border border-[#1e1e1e] text-[#777] hover:text-[#bbb] hover:border-[#333]'
                    }`}>
                    {dateLabel(date)}
                  </button>
                ))}
              </div>
            )}

            {/* Matches for selected date */}
            {matchesForDate.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">No hay partidos este día</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {matchesForDate.map((m, i) => (
                  <div key={m.id}>
                    {i === 0 && !isClosed(m.match_date) && (
                      <div className="px-1 mb-2 flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span className="text-[11px] text-blue-500 font-semibold font-[family-name:var(--font-body)]">
                          Las apuestas se cierran en <span className="text-blue-400 font-black"><Countdown matchDate={m.match_date} /></span>
                        </span>
                      </div>
                    )}
                    <MatchCard match={m}
                      myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                      allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                      carryoverPart={m.id === nextMatchId ? carryover : 0}
                      isNext={m.id === nextMatchId} {...cardProps} />
                  </div>
                ))}
              </div>
            )}

            {upcomingAll.length === 0 && liveMatches.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">No hay más partidos programados</p>
              </div>
            )}
          </div>
        )}

        {/* ── Finished tab ── */}
        {!searchActive && activeTab === 'finished' && (() => {
          const finishedByDate = finishedAll.reduce<{ date: string; matches: Match[] }[]>((acc, m) => {
            const d = toLocalDate(m.match_date)
            const group = acc.find(g => g.date === d)
            if (group) group.matches.push(m)
            else acc.push({ date: d, matches: [m] })
            return acc
          }, [])
          return (
            <div className="flex flex-col gap-6">
              {finishedAll.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">Aún no se han jugado partidos</p>
                </div>
              ) : finishedByDate.map(({ date, matches: dayMatches }) => (
                <div key={date} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#555]">
                      {dateLabel(date)}
                    </span>
                    <div className="flex-1 h-px bg-[#1e1e1e]" />
                  </div>
                  {dayMatches.map(m => (
                    <MatchCard key={m.id} match={m}
                      myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                      allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0} {...cardProps} />
                  ))}
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── Groups / Standings tab ── */}
        {!searchActive && activeTab === 'groups' && (
          <div className="flex flex-col gap-3">
            {groupStandings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">No hay datos de grupos disponibles</p>
              </div>
            ) : (
              <>
                {groupStandings.map(gs => (
                  <div key={gs.group} className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
                    {/* Group header */}
                    <div className="px-4 py-2.5 border-b border-[#181818]">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] font-[family-name:var(--font-body)]">Grupo {gs.group}</span>
                    </div>
                    {/* Column headers */}
                    <div className="grid grid-cols-[18px_1fr_18px_18px_18px_18px_26px_26px] items-center gap-x-1 px-3 py-1.5 border-b border-[#161616]">
                      <span />
                      <span className="text-[9px] font-bold text-[#2a2a2a] uppercase tracking-[0.1em]">Equipo</span>
                      {['J', 'G', 'E', 'P', 'DG', 'Pts'].map(h => (
                        <span key={h} className={`text-[9px] font-bold text-center uppercase tracking-[0.1em] ${h === 'Pts' ? 'text-[#3a3a3a]' : 'text-[#2a2a2a]'}`}>{h}</span>
                      ))}
                    </div>
                    {/* Team rows */}
                    {gs.table.map((row, i) => {
                      // WC 2026: top 2 always qualify; best 8 of 12 third-place teams also qualify
                      const qualified = i < 2 || (i === 2 && best8Thirds.has(row.team))
                      const outsideThird = i === 2 && !best8Thirds.has(row.team)
                      return (
                        <div key={row.team} className={`grid grid-cols-[18px_1fr_18px_18px_18px_18px_26px_26px] items-center gap-x-1 px-3 py-2 ${
                          i < gs.table.length - 1 ? 'border-b border-[#141414]' : ''
                        } ${qualified ? 'bg-green-500/4' : outsideThird ? 'bg-amber-500/4' : ''}`}>
                          <span className={`text-[10px] font-bold text-center tabular-nums leading-none ${
                            qualified ? 'text-green-600' : outsideThird ? 'text-amber-600' : 'text-[#333]'
                          }`}>{i + 1}</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            {row.crest
                              ? <img src={row.crest} alt={row.tla} className="h-3.5 w-3.5 object-contain shrink-0" />
                              : <div className="h-3.5 w-3.5 shrink-0 rounded-sm bg-[#1a1a1a]" />
                            }
                            <span className="text-[11px] font-medium text-[#ccc] truncate leading-none">{teamNameEs(row.team)}</span>
                          </div>
                          <span className="text-[10px] text-[#444] text-center tabular-nums">{row.played}</span>
                          <span className="text-[10px] text-[#444] text-center tabular-nums">{row.won}</span>
                          <span className="text-[10px] text-[#444] text-center tabular-nums">{row.drawn}</span>
                          <span className="text-[10px] text-[#444] text-center tabular-nums">{row.lost}</span>
                          <span className={`text-[10px] text-center tabular-nums font-medium ${
                            row.goalDiff > 0 ? 'text-[#666]' : row.goalDiff < 0 ? 'text-[#3a3a3a]' : 'text-[#444]'
                          }`}>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</span>
                          <span className={`text-[11px] font-black text-center tabular-nums ${
                            qualified ? 'text-green-400' : outsideThird ? 'text-amber-400' : 'text-[#bbb]'
                          }`}>{row.points}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className="flex flex-col gap-1.5 px-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm bg-green-500/15 border border-green-500/25" />
                    <span className="text-[9px] text-[#333] uppercase tracking-[0.1em] font-[family-name:var(--font-body)]">Clasificados a Dieciseisavos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm bg-amber-500/15 border border-amber-500/25" />
                    <span className="text-[9px] text-[#333] uppercase tracking-[0.1em] font-[family-name:var(--font-body)]">Tercer lugar fuera del top 8</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!matches.length && (
          <div className="text-center py-12">
            <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">Sincronizando partidos...</p>
          </div>
        )}

      </div>
    </div>
  )
}
