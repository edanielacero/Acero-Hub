'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { isClosed, isLive, stageLabel } from '@/lib/mundial/football-api'
import { teamSearchTokens, teamNameEs, tlaEs } from '@/lib/mundial/team-names-es'

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
  debt_offset: number; paid_note: string | null
  mundial_profiles: { name: string; color: string }
}
interface Profile { id: string; name: string; color: string; token: string; saldo_adjustment: number }
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

function MatchCard({ match, myBet, allBets, profiles, token, qrUrl, betAmount, pot, carryoverPart, isNext, prizeCarryoverPerWinner, saldo, onBetPlaced, debtMap }: {
  match: Match; myBet?: Bet; allBets: Bet[]; profiles: Profile[]
  token: string; qrUrl: string | null; betAmount: number; pot: number; carryoverPart?: number; isNext?: boolean
  prizeCarryoverPerWinner?: number; saldo?: number
  onBetPlaced: () => void
  debtMap: Record<string, number>
}) {
  const [home, setHome] = useState<string | number>(myBet?.home_score_bet ?? '')
  const [away, setAway] = useState<string | number>(myBet?.away_score_bet ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentMode, setPaymentMode] = useState<null | 'choosing' | 'qr' | 'cash'>(null)

  const closed = isClosed(match.match_date)
  const finished = match.status === 'FINISHED'
  const live = !finished && isLive(match.status)
  const betsForMatch = allBets.filter(b => b.match_id === match.id)
  const scoresReady = home !== '' && away !== ''

  const handleBet = async (paymentConfirmed?: boolean, payWithSaldo?: boolean) => {
    if (home === '' || away === '') return
    setLoading(true); setError('')
    const body: Record<string, unknown> = { token, matchId: match.id, homeScore: Number(home), awayScore: Number(away) }
    if (payWithSaldo) { body.paymentConfirmed = true; body.payWithSaldo = true }
    else if (paymentConfirmed !== undefined) body.paymentConfirmed = paymentConfirmed
    const res = await fetch('/api/mundial/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
              <span className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 bg-red-500/12 border border-red-500/25 text-red-400 text-[10px] font-black px-2.5 py-1 rounded-full tracking-[0.1em]">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                  </span>
                  EN VIVO
                </span>
                <span className="text-[9px] font-medium text-[#444] tracking-wide">con delay</span>
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
              {tlaEs(match.home_tla) || match.home_team}
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
              {tlaEs(match.away_tla) || match.away_team}
            </span>
          </div>
        </div>

        {/* Finished: winner or carryover */}
        {finished && pot > 0 && (() => {
          const winners = betsForMatch.filter(b =>
            b.home_score_bet === match.home_score && b.away_score_bet === match.away_score
          )
          const carryoverPW = prizeCarryoverPerWinner ?? 0
          if (winners.length > 0) {
            const prize = Math.floor(pot / winners.length) + carryoverPW
            const allPrizePaid = winners.every(w => w.prize_paid)
            const hasDeductions = winners.some(w =>
              (w.debt_offset ?? 0) > 0 || w.paid_note || (!w.prize_paid && (debtMap[w.profile_id] ?? 0) > 0)
            )

            if (!hasDeductions) {
              return (
                <div className="mt-4 bg-green-500/8 border border-green-500/15 rounded-2xl px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-green-600">
                        {winners.length > 1 ? `${winners.length} ganadores · Bs ${prize} c/u` : 'Ganador'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {winners.map(w => {
                        const prof = profiles.find(p => p.id === w.profile_id)
                        return prof ? (
                          <div key={w.id} className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                              style={{ backgroundColor: prof.color }}>
                              {prof.name.charAt(0)}
                            </div>
                            <span className="text-xs font-semibold text-green-400">{prof.name}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-[0.08em] ${
                              w.prize_paid
                                ? 'bg-green-500/15 text-green-500 border-green-500/20'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                            }`}>
                              {w.prize_paid ? 'Cobrado' : 'Saldo'}
                            </span>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-2xl font-bold tabular-nums text-green-400">Bs {prize}</span>
                    {winners.length > 1 && (
                      <span className="text-[10px] text-green-700 tabular-nums">Bs {pot + carryoverPW} total</span>
                    )}
                  </div>
                </div>
              )
            }
            return (
              <div className="mt-4 bg-green-500/8 border border-green-500/15 rounded-2xl overflow-hidden">
                {winners.length > 1 && (
                  <div className="px-5 pt-3 pb-2 border-b border-green-500/10">
                    <span className="text-[11px] font-medium text-green-600">
                      {winners.length} ganadores · Bs {prize} c/u
                    </span>
                  </div>
                )}
                <div className="divide-y divide-green-500/10">
                  {winners.map(w => {
                    const prof = profiles.find(p => p.id === w.profile_id)
                    if (!prof) return null
                    const offset = w.debt_offset ?? 0
                    const debt = w.prize_paid ? 0 : (debtMap[w.profile_id] ?? 0)
                    const totalDeduction = offset + debt
                    const saldo = Math.max(0, prize - totalDeduction)
                    return (
                      <div key={w.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 flex-wrap gap-y-1">
                          <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: prof.color }}>
                            {prof.name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold text-green-400">{prof.name}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-[0.08em] ${
                            w.prize_paid
                              ? 'bg-green-500/15 text-green-500 border-green-500/20'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                          }`}>
                            {w.prize_paid ? 'Cobrado' : 'Saldo'}
                          </span>
                        </div>
                        {(totalDeduction > 0 || w.paid_note) ? (() => {
                          const transferAmt = w.paid_note && w.prize_paid ? Math.max(0, prize - offset) : 0
                          const finalSaldo = Math.max(0, saldo - transferAmt)
                          return (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] tabular-nums font-[family-name:var(--font-body)]">
                                <span className="text-[#888]">Bs {prize}</span>
                                {offset > 0 && <span className={w.paid_note && !w.prize_paid ? 'text-blue-500' : 'text-amber-600'}>
                                  {` − Bs ${offset} ${w.paid_note && !w.prize_paid ? 'traspaso' : 'cuotas'}`}
                                </span>}
                                {debt > 0 && <span className="text-amber-600"> − Bs {debt} deuda</span>}
                                {transferAmt > 0 && <span className="text-blue-500"> − Bs {transferAmt} traspaso</span>}
                              </span>
                              <span className={`text-xl font-black tabular-nums ${finalSaldo > 0 ? 'text-green-400' : 'text-[#555]'}`}>
                                Bs {finalSaldo}
                              </span>
                              {w.paid_note && (
                                <span className="text-[9px] text-blue-600 font-[family-name:var(--font-body)]">{w.paid_note}</span>
                              )}
                            </div>
                          )
                        })() : (
                          <span className="text-xl font-black tabular-nums text-green-400">Bs {prize}</span>
                        )}
                      </div>
                    )
                  })}
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
              /* Existing bet — update or remove */
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#777] font-[family-name:var(--font-body)]">Tu apuesta:</span>
                  <input type="number" min="0" max="20" value={home} onChange={e => setHome(e.target.value)} className={numInput} />
                  <span className="text-[#555] font-bold text-sm">–</span>
                  <input type="number" min="0" max="20" value={away} onChange={e => setAway(e.target.value)} className={numInput} />
                  <button onClick={() => handleBet()} disabled={loading || !scoresReady}
                    className="ml-auto text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-[#f5f5f5] hover:border-[#444] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                    {loading ? '...' : 'Actualizar'}
                  </button>
                </div>
                {!myBet.payment_confirmed && (
                  <button onClick={async () => {
                    setLoading(true)
                    await fetch('/api/mundial/bets', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ token, matchId: match.id }),
                    })
                    setLoading(false)
                    onBetPlaced()
                  }} disabled={loading}
                    className="self-start text-[11px] text-red-500/60 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 font-[family-name:var(--font-body)]">
                    Quitar apuesta
                  </button>
                )}
              </div>
            ) : paymentMode === null ? (
              /* New bet — score entry + payment timing choice */
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#777] font-[family-name:var(--font-body)]">Tu predicción:</span>
                  <input type="number" min="0" max="20" value={home} onChange={e => setHome(e.target.value)} className={numInput} />
                  <span className="text-[#555] font-bold text-sm">–</span>
                  <input type="number" min="0" max="20" value={away} onChange={e => setAway(e.target.value)} className={numInput} />
                </div>
                {scoresReady && (
                  <div className="flex gap-2">
                    <button onClick={() => setPaymentMode('choosing')}
                      className="flex-1 text-xs font-semibold bg-[#f5f5f5] text-[#0a0a0a] px-3 py-2 rounded-xl hover:bg-white transition-colors cursor-pointer">
                      Pagar Ahora
                    </button>
                    {(saldo ?? 0) >= betAmount ? (
                      <button onClick={() => handleBet(undefined, true)} disabled={loading}
                        className="flex-1 text-xs font-bold bg-amber-400 text-[#0a0a0a] px-3 py-2 rounded-xl hover:bg-amber-300 transition-colors cursor-pointer disabled:opacity-40">
                        {loading ? '...' : 'Pagar con Saldo'}
                      </button>
                    ) : (
                      <button onClick={() => handleBet(false)} disabled={loading}
                        className="flex-1 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-[#f5f5f5] hover:border-[#444] px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40">
                        {loading ? '...' : 'Pagar Después'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : paymentMode === 'choosing' ? (
              /* Payment method choice */
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs text-[#777] font-[family-name:var(--font-body)]">
                  <span>Predicción:</span>
                  <span className="font-bold text-[#f5f5f5] tabular-nums">{home} – {away}</span>
                </div>
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
                <button onClick={() => setPaymentMode(null)}
                  className="text-xs text-[#555] hover:text-[#888] cursor-pointer font-[family-name:var(--font-body)] self-start px-1 py-1">
                  ← Volver
                </button>
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
                  <button onClick={() => setPaymentMode('choosing')}
                    className="text-xs text-[#555] hover:text-[#888] cursor-pointer font-[family-name:var(--font-body)] px-3 py-2">
                    ← Volver
                  </button>
                  <button onClick={() => handleBet(true)} disabled={loading}
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

      {/* Prize footer — only for winning bets */}
      {finished && myBet && match.home_score === myBet.home_score_bet && match.away_score === myBet.away_score_bet && (
        <div className="border-t border-[#1a1a1a] px-5 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-[#666] font-[family-name:var(--font-body)]">Premio</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${myBet.prize_paid ? 'bg-green-500/12 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
            {myBet.prize_paid ? '✓ Pagado' : 'Pendiente de pago'}
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
  const [activeTab, setActiveTab] = useState<'upcoming' | 'finished' | 'groups' | 'winners'>('upcoming')
  const [groupsSubTab, setGroupsSubTab] = useState<'tables' | 'bracket'>('tables')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [winnerFilter, setWinnerFilter] = useState<'all' | 'groups' | 'knockout'>('all')

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
          return { ...updated }
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
            home_score: u.homeScore,
            away_score: u.awayScore,
            kickoff_at: u.kickoffAt ?? m.kickoff_at,
          }
        }))
      }
    }
    pollLive()
    const id = setInterval(pollLive, 10_000)
    return () => clearInterval(id)
  }, [phase])

  // Poll today's matches every 60s via a single date-range API call.
  // Catches: VAR score corrections on finished matches, upcoming → IN_PLAY transitions.
  // Complements pollLive (which handles real-time scores during the match).
  useEffect(() => {
    if (phase !== 'betting') return
    const pollToday = async () => {
      const res = await fetch('/api/mundial/sync-today').then(r => r.json()).catch(() => null)
      const updates: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null }> = res?.matches ?? []
      if (updates.length > 0) {
        setMatches(prev => prev.map(m => {
          const u = updates.find(u => u.id === m.id)
          if (!u) return m
          if (!isLive(m.status) && isLive(u.status)) recordKickoff(m.id)
          return { ...m, status: u.status, home_score: u.homeScore, away_score: u.awayScore }
        }))
      }
    }
    pollToday()
    const id = setInterval(pollToday, 60_000)
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
  // Groups are built from ALL matches (by exact kickoff time) so simultaneous pairs
  // are always detected regardless of status. A group is only "resolved" (carryover
  // distributed / accumulated) once EVERY match in that kickoff group is FINISHED.
  // While any match in the group is still live, the carryover stays held.
  const potMap: Record<number, number> = {}
  // Per-winner carryover share for resolved simultaneous groups that had any winners.
  const prizeCarryoverPerWinnerMap: Record<number, number> = {}

  // Build kickoff groups from ALL matches
  const allSortedByKickoff = [...matches].sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
  const allKickoffGroups: Match[][] = []
  for (const m of allSortedByKickoff) {
    const last = allKickoffGroups[allKickoffGroups.length - 1]
    if (last && last[0].match_date === m.match_date) last.push(m)
    else allKickoffGroups.push([m])
  }

  const carryover = (() => {
    let acc = 0
    for (const group of allKickoffGroups) {
      // Only resolve this group once every match in it has finished
      if (!group.every(m => m.status === 'FINISHED')) break

      const carryoverIn = acc
      const isSimultaneous = group.length > 1
      let groupHasWinner = false
      let groupOwnPot = 0
      let unwonPot = 0
      let totalGroupWinners = 0

      for (const m of group) {
        const mBets = allBets.filter(b => b.match_id === m.id)
        const ownPot = mBets.length * effectiveAmount(m)
        groupOwnPot += ownPot
        // Single match: include carryover in displayed pot (unchanged behavior).
        // Simultaneous: own pot only — carryover shown separately via banner.
        potMap[m.id] = isSimultaneous ? ownPot : ownPot + carryoverIn
        const mWinners = mBets.filter(b => b.home_score_bet === m.home_score && b.away_score_bet === m.away_score).length
        totalGroupWinners += mWinners
        if (mWinners > 0) groupHasWinner = true
        else unwonPot += ownPot
      }

      // For simultaneous resolved groups with winners: compute per-winner carryover share
      if (isSimultaneous && carryoverIn > 0 && totalGroupWinners > 0) {
        const perWinner = Math.floor(carryoverIn / totalGroupWinners)
        for (const m of group) prizeCarryoverPerWinnerMap[m.id] = perWinner
      }

      // Winners claim the carryover; un-won match pots carry forward.
      // No winners at all: everything (own pots + incoming carryover) carries.
      acc = groupHasWinner ? unwonPot : groupOwnPot + carryoverIn
    }
    return acc
  })()

  // Detect the next simultaneous group: the earliest kickoff group that is not fully finished
  const nextKickoffGroup = allKickoffGroups.find(g => !g.every(m => m.status === 'FINISHED')) ?? []
  const nextGroupIds = new Set(nextKickoffGroup.map(m => m.id))
  const isSimultaneousNextGroup = nextKickoffGroup.length > 1

  // Upcoming/live pot: for single-match next group, include carryover in the displayed pot.
  // For simultaneous groups, each match shows only its own pot — carryover is shown via banner.
  for (const m of [...liveMatches, ...upcomingAll]) {
    const base = allBets.filter(b => b.match_id === m.id).length * effectiveAmount(m)
    potMap[m.id] = nextGroupIds.has(m.id) && !isSimultaneousNextGroup ? base + carryover : base
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

  // Pre-compute total pending debt per profile across all matches
  const debtMap = profiles.reduce<Record<string, number>>((acc, prof) => {
    const unpaidBets = allBets.filter(b => b.profile_id === prof.id && !b.payment_confirmed)
    acc[prof.id] = unpaidBets.reduce((sum, ub) => {
      const found = matches.find(mx => mx.id === ub.match_id)
      return sum + (found?.bet_amount ?? betAmount)
    }, 0)
    return acc
  }, {})

  // Debt consumed sequentially: first won match absorbs debt, remaining passes to next
  const effectiveMatchDebt: Record<number, Record<string, number>> = {}
  {
    const sortedFinished = [...finishedAll].sort((a, b) =>
      new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
    )
    for (const prof of profiles) {
      let remaining = debtMap[prof.id] ?? 0
      if (remaining <= 0) continue
      for (const m of sortedFinished) {
        if (remaining <= 0) break
        const bet = allBets.find(b => b.match_id === m.id && b.profile_id === prof.id)
        if (!bet || bet.prize_paid) continue
        if (bet.home_score_bet !== m.home_score || bet.away_score_bet !== m.away_score) continue
        const winningBets = allBets.filter(b =>
          b.match_id === m.id && b.home_score_bet === m.home_score && b.away_score_bet === m.away_score
        )
        const prize = Math.floor((potMap[m.id] ?? 0) / winningBets.length) + (prizeCarryoverPerWinnerMap[m.id] ?? 0)
        if (!effectiveMatchDebt[m.id]) effectiveMatchDebt[m.id] = {}
        effectiveMatchDebt[m.id][prof.id] = Math.min(remaining, prize)
        remaining = Math.max(0, remaining - prize)
      }
    }
  }

  // Saldo per profile: pending prizes minus debt_offset (already settled) minus remaining debt
  const saldoMap: Record<string, number> = {}
  for (const prof of profiles) {
    let totalPendingPrize = 0
    let totalDebtOffset = 0
    for (const m of finishedAll) {
      const bet = allBets.find(b => b.match_id === m.id && b.profile_id === prof.id)
      if (!bet || bet.prize_paid) continue
      if (bet.home_score_bet !== m.home_score || bet.away_score_bet !== m.away_score) continue
      const wBets = allBets.filter(b => b.match_id === m.id && b.home_score_bet === m.home_score && b.away_score_bet === m.away_score)
      totalPendingPrize += Math.floor((potMap[m.id] ?? 0) / wBets.length) + (prizeCarryoverPerWinnerMap[m.id] ?? 0)
      totalDebtOffset += bet.debt_offset ?? 0
    }
    saldoMap[prof.id] = Math.max(0, totalPendingPrize - totalDebtOffset - (debtMap[prof.id] ?? 0) + (prof.saldo_adjustment ?? 0))
  }

  // Shared props for every MatchCard (betAmount is overridden per-match at call site)
  const cardProps = { profiles, token: profile!.token, qrUrl, onBetPlaced: refreshBets, debtMap, saldo: saldoMap[profile!.id] ?? 0 }

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

        {/* Saldo banner */}
        {(saldoMap[profile!.id] ?? 0) > 0 && (
          <div className="bg-green-500/6 border border-green-500/15 rounded-2xl px-5 py-3 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-green-600">Tu saldo a favor</span>
              <span className="text-[11px] text-green-800 font-[family-name:var(--font-body)]">Premios pendientes de cobro</span>
            </div>
            <span className="text-2xl font-black tabular-nums text-green-400">Bs {saldoMap[profile!.id]}</span>
          </div>
        )}

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
                    carryoverPart={nextGroupIds.has(m.id) && !isSimultaneousNextGroup ? carryover : 0}
                    isNext={nextGroupIds.has(m.id)} {...cardProps} />
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
                    carryoverPart={nextGroupIds.has(m.id) && !isSimultaneousNextGroup ? carryover : 0}
                    isNext={nextGroupIds.has(m.id)} {...cardProps} />
                ))}
              </div>
            )}
            {searchFinished.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] font-[family-name:var(--font-body)]">Finalizados</p>
                {searchFinished.map(m => (
                  <MatchCard key={m.id} match={m}
                    myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                    allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                    prizeCarryoverPerWinner={prizeCarryoverPerWinnerMap[m.id]}
                    {...cardProps} debtMap={effectiveMatchDebt[m.id] ?? {}} />
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
            {isSimultaneousNextGroup && carryover > 0 && liveMatches.some(m => nextGroupIds.has(m.id)) && (
              <div className="bg-blue-500/8 border border-blue-500/20 rounded-2xl px-5 py-3 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-blue-400">Bote acumulado</span>
                  <span className="text-[11px] text-blue-600 font-[family-name:var(--font-body)]">Se repartirá entre los ganadores de esta jornada</span>
                </div>
                <span className="text-2xl font-black tabular-nums text-blue-400">Bs {carryover}</span>
              </div>
            )}
            {liveMatches.map(m => (
              <MatchCard key={m.id} match={m}
                myBet={allBets.find(b => b.match_id === m.id && b.profile_id === profile!.id)}
                allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                carryoverPart={nextGroupIds.has(m.id) && !isSimultaneousNextGroup ? carryover : 0}
                isNext={nextGroupIds.has(m.id)} {...cardProps} />
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        {!searchActive && <div className="flex gap-1 bg-[#111] border border-[#1e1e1e] rounded-xl p-1">
          {(['upcoming', 'finished', 'groups', 'winners'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[11px] font-black uppercase tracking-[0.08em] rounded-lg transition-all duration-200 cursor-pointer ${
                activeTab === tab
                  ? 'bg-[#f5f5f5] text-[#0a0a0a] shadow-sm'
                  : 'text-[#555] hover:text-[#888]'
              }`}>
              {tab === 'upcoming' ? 'Próximos'
                : tab === 'finished' ? 'Anteriores'
                : tab === 'groups' ? 'Grupos'
                : 'Ganadores'}
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
                {/* Accumulated pot banner — shown once for the next simultaneous group */}
                {isSimultaneousNextGroup && carryover > 0 && liveMatches.length === 0 && matchesForDate.some(m => nextGroupIds.has(m.id)) && (
                  <div className="bg-blue-500/8 border border-blue-500/20 rounded-2xl px-5 py-3 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-blue-400">Bote acumulado</span>
                      <span className="text-[11px] text-blue-600 font-[family-name:var(--font-body)]">Se repartirá entre los ganadores de esta jornada</span>
                    </div>
                    <span className="text-2xl font-black tabular-nums text-blue-400">Bs {carryover}</span>
                  </div>
                )}
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
                      carryoverPart={nextGroupIds.has(m.id) && !isSimultaneousNextGroup ? carryover : 0}
                      isNext={nextGroupIds.has(m.id)} {...cardProps} />
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
                      allBets={allBets} betAmount={effectiveAmount(m)} pot={potMap[m.id] ?? 0}
                      prizeCarryoverPerWinner={prizeCarryoverPerWinnerMap[m.id]}
                      {...cardProps} debtMap={effectiveMatchDebt[m.id] ?? {}} />
                  ))}
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── Groups / Standings tab ── */}
        {!searchActive && activeTab === 'groups' && (
          <div className="flex flex-col gap-3">
            {/* Sub-tabs */}
            <div className="flex gap-2">
              {([['tables', 'Tablas'], ['bracket', 'Eliminatorias']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setGroupsSubTab(val)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    groupsSubTab === val
                      ? 'bg-[#f5f5f5] text-[#0a0a0a]'
                      : 'bg-[#111] border border-[#1e1e1e] text-[#777] hover:text-[#bbb] hover:border-[#333]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tables sub-tab ── */}
            {groupsSubTab === 'tables' && (
              groupStandings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">No hay datos de grupos disponibles</p>
                </div>
              ) : (
                <>
                  {groupStandings.map(gs => (
                    <div key={gs.group} className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-[#181818]">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555] font-[family-name:var(--font-body)]">Grupo {gs.group}</span>
                      </div>
                      <div className="grid grid-cols-[18px_1fr_18px_18px_18px_18px_26px_26px] items-center gap-x-1 px-3 py-1.5 border-b border-[#161616]">
                        <span />
                        <span className="text-[9px] font-bold text-[#2a2a2a] uppercase tracking-[0.1em]">Equipo</span>
                        {['J', 'G', 'E', 'P', 'DG', 'Pts'].map(h => (
                          <span key={h} className={`text-[9px] font-bold text-center uppercase tracking-[0.1em] ${h === 'Pts' ? 'text-[#3a3a3a]' : 'text-[#2a2a2a]'}`}>{h}</span>
                        ))}
                      </div>
                      {gs.table.map((row, i) => {
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
              )
            )}

            {/* ── Bracket sub-tab ── */}
            {groupsSubTab === 'bracket' && (() => {
              const knockoutMatches = matches
                .filter(m => m.stage !== 'GROUP_STAGE' && m.stage !== 'THIRD_PLACE')
                .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
              const thirdPlace = matches.find(m => m.stage === 'THIRD_PLACE')

              const r32 = knockoutMatches.filter(m => m.stage === 'LAST_32')
              const r16 = knockoutMatches.filter(m => m.stage === 'LAST_16')
              const rQF = knockoutMatches.filter(m => m.stage === 'QUARTER_FINALS')
              const rSF = knockoutMatches.filter(m => m.stage === 'SEMI_FINALS')
              const rF  = knockoutMatches.filter(m => m.stage === 'FINAL')

              const half = (arr: Match[]) => [arr.slice(0, Math.ceil(arr.length / 2)), arr.slice(Math.ceil(arr.length / 2))]
              const [l32, r32r] = half(r32)
              const [l16, r16r] = half(r16)
              const [lQF, rQFr] = half(rQF)
              const [lSF, rSFr] = half(rSF)

              if (r32.length === 0 && r16.length === 0) return (
                <div className="text-center py-12">
                  <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">Aún no se han definido partidos de eliminatorias</p>
                </div>
              )

              function BCard({ m }: { m: Match }) {
                const fin = m.status === 'FINISHED'
                const live = isLive(m.status)
                const tbd = m.home_team === 'Por definir' || m.away_team === 'Por definir'
                const hW = fin && m.home_score !== null && m.away_score !== null && m.home_score > m.away_score
                const aW = fin && m.home_score !== null && m.away_score !== null && m.away_score > m.home_score
                return (
                  <div className={`rounded-lg border overflow-hidden w-[105px] shrink-0 ${
                    live ? 'border-green-500/40 bg-[#0b110a]' : fin ? 'border-[#222] bg-[#0d0d0d]' : 'border-[#1a1a1a] bg-[#111]'
                  }`}>
                    <div className={`px-1.5 py-[3px] flex items-center gap-1 ${hW ? 'bg-green-500/8' : ''}`}>
                      {m.home_crest && !tbd
                        ? <img src={m.home_crest} alt="" className="w-3 h-3 object-contain shrink-0" />
                        : <div className="w-3 h-3 rounded-[2px] bg-[#1a1a1a] shrink-0" />}
                      <span className={`text-[9px] flex-1 truncate ${tbd ? 'text-[#333] italic' : hW ? 'font-bold text-[#eee]' : 'text-[#777]'}`}>
                        {tlaEs(m.home_tla) || teamNameEs(m.home_team) || '???'}
                      </span>
                      {(fin || live) && <span className={`text-[10px] font-black tabular-nums ${hW ? 'text-green-400' : 'text-[#444]'}`}>{m.home_score}</span>}
                    </div>
                    <div className={`px-1.5 py-[3px] flex items-center gap-1 border-t border-[#151515] ${aW ? 'bg-green-500/8' : ''}`}>
                      {m.away_crest && !tbd
                        ? <img src={m.away_crest} alt="" className="w-3 h-3 object-contain shrink-0" />
                        : <div className="w-3 h-3 rounded-[2px] bg-[#1a1a1a] shrink-0" />}
                      <span className={`text-[9px] flex-1 truncate ${tbd ? 'text-[#333] italic' : aW ? 'font-bold text-[#eee]' : 'text-[#777]'}`}>
                        {tlaEs(m.away_tla) || teamNameEs(m.away_team) || '???'}
                      </span>
                      {(fin || live) && <span className={`text-[10px] font-black tabular-nums ${aW ? 'text-green-400' : 'text-[#444]'}`}>{m.away_score}</span>}
                    </div>
                  </div>
                )
              }

              function RoundCol({ ms, label }: { ms: Match[]; label: string }) {
                return (
                  <div className="flex flex-col shrink-0">
                    <span className="text-[7px] font-black uppercase tracking-[0.15em] text-[#333] text-center h-4 font-[family-name:var(--font-body)]">{label}</span>
                    <div className="flex-1 flex flex-col">
                      {ms.map(m => (
                        <div key={m.id} className="flex-1 flex items-center">
                          <BCard m={m} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              function Conn({ pairs, mirror }: { pairs: number; mirror?: boolean }) {
                const side = mirror ? 'border-l' : 'border-r'
                if (pairs === 0) return (
                  <div className="w-3 shrink-0 flex flex-col">
                    <div className="h-4" />
                    <div className="flex-1 flex items-center"><div className={`w-full border-t border-[#2a2a2a]`} /></div>
                  </div>
                )
                return (
                  <div className="w-3 shrink-0 flex flex-col">
                    <div className="h-4" />
                    <div className="flex-1 flex flex-col">
                      {Array.from({ length: pairs }).map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col">
                          <div className={`flex-1 border-b ${side} border-[#2a2a2a]`} />
                          <div className={`flex-1 border-t ${side} border-[#2a2a2a]`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              const bracketH = Math.max(l32.length, r32r.length, 4) * 52

              return (
                <div className="flex flex-col gap-5">
                  <div className="overflow-x-auto -mx-4 px-4 pb-2">
                    <div className="flex min-w-max" style={{ height: bracketH }}>
                      {/* Left bracket */}
                      {l32.length > 0 && <><RoundCol ms={l32} label="16avos" /><Conn pairs={Math.floor(l32.length / 2)} /></>}
                      {l16.length > 0 && <><RoundCol ms={l16} label="8vos" /><Conn pairs={Math.floor(l16.length / 2)} /></>}
                      {lQF.length > 0 && <><RoundCol ms={lQF} label="4tos" /><Conn pairs={Math.floor(lQF.length / 2)} /></>}
                      {lSF.length > 0 && <><RoundCol ms={lSF} label="Semis" /><Conn pairs={0} /></>}

                      {/* Final */}
                      {rF.length > 0 && <RoundCol ms={rF} label="Final" />}

                      {/* Right bracket (mirrored) */}
                      {rSFr.length > 0 && <><Conn pairs={0} mirror /><RoundCol ms={rSFr} label="Semis" /></>}
                      {rQFr.length > 0 && <><Conn pairs={Math.floor(rQFr.length / 2)} mirror /><RoundCol ms={rQFr} label="4tos" /></>}
                      {r16r.length > 0 && <><Conn pairs={Math.floor(r16r.length / 2)} mirror /><RoundCol ms={r16r} label="8vos" /></>}
                      {r32r.length > 0 && <><Conn pairs={Math.floor(r32r.length / 2)} mirror /><RoundCol ms={r32r} label="16avos" /></>}
                    </div>
                  </div>

                  {/* Third place */}
                  {thirdPlace && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#333] font-[family-name:var(--font-body)]">Tercer Lugar</span>
                      <BCard m={thirdPlace} />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Ganadores tab ── */}
        {!searchActive && activeTab === 'winners' && (() => {
          const filteredFinished = finishedAll.filter(m => {
            if (winnerFilter === 'groups')   return m.stage === 'GROUP_STAGE'
            if (winnerFilter === 'knockout') return m.stage !== 'GROUP_STAGE'
            return true
          })

          const leaderboard = profiles.map(prof => {
            const wins = filteredFinished.flatMap(m => {
              const myBet = allBets.find(b => b.match_id === m.id && b.profile_id === prof.id)
              if (!myBet) return []
              if (myBet.home_score_bet !== m.home_score || myBet.away_score_bet !== m.away_score) return []
              const winningBets = allBets.filter(b => b.match_id === m.id && b.home_score_bet === m.home_score && b.away_score_bet === m.away_score)
              const pot = potMap[m.id] ?? 0
              const carryoverPW = prizeCarryoverPerWinnerMap[m.id] ?? 0
              const prize = Math.floor(pot / winningBets.length) + carryoverPW
              const offset = myBet.debt_offset ?? 0
              return [{ match: m, prize, prizePaid: myBet.prize_paid, coWinners: winningBets.length, offset }]
            })
            const totalPrize = wins.reduce((s, w) => s + w.prize, 0)
            return { profile: prof, wins, totalPrize }
          })
            .filter(s => s.wins.length > 0)
            .sort((a, b) => b.totalPrize - a.totalPrize || b.wins.length - a.wins.length)

          return (
            <div className="flex flex-col gap-4">
              {/* Filters */}
              <div className="flex gap-2">
                {([['all', 'Todos'], ['groups', 'Grupos'], ['knockout', 'Eliminatorias']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setWinnerFilter(val)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      winnerFilter === val
                        ? 'bg-[#f5f5f5] text-[#0a0a0a]'
                        : 'bg-[#111] border border-[#1e1e1e] text-[#777] hover:text-[#bbb] hover:border-[#333]'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">
                    {finishedAll.length === 0 ? 'Aún no se han jugado partidos' : 'Nadie ha acertado un resultado exacto todavía'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {leaderboard.map(({ profile: prof, wins, totalPrize }, idx) => (
                    <div key={prof.id} className="bg-[#111] border border-[#252525] rounded-2xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
                      {/* User header */}
                      <div className="px-5 py-4 flex items-center gap-3 border-b border-[#1e1e1e]"
                        style={{ background: `linear-gradient(135deg, ${prof.color}18 0%, transparent 60%)` }}>
                        <span className="text-xs font-black text-[#444] tabular-nums w-5 shrink-0">#{idx + 1}</span>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ backgroundColor: prof.color }}>
                          {prof.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#f5f5f5]">{prof.name}</p>
                          <p className="text-[11px] text-[#555] font-[family-name:var(--font-body)]">
                            {wins.length} acierto{wins.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-xl font-black tabular-nums text-green-400">Bs {totalPrize}</span>
                          {(saldoMap[prof.id] ?? 0) > 0 && (
                            <span className="text-[10px] text-amber-400 font-bold tabular-nums font-[family-name:var(--font-body)]">
                              Saldo: Bs {saldoMap[prof.id]}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Winning matches */}
                      <div className="divide-y divide-[#1a1a1a]">
                        {wins.map(({ match: m, prize, prizePaid, coWinners, offset }) => {
                          const saldo = Math.max(0, prize - offset)
                          return (
                            <div key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                {m.home_crest && <img src={m.home_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
                                <span className="text-[11px] text-[#888] truncate font-[family-name:var(--font-body)]">
                                  {tlaEs(m.home_tla) || m.home_team} vs {tlaEs(m.away_tla) || m.away_team}
                                </span>
                                {m.away_crest && <img src={m.away_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
                              </div>
                              <span className="text-[11px] font-bold text-green-600 tabular-nums shrink-0">
                                {m.home_score}–{m.away_score}
                              </span>
                              {coWinners > 1 && (
                                <span className="text-[9px] text-[#444] font-[family-name:var(--font-body)] shrink-0">{coWinners}×</span>
                              )}
                              <div className="flex flex-col items-end shrink-0 min-w-[52px]">
                                {offset > 0 ? (
                                  <>
                                    <span className="text-[10px] tabular-nums text-[#666] font-[family-name:var(--font-body)] line-through">Bs {prize}</span>
                                    <span className="text-xs font-bold tabular-nums text-green-400">Bs {saldo}</span>
                                    <span className="text-[8px] text-amber-600 font-[family-name:var(--font-body)]">−Bs {offset} cuotas</span>
                                  </>
                                ) : (
                                  <span className="text-xs font-bold tabular-nums text-green-400">Bs {prize}</span>
                                )}
                                <span className={`text-[9px] font-medium font-[family-name:var(--font-body)] ${prizePaid ? 'text-green-700' : 'text-amber-500'}`}>
                                  {prizePaid ? '✓ cobrado' : 'saldo'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {!matches.length && (
          <div className="text-center py-12">
            <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">Sincronizando partidos...</p>
          </div>
        )}

      </div>
    </div>
  )
}
