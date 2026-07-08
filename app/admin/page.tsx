'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Project { id: string; name: string; slug: string }
interface UserAccess {
  id: string
  name: string
  email: string
  role: string
  projectIds: string[]
}
interface PendingInvite {
  id: string
  email: string
  name: string | null
  created_at: string
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserAccess[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteProjects, setInviteProjects] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')

  const [resending, setResending] = useState<string | null>(null)
  const [notifying, setNotifying] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null)
  const [deletingInvite, setDeletingInvite] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/'); return }
    setIsAdmin(true)
    setCurrentUserId(user.id)

    const [{ data: profilesData }, { data: projectsData }, { data: accessData }, { data: invitesData }] = await Promise.all([
      supabase.from('profiles').select('id, name, email, role').order('created_at'),
      supabase.from('projects').select('id, name, slug').order('name'),
      supabase.from('project_access').select('user_id, project_id'),
      supabase.from('invitations').select('id, email, name, created_at').is('used_at', null).order('created_at', { ascending: false }),
    ])

    const profileEmails = new Set((profilesData || []).map(p => p.email))

    setProjects(projectsData || [])
    setUsers((profilesData || []).map(p => ({
      ...p,
      projectIds: (accessData || []).filter(a => a.user_id === p.id).map(a => a.project_id),
    })))
    // Solo mostrar invitaciones de emails que aún no tienen cuenta
    setPendingInvites((invitesData || []).filter(inv => !profileEmails.has(inv.email)))
    setLoading(false)
  }

  async function toggleAccess(userId: string, projectId: string, hasAccess: boolean) {
    const supabase = createClient()
    if (hasAccess) {
      await supabase.from('project_access').delete().eq('user_id', userId).eq('project_id', projectId)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('project_access').insert({ user_id: userId, project_id: projectId, granted_by: user!.id })
    }
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, projectIds: hasAccess ? u.projectIds.filter(id => id !== projectId) : [...u.projectIds, projectId] }
        : u
    ))
  }

  async function deleteUser(userId: string) {
    if (!confirm('¿Eliminar este usuario?')) return
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId))
  }

  async function deleteInvite(id: string) {
    setDeletingInvite(id)
    try {
      await fetch(`/api/invite/${id}`, { method: 'DELETE' })
      setPendingInvites(prev => prev.filter(i => i.id !== id))
    } finally {
      setDeletingInvite(null)
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteSuccess('')
    setInviteError('')

    const emailLower = inviteEmail.trim().toLowerCase()
    if (users.some(u => u.email.toLowerCase() === emailLower)) {
      setInviteError('Este correo ya tiene una cuenta registrada.')
      setInviteLoading(false)
      return
    }
    if (pendingInvites.some(i => i.email.toLowerCase() === emailLower)) {
      setInviteError('Ya existe una invitación pendiente para este correo. Usa "Volver a Enviar" desde la lista.')
      setInviteLoading(false)
      return
    }

    try {
      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, projectIds: inviteProjects }),
      })
      const data = await res.json()
      if (res.ok) {
        const emailId = data.emailId ? ` (ID: ${data.emailId})` : ''
        setInviteSuccess(`Invitación enviada a ${inviteEmail}${emailId}`)
        setInviteEmail(''); setInviteName(''); setInviteProjects([])
        setShowInvite(false)
        await loadData()
      } else {
        setInviteError(data.error || 'Error al enviar la invitación')
      }
    } catch {
      setInviteError('Error de red. Intenta de nuevo.')
    } finally {
      setInviteLoading(false)
    }
  }

  async function resendInvite(invite: PendingInvite) {
    setResending(invite.id)
    setActionFeedback(null)
    try {
      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email, name: invite.name, projectIds: [] }),
      })
      const data = await res.json()
      if (res.ok) {
        setActionFeedback({ id: invite.id, msg: 'Invitación reenviada', ok: true })
        await loadData()
      } else {
        setActionFeedback({ id: invite.id, msg: data.error || 'Error al reenviar', ok: false })
      }
    } catch {
      setActionFeedback({ id: invite.id, msg: 'Error de red', ok: false })
    } finally {
      setResending(null)
    }
  }

  async function notifyAccess(user: UserAccess) {
    setNotifying(user.id)
    setActionFeedback(null)
    try {
      const res = await fetch('/api/invite/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      const data = await res.json()
      if (res.ok) {
        setActionFeedback({ id: user.id, msg: 'Acceso enviado', ok: true })
      } else {
        setActionFeedback({ id: user.id, msg: data.error || 'Error al enviar', ok: false })
      }
    } catch {
      setActionFeedback({ id: user.id, msg: 'Error de red', ok: false })
    } finally {
      setNotifying(null)
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><span className="text-[#333] text-sm">Cargando...</span></div>
  if (!isAdmin) return null

  const inputClass = "w-full bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-12">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f5f5f5]">Panel Admin</h1>
            <p className="text-xs text-[#444] mt-1 font-[family-name:var(--font-body)]">Gestión de usuarios y accesos</p>
          </div>
          <Link href="/" className="text-xs text-[#555] hover:text-[#888] transition-colors font-[family-name:var(--font-body)]">
            ← Volver al Hub
          </Link>
        </div>

        {inviteSuccess && (
          <p className="text-xs text-green-400 font-[family-name:var(--font-body)]">{inviteSuccess}</p>
        )}

        {/* Invite form */}
        {showInvite && (
          <form onSubmit={sendInvite} className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-[#f5f5f5]">Invitar usuario</h2>
            <div className="grid grid-cols-2 gap-3">
              <input type="email" required placeholder="correo@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className={inputClass} />
              <input type="text" placeholder="Nombre (opcional)" value={inviteName} onChange={e => setInviteName(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-[#555] uppercase tracking-wider font-[family-name:var(--font-body)]">Acceso a proyectos</span>
              <div className="flex flex-wrap gap-2">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteProjects.includes(p.id)}
                      onChange={e => setInviteProjects(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                      className="accent-white"
                    />
                    <span className="text-sm text-[#888] font-[family-name:var(--font-body)]">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {inviteError && (
              <p className="text-xs text-red-400 font-[family-name:var(--font-body)]">{inviteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowInvite(false); setInviteError('') }} className="text-xs text-[#555] hover:text-[#888] px-4 py-2 transition-colors cursor-pointer font-[family-name:var(--font-body)]">Cancelar</button>
              <button type="submit" disabled={inviteLoading} className="flex items-center gap-2 bg-[#f5f5f5] text-[#0a0a0a] font-semibold text-xs px-5 py-2 rounded-xl hover:bg-white transition-colors disabled:opacity-40 cursor-pointer">
                {inviteLoading
                  ? <><span className="w-3 h-3 border border-[#0a0a0a]/40 border-t-[#0a0a0a] rounded-full animate-spin" />Enviando...</>
                  : 'Enviar invitación'
                }
              </button>
            </div>
          </form>
        )}

        {/* Users table */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a]">
            <span className="text-xs font-medium text-[#555] uppercase tracking-wider">
              Usuarios ({users.length})
            </span>
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 text-xs font-semibold text-[#f5f5f5] bg-[#1a1a1a] border border-[#2a2a2a] px-3.5 py-1.5 rounded-lg hover:bg-[#222] hover:border-[#333] transition-colors cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Invitar
            </button>
          </div>

          <div className="divide-y divide-[#1a1a1a]">
            {users.map(user => (
              <div key={user.id} className="px-6 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#f5f5f5] truncate">{user.name}</span>
                    {user.role === 'admin' && (
                      <span className="text-[10px] font-medium text-[#888] uppercase tracking-wider bg-[#222] px-2 py-0.5 rounded">admin</span>
                    )}
                  </div>
                  <p className="text-xs text-[#777] font-[family-name:var(--font-body)] truncate mb-2">{user.email}</p>
                  <div className="flex flex-wrap gap-2">
                    {projects.map(project => {
                      const has = user.projectIds.includes(project.id)
                      return (
                        <button
                          key={project.id}
                          onClick={() => toggleAccess(user.id, project.id, has)}
                          disabled={user.id === currentUserId}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer disabled:cursor-default disabled:opacity-30 font-[family-name:var(--font-body)] ${
                            has
                              ? 'bg-[#f5f5f5] text-[#0a0a0a] border-[#f5f5f5] font-medium'
                              : 'bg-transparent text-[#999] border-[#333] hover:border-[#555] hover:text-[#ccc]'
                          }`}
                        >
                          {project.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {user.role !== 'admin' && (
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {actionFeedback?.id === user.id ? (
                      <span className={`text-[11px] px-2.5 py-1.5 rounded-lg font-[family-name:var(--font-body)] ${actionFeedback.ok ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {actionFeedback.msg}
                      </span>
                    ) : (
                      <button
                        onClick={() => notifyAccess(user)}
                        disabled={notifying === user.id}
                        className="flex items-center gap-1.5 text-[11px] text-[#aaa] border border-[#3a3a3a] hover:border-[#666] hover:text-[#f5f5f5] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 font-[family-name:var(--font-body)] whitespace-nowrap"
                      >
                        {notifying === user.id ? (
                          <span className="w-3 h-3 border border-[#888] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        )}
                        Enviar Acceso
                      </button>
                    )}
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[#666] border border-[#2a2a2a] hover:border-[#555] hover:text-red-400 hover:bg-red-400/5 transition-colors cursor-pointer"
                      aria-label="Eliminar usuario"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1a1a1a]">
              <span className="text-xs font-medium text-[#777] uppercase tracking-wider">
                Invitaciones pendientes ({pendingInvites.length})
              </span>
            </div>
            <div className="divide-y divide-[#1a1a1a]">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#f5f5f5] truncate">{inv.name || inv.email}</span>
                      <span className="text-[10px] font-medium text-yellow-500/80 uppercase tracking-wider bg-yellow-500/10 px-2 py-0.5 rounded shrink-0">pendiente</span>
                    </div>
                    {inv.name && (
                      <p className="text-xs text-[#777] font-[family-name:var(--font-body)] truncate">{inv.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {actionFeedback?.id === inv.id ? (
                      <span className={`text-[11px] px-2.5 py-1.5 rounded-lg font-[family-name:var(--font-body)] ${actionFeedback.ok ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {actionFeedback.msg}
                      </span>
                    ) : (
                      <button
                        onClick={() => resendInvite(inv)}
                        disabled={resending === inv.id}
                        className="flex items-center gap-1.5 text-[11px] text-[#aaa] border border-[#3a3a3a] hover:border-[#666] hover:text-[#f5f5f5] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 font-[family-name:var(--font-body)] whitespace-nowrap"
                      >
                        {resending === inv.id ? (
                          <span className="w-3 h-3 border border-[#888] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 2H3v16h5v4l4-4h5l4-4V2z" />
                          </svg>
                        )}
                        Reenviar
                      </button>
                    )}
                    <button
                      onClick={() => deleteInvite(inv.id)}
                      disabled={deletingInvite === inv.id}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-[#666] border border-[#2a2a2a] hover:border-[#555] hover:text-red-400 hover:bg-red-400/5 transition-colors cursor-pointer disabled:opacity-40"
                      aria-label="Eliminar invitación"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
