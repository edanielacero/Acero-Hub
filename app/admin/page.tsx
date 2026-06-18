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

export default function AdminPage() {
  const [users, setUsers] = useState<UserAccess[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteProjects, setInviteProjects] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/'); return }
    setIsAdmin(true)

    const [{ data: profilesData }, { data: projectsData }, { data: accessData }] = await Promise.all([
      supabase.from('profiles').select('id, name, email, role').order('created_at'),
      supabase.from('projects').select('id, name, slug').order('name'),
      supabase.from('project_access').select('user_id, project_id'),
    ])

    setProjects(projectsData || [])
    setUsers((profilesData || []).map(p => ({
      ...p,
      projectIds: (accessData || []).filter(a => a.user_id === p.id).map(a => a.project_id),
    })))
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

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteSuccess('')
    const res = await fetch('/api/invite/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName, projectIds: inviteProjects }),
    })
    if (res.ok) {
      setInviteSuccess(`Invitación enviada a ${inviteEmail}`)
      setInviteEmail(''); setInviteName(''); setInviteProjects([])
      setShowInvite(false)
    }
    setInviteLoading(false)
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

        {/* Invite success */}
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
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowInvite(false)} className="text-xs text-[#555] hover:text-[#888] px-4 py-2 transition-colors cursor-pointer font-[family-name:var(--font-body)]">Cancelar</button>
              <button type="submit" disabled={inviteLoading} className="bg-[#f5f5f5] text-[#0a0a0a] font-semibold text-xs px-5 py-2 rounded-xl hover:bg-white transition-colors disabled:opacity-40 cursor-pointer">
                {inviteLoading ? 'Enviando...' : 'Enviar invitación'}
              </button>
            </div>
          </form>
        )}

        {/* Users table */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a]">
            <span className="text-xs font-medium text-[#555] uppercase tracking-wider">Usuarios ({users.length})</span>
            <button onClick={() => setShowInvite(true)} className="text-xs font-semibold text-[#f5f5f5] bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-1.5 rounded-lg hover:bg-[#222] transition-colors cursor-pointer">
              + Invitar
            </button>
          </div>

          <div className="divide-y divide-[#1a1a1a]">
            {users.map(user => (
              <div key={user.id} className="px-6 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#f5f5f5] truncate">{user.name}</span>
                    {user.role === 'admin' && (
                      <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider bg-[#1a1a1a] px-2 py-0.5 rounded">admin</span>
                    )}
                  </div>
                  <p className="text-xs text-[#555] font-[family-name:var(--font-body)] truncate mb-2">{user.email}</p>
                  <div className="flex flex-wrap gap-2">
                    {projects.map(project => {
                      const has = user.projectIds.includes(project.id)
                      return (
                        <button
                          key={project.id}
                          onClick={() => toggleAccess(user.id, project.id, has)}
                          disabled={user.role === 'admin'}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer disabled:cursor-default font-[family-name:var(--font-body)] ${
                            has
                              ? 'bg-[#f5f5f5] text-[#0a0a0a] border-[#f5f5f5] font-medium'
                              : 'bg-transparent text-[#444] border-[#1e1e1e] hover:border-[#333]'
                          }`}
                        >
                          {project.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {user.role !== 'admin' && (
                  <button
                    onClick={() => deleteUser(user.id)}
                    className="text-[#333] hover:text-red-400 transition-colors cursor-pointer shrink-0 mt-0.5"
                    aria-label="Eliminar usuario"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
