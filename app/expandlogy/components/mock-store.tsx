'use client'

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { INITIAL_CLIENTS, TEAM_MEMBERS, daysFromNow } from '../mock-data'
import type { TeamMember } from '../mock-data'
import type { Client } from '../types'

interface NewClientInput {
  name: string
  info: string
}

type ClientUpdate = Partial<Pick<Client, 'name' | 'info' | 'status' | 'serviceEndsAt'>>

interface MockStore {
  clients: Client[]
  getClient: (id: string) => Client | undefined
  addClient: (input: NewClientInput) => Client
  updateClient: (id: string, updates: ClientUpdate) => void
  accessByClient: Record<string, TeamMember[]>
  grantAccess: (clientId: string, member: TeamMember) => void
  revokeAccess: (clientId: string, member: TeamMember) => void
}

const MockStoreContext = createContext<MockStore | null>(null)

export function MockDataProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS)
  const [accessByClient, setAccessByClient] = useState<Record<string, TeamMember[]>>(
    () => Object.fromEntries(INITIAL_CLIENTS.map(c => [c.id, [...TEAM_MEMBERS]]))
  )

  const getClient = useCallback((id: string) => clients.find(c => c.id === id), [clients])

  const addClient = useCallback((input: NewClientInput) => {
    const client: Client = {
      id: crypto.randomUUID(),
      name: input.name,
      info: input.info,
      status: 'onboarding',
      serviceEndsAt: daysFromNow(30),
    }
    setClients(prev => [...prev, client])
    setAccessByClient(prev => ({ ...prev, [client.id]: [...TEAM_MEMBERS] }))
    return client
  }, [])

  const updateClient = useCallback((id: string, updates: ClientUpdate) => {
    setClients(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)))
  }, [])

  const grantAccess = useCallback((clientId: string, member: TeamMember) => {
    setAccessByClient(prev => ({
      ...prev,
      [clientId]: prev[clientId]?.includes(member) ? prev[clientId] : [...(prev[clientId] ?? []), member],
    }))
  }, [])

  const revokeAccess = useCallback((clientId: string, member: TeamMember) => {
    setAccessByClient(prev => ({ ...prev, [clientId]: (prev[clientId] ?? []).filter(m => m !== member) }))
  }, [])

  const value = useMemo<MockStore>(() => ({
    clients, getClient, addClient, updateClient, accessByClient, grantAccess, revokeAccess,
  }), [clients, getClient, addClient, updateClient, accessByClient, grantAccess, revokeAccess])

  return <MockStoreContext.Provider value={value}>{children}</MockStoreContext.Provider>
}

export function useMockStore() {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error('useMockStore debe usarse dentro de <MockDataProvider>')
  return ctx
}
