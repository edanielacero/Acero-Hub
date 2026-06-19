'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16']
const randomToken = () => Math.random().toString(36).slice(2, 10)

interface Profile { id: string; name: string; token: string; color: string }
interface Match { id: number; home_team: string; home_tla: string; home_crest: string | null; away_team: string; away_tla: string; away_crest: string | null; match_date: string; status: string; home_score: number | null; away_score: number | null; bet_amount: number | null }
interface Bet { id: string; profile_id: string; match_id: number; home_score_bet: number; away_score_bet: number; payment_confirmed: boolean; prize_paid: boolean; mundial_profiles: { name: string; color: string } }

const inputClass = "bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-2.5 text-sm text-[#f5f5f5] placeholder-[#444] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
const numInput = "w-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-center text-[#f5f5f5] outline-none focus:border-[#555] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

export default function AdminMundial() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState('')
  const [globalBetAmount, setGlobalBetAmount] = useState('5')

  // Inline bet editing state
  const [editKey, setEditKey] = useState<string | null>(null) // `${matchId}-${profileId}`
  const [editHome, setEditHome] = useState('')
  const [editAway, setEditAway] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Per-match bet amount editing state
  const [editingMatchAmount, setEditingMatchAmount] = useState<number | null>(null)
  const [editAmountValue, setEditAmountValue] = useState('')
  const [savingAmount, setSavingAmount] = useState(false)

  // Match section tab
  const [matchTab, setMatchTab] = useState<'today' | 'upcoming' | 'past'>('today')

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  const router = useRouter()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/'); return }
    setIsAdmin(true)

    const [{ data: p }, { data: m }, { data: b }, { data: s }] = await Promise.all([
      supabase.from('mundial_profiles').select('*').order('created_at'),
      supabase.from('mundial_matches').select('*').order('match_date'),
      supabase.from('mundial_bets').select('*, mundial_profiles(name,color)'),
      supabase.from('mundial_settings').select('*').eq('id', 1).single(),
    ])

    setProfiles(p ?? [])
    setMatches(m ?? [])
    setBets(b ?? [])
    if (s) { setQrUrl(s.qr_image_url ?? ''); setQrPreview(s.qr_image_url ?? ''); setGlobalBetAmount(String(s.bet_amount ?? 5)) }
    setLoading(false)
  }

  async function createProfile() {
    if (!newName.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch('/api/mundial/admin/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor, token: randomToken(), createdBy: user!.id }),
    })
    if (res.ok) { setNewName(''); await loadData() }
  }

  async function deleteProfile(id: string) {
    if (!confirm('¿Eliminar este perfil y sus apuestas?')) return
    await fetch(`/api/mundial/admin/profiles?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  async function syncMatches() {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/mundial/sync', { method: 'POST' })
    const d = await res.json()
    setSyncMsg(res.ok ? `✓ ${d.synced} partidos sincronizados` : `Error: ${d.error}`)
    setSyncing(false)
    await loadData()
  }

  async function saveSettings() {
    setSavingSettings(true)
    let finalUrl = qrUrl || null

    if (qrFile) {
      const form = new FormData()
      form.append('file', qrFile)
      const res = await fetch('/api/mundial/admin/upload-qr', { method: 'POST', body: form })
      if (res.ok) {
        const { url } = await res.json()
        finalUrl = url
      }
    }

    await fetch('/api/mundial/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_image_url: finalUrl, bet_amount: Number(globalBetAmount) || 5 }),
    })
    setQrFile(null)
    setSavingSettings(false)
    await loadData()
  }

  async function togglePaymentConfirmed(betId: string, current: boolean) {
    await fetch('/api/mundial/admin/bets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betId, payment_confirmed: !current }),
    })
    await loadData()
  }

  async function togglePrizePaid(betId: string, current: boolean) {
    await fetch('/api/mundial/admin/bets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betId, prize_paid: !current }),
    })
    await loadData()
  }

  function startEdit(matchId: number, profileId: string, currentBet?: Bet) {
    setEditKey(`${matchId}-${profileId}`)
    setEditHome(currentBet ? String(currentBet.home_score_bet) : '')
    setEditAway(currentBet ? String(currentBet.away_score_bet) : '')
  }

  async function saveBetEdit(matchId: number, profileId: string) {
    if (editHome === '' || editAway === '') return
    setSavingEdit(true)
    await fetch('/api/mundial/admin/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, matchId, homeScore: Number(editHome), awayScore: Number(editAway) }),
    })
    setEditKey(null)
    setSavingEdit(false)
    await loadData()
  }

  async function saveMatchAmount(matchId: number) {
    setSavingAmount(true)
    const parsed = Number(editAmountValue)
    // null means "use global default"
    const betAmount = editAmountValue === '' || isNaN(parsed) ? null : parsed
    await fetch('/api/mundial/admin/matches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, betAmount }),
    })
    setEditingMatchAmount(null)
    setSavingAmount(false)
    await loadData()
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><span className="text-[#444] text-sm">Cargando...</span></div>
  if (!isAdmin) return null

  const toDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' })
  const todayDate  = toDate(new Date().toISOString())
  const tomorrowDate = toDate(new Date(Date.now() + 86_400_000).toISOString())

  const todayMatches    = matches.filter(m => toDate(m.match_date) === todayDate && m.status !== 'FINISHED')
  const upcomingMatches = matches.filter(m => (m.status === 'SCHEDULED' || m.status === 'TIMED') && toDate(m.match_date) > todayDate)
  const pastMatches     = matches.filter(m => m.status === 'FINISHED').slice().reverse()

  const dateLabel = (d: string) => {
    if (d === todayDate) return 'Hoy'
    if (d === tomorrowDate) return 'Mañana'
    const [y, mo, day] = d.split('-').map(Number)
    return new Date(y, mo - 1, day).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // Reusable inline amount editor widget
  function AmountEditor({ match }: { match: Match }) {
    const hasCustom = match.bet_amount !== null
    if (editingMatchAmount === match.id) {
      return (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[#555]">Bs</span>
          <input type="number" min="1" value={editAmountValue} autoFocus
            onChange={e => setEditAmountValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveMatchAmount(match.id); if (e.key === 'Escape') setEditingMatchAmount(null) }}
            className="w-16 bg-[#1a1a1a] border border-[#444] rounded-lg px-2 py-1 text-sm text-center text-[#f5f5f5] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <button onClick={() => saveMatchAmount(match.id)} disabled={savingAmount}
            className="text-[10px] font-semibold text-green-400 hover:text-green-300 transition-colors cursor-pointer disabled:opacity-40">
            {savingAmount ? '...' : '✓'}
          </button>
          <button onClick={() => setEditingMatchAmount(null)} className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer">✕</button>
        </div>
      )
    }
    return (
      <button onClick={() => { setEditingMatchAmount(match.id); setEditAmountValue(String(match.bet_amount ?? globalBetAmount)) }}
        className="shrink-0 flex items-center gap-1.5 group cursor-pointer">
        <span className={`text-xs tabular-nums font-bold ${hasCustom ? 'text-amber-400' : 'text-[#555]'}`}>
          Bs {match.bet_amount ?? globalBetAmount}
        </span>
        {hasCustom && <span className="text-[9px] text-amber-600">★</span>}
        <span className="text-[10px] text-[#2a2a2a] group-hover:text-[#666] transition-colors font-[family-name:var(--font-body)]">Editar</span>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-12">
      <div className="max-w-3xl mx-auto flex flex-col gap-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#f5f5f5]">Admin · Mundial 2026</h1>
            <p className="text-xs text-[#666] mt-1 font-[family-name:var(--font-body)]">Perfiles, partidos y pagos</p>
          </div>
          <div className="flex gap-4">
            <Link href="/mundial" className="text-xs text-[#666] hover:text-[#999] transition-colors font-[family-name:var(--font-body)]">Ver partidos →</Link>
            <Link href="/admin" className="text-xs text-[#555] hover:text-[#777] transition-colors font-[family-name:var(--font-body)]">← Panel Admin</Link>
          </div>
        </div>

        {/* Settings */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="text-sm font-semibold text-[#f5f5f5]">Configuración</h2>

          {/* QR upload */}
          <div className="flex items-start gap-5">
            {/* Preview */}
            <div className="shrink-0">
              {(qrPreview) ? (
                <div className="relative group w-24 h-24">
                  <img src={qrPreview} alt="QR de pago" className="w-24 h-24 object-contain rounded-xl border border-[#2a2a2a]" />
                  <button onClick={() => { setQrUrl(''); setQrPreview(''); setQrFile(null) }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#333] hover:bg-red-500/80 rounded-full flex items-center justify-center text-[10px] text-[#aaa] hover:text-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-[#2a2a2a] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" rx="0.5" />
                    <rect x="19" y="14" width="2" height="2" rx="0.5" /><rect x="14" y="19" width="2" height="2" rx="0.5" />
                    <rect x="18" y="18" width="3" height="3" rx="0.5" />
                  </svg>
                </div>
              )}
            </div>

            {/* Upload control */}
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-xs text-[#666] uppercase tracking-wider font-[family-name:var(--font-body)]">QR de pago</label>
              <label className="flex items-center gap-2 cursor-pointer self-start">
                <span className="text-xs font-medium bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] hover:text-[#f5f5f5] hover:border-[#444] px-4 py-2 rounded-xl transition-colors cursor-pointer font-[family-name:var(--font-body)]">
                  {qrPreview ? 'Cambiar imagen' : 'Subir imagen'}
                </span>
                <input type="file" accept="image/*" className="sr-only"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setQrFile(f)
                    setQrPreview(URL.createObjectURL(f))
                  }} />
              </label>
              {qrFile && <p className="text-[11px] text-[#555] font-[family-name:var(--font-body)] truncate max-w-[180px]">{qrFile.name}</p>}
              <p className="text-[11px] text-[#444] font-[family-name:var(--font-body)]">PNG, JPG o WebP · máx 5 MB</p>
            </div>
          </div>

          {/* Global bet amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#666] uppercase tracking-wider font-[family-name:var(--font-body)]">Monto por defecto (Bs)</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={globalBetAmount} onChange={e => setGlobalBetAmount(e.target.value)}
                className="w-24 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[#444] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-xs text-[#555] font-[family-name:var(--font-body)]">bolivianos por partido</span>
            </div>
          </div>

          <button onClick={saveSettings} disabled={savingSettings}
            className="self-end text-xs font-semibold bg-[#f5f5f5] text-[#0a0a0a] px-5 py-2 rounded-xl hover:bg-white transition-colors disabled:opacity-40 cursor-pointer">
            {savingSettings ? 'Guardando...' : 'Guardar'}
          </button>
        </section>

        {/* Sync */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Partidos ({matches.length})</h2>
              <p className="text-xs text-[#666] mt-0.5 font-[family-name:var(--font-body)]">Se sincroniza automáticamente cada hora</p>
            </div>
            <button onClick={syncMatches} disabled={syncing}
              className="text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] px-4 py-1.5 rounded-xl hover:bg-[#222] transition-colors disabled:opacity-40 cursor-pointer">
              {syncing ? 'Sincronizando...' : '↻ Forzar sync'}
            </button>
          </div>
          {syncMsg && <p className="text-xs font-[family-name:var(--font-body)]" style={{ color: syncMsg.startsWith('✓') ? '#22c55e' : '#ef4444' }}>{syncMsg}</p>}
        </section>

        {/* Profiles */}
        <section className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1a1a1a]">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Perfiles ({profiles.length})</h2>
          </div>
          <div className="p-6 border-b border-[#1a1a1a] flex items-end gap-3">
            <div className="flex-1">
              <input className={`${inputClass} w-full`} placeholder="Nombre del perfil" value={newName}
                onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProfile()} />
            </div>
            <div className="flex gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-all cursor-pointer ${newColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#111]' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <button onClick={createProfile} disabled={!newName.trim()}
              className="text-xs font-semibold bg-[#f5f5f5] text-[#0a0a0a] px-4 py-2.5 rounded-xl hover:bg-white transition-colors disabled:opacity-40 cursor-pointer">
              + Crear
            </button>
          </div>
          <div className="divide-y divide-[#1a1a1a]">
            {profiles.map(p => (
              <div key={p.id} className="px-6 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: p.color }}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f5f5f5]">{p.name}</p>
                  <p className="text-[11px] text-[#444] font-mono truncate">{p.token}</p>
                </div>
                <button onClick={() => deleteProfile(p.id)} className="text-[#444] hover:text-red-400 transition-colors cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Partidos · Tabs ── */}
        {matches.length > 0 && (
          <section className="flex flex-col gap-4">

            {/* Search */}
            {(() => {
              const sq = searchQuery.trim().toLowerCase()
              const searchActive = sq.length > 0
              function matchesQ(m: Match) {
                return (
                  m.home_team.toLowerCase().includes(sq) ||
                  m.away_team.toLowerCase().includes(sq) ||
                  m.home_tla.toLowerCase().includes(sq) ||
                  m.away_tla.toLowerCase().includes(sq)
                )
              }
              const sToday    = searchActive ? todayMatches.filter(matchesQ)    : []
              const sUpcoming = searchActive ? upcomingMatches.filter(matchesQ) : []
              const sPast     = searchActive ? pastMatches.filter(matchesQ)     : []
              const sAny      = sToday.length + sUpcoming.length + sPast.length > 0

              // helper: compact match row for search results
              function SearchMatchRow({ match }: { match: Match }) {
                const matchBets = bets.filter(b => b.match_id === match.id)
                const isFinished = match.status === 'FINISHED'
                return (
                  <div className={`bg-[#111] rounded-2xl overflow-hidden ${match.bet_amount !== null ? 'border border-amber-500/20' : 'border border-[#1e1e1e]'}`}>
                    <div className="px-5 py-3 flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {match.home_crest ? <img src={match.home_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                        <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.home_tla || match.home_team}</span>
                        {isFinished
                          ? <span className="text-xs font-bold text-[#aaa] tabular-nums shrink-0">{match.home_score} – {match.away_score}</span>
                          : <span className="text-[#333] font-bold shrink-0">vs</span>}
                        <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.away_tla || match.away_team}</span>
                        {match.away_crest ? <img src={match.away_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                      </div>
                      <span className="text-[11px] text-[#444] shrink-0 font-[family-name:var(--font-body)]">
                        {new Date(match.match_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/La_Paz' })}
                      </span>
                      <AmountEditor match={match} />
                    </div>
                    {matchBets.length > 0 && (
                      <div className="border-t border-[#1a1a1a] divide-y divide-[#1a1a1a]">
                        {matchBets.map(bet => {
                          const isWinner = isFinished && match.home_score === bet.home_score_bet && match.away_score === bet.away_score_bet
                          return (
                            <div key={bet.id} className="px-5 py-2.5 flex items-center gap-3">
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: bet.mundial_profiles?.color ?? '#666' }}>
                                {bet.mundial_profiles?.name?.charAt(0)}
                              </div>
                              <span className="text-xs font-medium text-[#aaa] flex-1 font-[family-name:var(--font-body)]">{bet.mundial_profiles?.name}</span>
                              <span className={`text-xs font-bold tabular-nums ${isWinner ? 'text-green-400' : 'text-[#f5f5f5]'}`}>{bet.home_score_bet} – {bet.away_score_bet}{isWinner && ' ✓'}</span>
                              <button onClick={() => togglePaymentConfirmed(bet.id, bet.payment_confirmed)}
                                className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer font-[family-name:var(--font-body)] ${bet.payment_confirmed ? 'bg-green-500/12 text-green-500 border-green-500/20' : 'text-[#555] border-[#2a2a2a] hover:border-[#444]'}`}>
                                {bet.payment_confirmed ? '✓ Pagó' : 'Confirmar pago'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* Input */}
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#444] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input type="text" placeholder="Buscar equipo..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl pl-9 pr-9 py-2.5 text-sm text-[#f5f5f5] placeholder-[#3a3a3a] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]" />
                    {searchActive && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888] cursor-pointer transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>

                  {/* Search results */}
                  {searchActive && (
                    <div className="flex flex-col gap-4">
                      {!sAny && (
                        <p className="text-center py-10 text-sm text-[#555] font-[family-name:var(--font-body)]">Sin resultados para &ldquo;{searchQuery.trim()}&rdquo;</p>
                      )}
                      {sToday.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] px-1 font-[family-name:var(--font-body)]">Hoy</p>
                          {sToday.map(m => <SearchMatchRow key={m.id} match={m} />)}
                        </div>
                      )}
                      {sUpcoming.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] px-1 font-[family-name:var(--font-body)]">Próximos</p>
                          {sUpcoming.map(m => <SearchMatchRow key={m.id} match={m} />)}
                        </div>
                      )}
                      {sPast.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] px-1 font-[family-name:var(--font-body)]">Anteriores</p>
                          {sPast.map(m => <SearchMatchRow key={m.id} match={m} />)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
            })()}

            {/* Tab bar */}
            {!searchQuery.trim() && <div className="flex gap-1 bg-[#111] border border-[#1e1e1e] rounded-xl p-1">
              {([
                ['today',    `Hoy${todayMatches.length > 0 ? ` (${todayMatches.length})` : ''}`],
                ['upcoming', `Próximos${upcomingMatches.length > 0 ? ` (${upcomingMatches.length})` : ''}`],
                ['past',     `Anteriores${pastMatches.length > 0 ? ` (${pastMatches.length})` : ''}`],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setMatchTab(tab)}
                  className={`flex-1 py-2 text-[11px] font-black uppercase tracking-[0.08em] rounded-lg transition-all duration-200 cursor-pointer ${
                    matchTab === tab ? 'bg-[#f5f5f5] text-[#0a0a0a] shadow-sm' : 'text-[#555] hover:text-[#888]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>}

            {/* ── Hoy ── */}
            {!searchQuery.trim() && matchTab === 'today' && (
              todayMatches.length === 0 ? (
                <p className="text-center py-10 text-sm text-[#555] font-[family-name:var(--font-body)]">No hay partidos hoy</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {todayMatches.map(match => {
                    const matchBets = bets.filter(b => b.match_id === match.id)
                    const isLiveMatch = match.status === 'IN_PLAY' || match.status === 'PAUSED'
                    return (
                      <div key={match.id} className={`bg-[#111] rounded-2xl overflow-hidden ${match.bet_amount !== null ? 'border border-amber-500/20' : 'border border-[#1e1e1e]'}`}>
                        <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {match.home_crest ? <img src={match.home_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                            <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.home_tla || match.home_team}</span>
                            <span className="text-[#333] font-bold shrink-0">vs</span>
                            <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.away_tla || match.away_team}</span>
                            {match.away_crest ? <img src={match.away_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                          </div>
                          {isLiveMatch ? (
                            <span className="flex items-center gap-1.5 bg-red-500/12 border border-red-500/25 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                              <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" /></span>
                              EN VIVO · {match.home_score ?? 0}–{match.away_score ?? 0}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#555] shrink-0 font-[family-name:var(--font-body)]">
                              {new Date(match.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })}
                            </span>
                          )}
                          <AmountEditor match={match} />
                        </div>
                        {matchBets.length > 0 && (
                          <div className="divide-y divide-[#1a1a1a]">
                            {matchBets.map(bet => (
                              <div key={bet.id} className="px-5 py-2.5 flex items-center gap-3">
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: bet.mundial_profiles?.color ?? '#666' }}>
                                  {bet.mundial_profiles?.name?.charAt(0)}
                                </div>
                                <span className="text-xs font-medium text-[#aaa] flex-1 font-[family-name:var(--font-body)]">{bet.mundial_profiles?.name}</span>
                                <span className="text-xs font-bold text-[#f5f5f5] tabular-nums">{bet.home_score_bet} – {bet.away_score_bet}</span>
                                <button onClick={() => togglePaymentConfirmed(bet.id, bet.payment_confirmed)}
                                  className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer font-[family-name:var(--font-body)] ${bet.payment_confirmed ? 'bg-green-500/12 text-green-500 border-green-500/20' : 'text-[#555] border-[#2a2a2a] hover:border-[#444]'}`}>
                                  {bet.payment_confirmed ? '✓ Pagó' : 'Confirmar pago'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {matchBets.length === 0 && (
                          <p className="px-5 py-3 text-xs text-[#3a3a3a] italic font-[family-name:var(--font-body)]">Sin apuestas aún</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* ── Próximos ── */}
            {!searchQuery.trim() && matchTab === 'upcoming' && (
              upcomingMatches.length === 0 ? (
                <p className="text-center py-10 text-sm text-[#555] font-[family-name:var(--font-body)]">No hay partidos próximos</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {[...new Set(upcomingMatches.map(m => toDate(m.match_date)))].sort().map(date => (
                    <div key={date} className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#3a3a3a] px-1 font-[family-name:var(--font-body)]">
                        {dateLabel(date)}
                      </p>
                      {upcomingMatches.filter(m => toDate(m.match_date) === date).map(match => {
                        const matchBets = bets.filter(b => b.match_id === match.id)
                        return (
                          <div key={match.id} className={`bg-[#111] rounded-2xl overflow-hidden ${match.bet_amount !== null ? 'border border-amber-500/20' : 'border border-[#1e1e1e]'}`}>
                            <div className="px-5 py-3 flex items-center gap-3">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {match.home_crest ? <img src={match.home_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                                <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.home_tla || match.home_team}</span>
                                <span className="text-[#333] font-bold shrink-0">vs</span>
                                <span className="text-sm font-semibold text-[#f5f5f5] truncate">{match.away_tla || match.away_team}</span>
                                {match.away_crest ? <img src={match.away_crest} alt="" className="w-5 h-5 object-contain shrink-0" /> : <div className="w-5 h-5 rounded-full bg-[#1a1a1a] shrink-0" />}
                              </div>
                              <span className="text-[11px] text-[#444] shrink-0 font-[family-name:var(--font-body)]">
                                {new Date(match.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' })}
                              </span>
                              <AmountEditor match={match} />
                            </div>
                            {matchBets.length > 0 && (
                              <div className="border-t border-[#1a1a1a] divide-y divide-[#1a1a1a]">
                                {matchBets.map(bet => (
                                  <div key={bet.id} className="px-5 py-2.5 flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: bet.mundial_profiles?.color ?? '#666' }}>
                                      {bet.mundial_profiles?.name?.charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium text-[#aaa] flex-1 font-[family-name:var(--font-body)]">{bet.mundial_profiles?.name}</span>
                                    <span className="text-xs font-bold text-[#f5f5f5] tabular-nums">{bet.home_score_bet} – {bet.away_score_bet}</span>
                                    <button onClick={() => togglePaymentConfirmed(bet.id, bet.payment_confirmed)}
                                      className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer font-[family-name:var(--font-body)] ${bet.payment_confirmed ? 'bg-green-500/12 text-green-500 border-green-500/20' : 'text-[#555] border-[#2a2a2a] hover:border-[#444]'}`}>
                                      {bet.payment_confirmed ? '✓ Pagó' : 'Confirmar pago'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Anteriores ── */}
            {!searchQuery.trim() && matchTab === 'past' && (
              pastMatches.length === 0 ? (
                <p className="text-center py-10 text-sm text-[#555] font-[family-name:var(--font-body)]">Aún no se han jugado partidos</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-[#666] font-[family-name:var(--font-body)]">Puedes editar o añadir apuestas retroactivamente</p>
                  {pastMatches.map(match => {
                    const matchBets = bets.filter(b => b.match_id === match.id)
                    return (
                      <div key={match.id} className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-[#f5f5f5]">{match.home_team} vs {match.away_team}</span>
                            <span className="ml-3 text-xs text-[#555] font-[family-name:var(--font-body)]">
                              {new Date(match.match_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/La_Paz' })}
                            </span>
                          </div>
                          <AmountEditor match={match} />
                          <span className="text-sm font-bold text-[#aaa] tabular-nums shrink-0">{match.home_score} – {match.away_score}</span>
                        </div>
                        <div className="divide-y divide-[#1a1a1a]">
                          {profiles.map(prof => {
                            const bet = matchBets.find(b => b.profile_id === prof.id)
                            const key = `${match.id}-${prof.id}`
                            const isEditing = editKey === key
                            const isWinner = bet && match.home_score === bet.home_score_bet && match.away_score === bet.away_score_bet
                            return (
                              <div key={prof.id} className="px-5 py-3 flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: prof.color }}>
                                  {prof.name.charAt(0)}
                                </div>
                                <span className="text-xs font-medium text-[#aaa] w-20 shrink-0 font-[family-name:var(--font-body)]">{prof.name}</span>
                                {isEditing ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    {match.home_crest && <img src={match.home_crest} alt={match.home_tla} className="w-5 h-5 object-contain shrink-0" />}
                                    <input type="number" min="0" max="20" value={editHome} onChange={e => setEditHome(e.target.value)} className={numInput} autoFocus />
                                    <span className="text-[#555] font-bold">–</span>
                                    <input type="number" min="0" max="20" value={editAway} onChange={e => setEditAway(e.target.value)} className={numInput} />
                                    {match.away_crest && <img src={match.away_crest} alt={match.away_tla} className="w-5 h-5 object-contain shrink-0" />}
                                    <button onClick={() => saveBetEdit(match.id, prof.id)} disabled={savingEdit || editHome === '' || editAway === ''}
                                      className="text-[10px] font-semibold bg-[#f5f5f5] text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-40 cursor-pointer">
                                      {savingEdit ? '...' : 'Guardar'}
                                    </button>
                                    <button onClick={() => setEditKey(null)} className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer font-[family-name:var(--font-body)]">Cancelar</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-1">
                                    {bet ? (
                                      <span className={`text-xs font-bold tabular-nums ${isWinner ? 'text-green-400' : 'text-[#777]'}`}>
                                        {bet.home_score_bet} – {bet.away_score_bet}
                                        {isWinner && <span className="ml-1.5 text-[10px] font-normal text-green-500">✓</span>}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-[#444] italic font-[family-name:var(--font-body)]">Sin apuesta</span>
                                    )}
                                    <button onClick={() => startEdit(match.id, prof.id, bet)} className="text-[10px] text-[#444] hover:text-[#888] transition-colors cursor-pointer font-[family-name:var(--font-body)] ml-1">
                                      {bet ? 'Editar' : '+ Añadir'}
                                    </button>
                                  </div>
                                )}
                                {bet && !isEditing && (
                                  <div className="flex items-center gap-2 ml-auto">
                                    <button onClick={() => togglePaymentConfirmed(bet.id, bet.payment_confirmed)}
                                      className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer font-[family-name:var(--font-body)] ${bet.payment_confirmed ? 'bg-green-500/12 text-green-500 border-green-500/20' : 'text-[#555] border-[#2a2a2a] hover:border-[#444]'}`}>
                                      {bet.payment_confirmed ? '✓ Pagó' : 'Confirmar pago'}
                                    </button>
                                    <button onClick={() => togglePrizePaid(bet.id, bet.prize_paid)}
                                      className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer font-[family-name:var(--font-body)] ${bet.prize_paid ? 'bg-blue-500/12 text-blue-400 border-blue-500/20' : 'text-[#555] border-[#2a2a2a] hover:border-[#444]'}`}>
                                      {bet.prize_paid ? '✓ Premio' : 'Premio'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

          </section>
        )}

      </div>
    </div>
  )
}
