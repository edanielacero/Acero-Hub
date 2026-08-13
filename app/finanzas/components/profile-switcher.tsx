'use client'

import { useEffect, useRef, useState } from 'react'
import { IconUser, IconChevronDown, IconCheck, IconPlus } from '@tabler/icons-react'
import { useProfiles } from './profile-context'

export default function ProfileSwitcher() {
  const { profiles, activeProfile, setActiveProfileId, createProfile } = useProfiles()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setCreating(false) } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleCreate() {
    if (!newName.trim()) return
    setError(null)
    const { error: err } = await createProfile(newName.trim())
    if (err) { setError(err); return }
    setNewName('')
    setCreating(false)
    setOpen(false)
  }

  if (!activeProfile) return null

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="fz-on-light flex items-center gap-1 text-[12px] font-semibold rounded-full px-2.5 py-1.5 cursor-pointer whitespace-nowrap"
        style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)', color: 'var(--text-primary)' }}>
        <IconUser size={13} stroke={2} />
        {activeProfile.name}
        <IconChevronDown size={12} stroke={2.5} />
      </button>

      {open && (
        <div className="fz-card absolute right-0 top-[calc(100%+6px)] z-30 min-w-[190px] py-1.5 shadow-lg" style={{ border: '0.5px solid var(--border)' }}>
          {profiles.map(p => (
            <button key={p.id} onClick={() => { setActiveProfileId(p.id); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left cursor-pointer"
              style={{ color: 'var(--text-primary)' }}>
              <span className="text-[13px]">{p.name}</span>
              {p.id === activeProfile.id && <IconCheck size={15} stroke={2.5} style={{ color: 'var(--text-accent)' }} />}
            </button>
          ))}
          <div style={{ borderTop: '0.5px solid var(--border)', margin: '4px 0' }} />
          {creating ? (
            <div className="px-3.5 py-2 flex flex-col gap-2">
              {error && <p className="text-[11px]" style={{ color: 'var(--text-danger)' }}>{error}</p>}
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Ej. LLC" className="fz-field-input text-left"
                style={{ border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px' }} />
              <button onClick={handleCreate} className="fz-btn-text text-left text-[12px] font-semibold">Crear perfil</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left cursor-pointer" style={{ color: 'var(--text-accent)' }}>
              <IconPlus size={14} stroke={2.5} />
              <span className="text-[13px] font-medium">Nuevo perfil</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
