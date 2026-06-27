'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import Sidebar from './sidebar'
import PresetsPanel from './presets-panel'

interface PresetInfo {
  id: string
  name: string
  system_prompt: string
  is_default: boolean
  is_global: boolean
  user_id: string | null
}

interface UsageData {
  spent: number
  limit: number
  percentage: number
  isUnlimited: boolean
}

interface ShellContextValue {
  selectedPreset: PresetInfo | null
  setSelectedPreset: (preset: PresetInfo | null) => void
  usage: UsageData | null
  refreshUsage: () => void
}

const ShellContext = createContext<ShellContextValue>({
  selectedPreset: null,
  setSelectedPreset: () => {},
  usage: null,
  refreshUsage: () => {},
})

export function usePreset() {
  return useContext(ShellContext)
}

export function useUsage() {
  const { usage, refreshUsage } = useContext(ShellContext)
  return { usage, refreshUsage }
}

interface ShellProps {
  userId: string
  children: React.ReactNode
}

export default function Shell({ userId, children }: ShellProps) {
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetInfo | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [defaultLoaded, setDefaultLoaded] = useState(false)

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/acero-ia/usage')
      if (res.ok) {
        const data = await res.json()
        setUsage({
          spent: data.spent,
          limit: data.limit,
          percentage: data.percentage,
          isUnlimited: data.isUnlimited,
        })
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (defaultLoaded) return
    setDefaultLoaded(true)

    fetch('/api/acero-ia/presets')
      .then(res => res.ok ? res.json() : [])
      .then((presets: PresetInfo[]) => {
        const defaultPreset = presets.find(p => p.is_default && !p.is_global)
          || presets.find(p => p.is_default)
        if (defaultPreset) setSelectedPreset(defaultPreset)
      })
      .catch(() => {})

    fetchUsage()
  }, [defaultLoaded, fetchUsage])

  const handleSelectPreset = useCallback((preset: PresetInfo | null) => {
    setSelectedPreset(preset)
    setPresetsOpen(false)
  }, [])

  return (
    <ShellContext.Provider value={{ selectedPreset, setSelectedPreset, usage, refreshUsage: fetchUsage }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar userId={userId} onOpenPresets={() => setPresetsOpen(true)} />
        <main className="flex-1 flex flex-col min-w-0 h-screen">
          {children}
        </main>
      </div>
      <PresetsPanel
        isOpen={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onSelect={handleSelectPreset}
        selectedPresetId={selectedPreset?.id}
      />
    </ShellContext.Provider>
  )
}
