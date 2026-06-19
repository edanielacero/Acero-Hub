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

  const finishedMatches = matches.filter(m => m.status === 'FINISHED').slice().reverse()
  const otherMatches    = matches.filter(m => m.status !== 'FINISHED')

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

        {/* ── Apuestas en partidos jugados (editable) ── */}
        {finishedMatches.length > 0 && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#f5f5f5]">Apuestas — Partidos Jugados</h2>
              <p className="text-xs text-[#666] mt-1 font-[family-name:var(--font-body)]">Puedes editar o añadir apuestas retroactivamente</p>
            </div>

            {finishedMatches.map(match => {
              const matchBets = bets.filter(b => b.match_id === match.id)
              return (
                <div key={match.id} className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
                  {/* Match header */}
                  <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[#f5f5f5]">{match.home_team} vs {match.away_team}</span>
                      <span className="ml-3 text-xs text-[#666] font-[family-name:var(--font-body)]">
                        {new Date(match.match_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/La_Paz' })}
                      </span>
                    </div>
                    {/* Per-match bet amount */}
                    {editingMatchAmount === match.id ? (
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
                        <button onClick={() => setEditingMatchAmount(null)}
                          className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingMatchAmount(match.id); setEditAmountValue(String(match.bet_amount ?? globalBetAmount)) }}
                        className="shrink-0 flex items-center gap-1.5 group cursor-pointer">
                        <span className={`text-xs tabular-nums font-medium ${match.bet_amount !== null ? 'text-amber-400' : 'text-[#555]'}`}>
                          Bs {match.bet_amount ?? globalBetAmount}
                        </span>
                        {match.bet_amount !== null && <span className="text-[9px] text-amber-600 font-medium">★</span>}
                        <span className="text-[10px] text-[#3a3a3a] group-hover:text-[#666] transition-colors font-[family-name:var(--font-body)]">Editar</span>
                      </button>
                    )}
                    <span className="text-sm font-bold text-[#aaa] tabular-nums shrink-0">{match.home_score} – {match.away_score}</span>
                  </div>

                  {/* One row per profile */}
                  <div className="divide-y divide-[#1a1a1a]">
                    {profiles.map(prof => {
                      const bet = matchBets.find(b => b.profile_id === prof.id)
                      const key = `${match.id}-${prof.id}`
                      const isEditing = editKey === key
                      const isWinner = bet && match.home_score === bet.home_score_bet && match.away_score === bet.away_score_bet

                      return (
                        <div key={prof.id} className="px-5 py-3 flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: prof.color }}>
                            {prof.name.charAt(0)}
                          </div>

                          {/* Name */}
                          <span className="text-xs font-medium text-[#aaa] w-20 shrink-0 font-[family-name:var(--font-body)]">{prof.name}</span>

                          {/* Bet score or "sin apuesta" */}
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
                              <button onClick={() => setEditKey(null)}
                                className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer font-[family-name:var(--font-body)]">
                                Cancelar
                              </button>
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
                              <button onClick={() => startEdit(match.id, prof.id, bet)}
                                className="text-[10px] text-[#444] hover:text-[#888] transition-colors cursor-pointer font-[family-name:var(--font-body)] ml-1">
                                {bet ? 'Editar' : '+ Añadir'}
                              </button>
                            </div>
                          )}

                          {/* Payment + prize toggles (only if bet exists) */}
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
          </section>
        )}

        {/* Apuestas en partidos futuros (solo pagos) */}
        {otherMatches.some(m => bets.some(b => b.match_id === m.id)) && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Apuestas — Partidos Futuros</h2>
            {otherMatches.map(match => {
              const matchBets = bets.filter(b => b.match_id === match.id)
              if (!matchBets.length) return null
              return (
                <div key={match.id} className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#f5f5f5] flex-1">{match.home_team} vs {match.away_team}</span>
                    {editingMatchAmount === match.id ? (
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
                        <button onClick={() => setEditingMatchAmount(null)}
                          className="text-[10px] text-[#555] hover:text-[#888] cursor-pointer">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingMatchAmount(match.id); setEditAmountValue(String(match.bet_amount ?? globalBetAmount)) }}
                        className="shrink-0 flex items-center gap-1.5 group cursor-pointer">
                        <span className={`text-xs tabular-nums font-medium ${match.bet_amount !== null ? 'text-amber-400' : 'text-[#555]'}`}>
                          Bs {match.bet_amount ?? globalBetAmount}
                        </span>
                        {match.bet_amount !== null && <span className="text-[9px] text-amber-600 font-medium">★</span>}
                        <span className="text-[10px] text-[#3a3a3a] group-hover:text-[#666] transition-colors font-[family-name:var(--font-body)]">Editar</span>
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-[#1a1a1a]">
                    {matchBets.map(bet => (
                      <div key={bet.id} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: bet.mundial_profiles?.color ?? '#666' }}>
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
                </div>
              )
            })}
          </section>
        )}

      </div>
    </div>
  )
}
