'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, apiCached, invalidateApiCache } from '@/lib/finanzas/api-client'
import type { Profile } from '@/lib/finanzas/profiles'

const STORAGE_KEY = 'fin_active_profile'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfileId: string | null
  activeProfile: Profile | null
  loading: boolean
  setActiveProfileId: (id: string) => void
  createProfile: (name: string) => Promise<{ profile?: Profile; error?: string }>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (fresh = false) => {
    setLoading(true)
    // Comparte el cache de /bootstrap con QuickAddProvider e Inicio — evita un
    // auth.getUser() aparte solo para los perfiles. `fresh` lo salta después
    // de crear un perfil, para no mostrar la lista vieja cacheada.
    if (fresh) invalidateApiCache('/bootstrap')
    const json = await apiCached<{ profiles: Profile[] }>('/bootstrap')
    const list: Profile[] = json.profiles ?? []
    setProfiles(list)
    setActiveProfileIdState(prev => {
      if (prev && list.some(p => p.id === prev)) return prev
      let stored: string | null = null
      try { stored = localStorage.getItem(STORAGE_KEY) } catch {}
      if (stored && list.some(p => p.id === stored)) return stored
      return list.find(p => p.is_default)?.id ?? list[0]?.id ?? null
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function setActiveProfileId(id: string) {
    setActiveProfileIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
  }

  async function createProfile(name: string) {
    const res = await api('/profiles', { method: 'POST', body: JSON.stringify({ name }) })
    const json = await res.json()
    if (!res.ok) return { error: json.error ?? 'Error al crear el perfil' }
    await load(true)
    setActiveProfileId(json.profile.id)
    return { profile: json.profile as Profile }
  }

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null

  return (
    <ProfileContext.Provider value={{ profiles, activeProfileId, activeProfile, loading, setActiveProfileId, createProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfiles() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles debe usarse dentro de <ProfileProvider>')
  return ctx
}
