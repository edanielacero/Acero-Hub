'use client'

import { useState, useEffect, useCallback } from 'react'

interface Preset {
  id: string
  name: string
  system_prompt: string
  is_default: boolean
  is_global: boolean
  user_id: string | null
}

interface PresetsPanelProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (preset: Preset | null) => void
  selectedPresetId?: string | null
}

export default function PresetsPanel({ isOpen, onClose, onSelect, selectedPresetId }: PresetsPanelProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formDefault, setFormDefault] = useState(false)

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch('/api/acero-ia/presets')
      if (res.ok) setPresets(await res.json())
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchPresets()
  }, [isOpen, fetchPresets])

  const resetForm = () => {
    setFormName('')
    setFormPrompt('')
    setFormDefault(false)
    setIsCreating(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formPrompt.trim()) return

    if (editingId) {
      const res = await fetch(`/api/acero-ia/presets/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, systemPrompt: formPrompt, isDefault: formDefault }),
      })
      if (res.ok) {
        const updated = await res.json()
        setPresets(prev => prev.map(p => p.id === editingId ? updated : (formDefault ? { ...p, is_default: false } : p)))
      }
    } else {
      const res = await fetch('/api/acero-ia/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, systemPrompt: formPrompt, isDefault: formDefault }),
      })
      if (res.ok) {
        const created = await res.json()
        setPresets(prev => formDefault ? [...prev.map(p => ({ ...p, is_default: false })), created] : [...prev, created])
      }
    }
    resetForm()
  }

  const handleEdit = (preset: Preset) => {
    setEditingId(preset.id)
    setFormName(preset.name)
    setFormPrompt(preset.system_prompt)
    setFormDefault(preset.is_default)
    setIsCreating(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este preset?')) return
    const res = await fetch(`/api/acero-ia/presets/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setPresets(prev => prev.filter(p => p.id !== id))
      if (selectedPresetId === id) onSelect(null)
    }
  }

  const handleToggleDefault = async (preset: Preset) => {
    const newDefault = !preset.is_default
    const res = await fetch(`/api/acero-ia/presets/${preset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: newDefault }),
    })
    if (res.ok) {
      setPresets(prev => prev.map(p => {
        if (p.id === preset.id) return { ...p, is_default: newDefault }
        if (newDefault) return { ...p, is_default: false }
        return p
      }))
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col"
        style={{
          backgroundColor: 'var(--aia-bg-surface)',
          borderLeft: '1px solid var(--aia-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
          <h2
            className="text-[15px] font-semibold"
            style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-primary)' }}
          >
            Presets
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded cursor-pointer transition-colors duration-200"
            style={{ color: 'var(--aia-text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isCreating ? (
            <div className="space-y-3">
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Nombre del preset"
                className="w-full px-3 py-2 rounded-lg text-[13px] bg-transparent outline-none"
                style={{ border: '1px solid var(--aia-border)', color: 'var(--aia-text-primary)' }}
                autoFocus
              />
              <textarea
                value={formPrompt}
                onChange={e => setFormPrompt(e.target.value)}
                placeholder="System prompt..."
                rows={6}
                className="w-full px-3 py-2 rounded-lg text-[13px] bg-transparent outline-none resize-none"
                style={{ border: '1px solid var(--aia-border)', color: 'var(--aia-text-primary)' }}
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formDefault}
                  onChange={e => setFormDefault(e.target.checked)}
                  className="accent-[#e5a000]"
                />
                <span className="text-[12px]" style={{ color: 'var(--aia-text-secondary)' }}>
                  Usar como default en nuevas conversaciones
                </span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!formName.trim() || !formPrompt.trim()}
                  className="flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-opacity duration-200"
                  style={{
                    backgroundColor: 'var(--aia-amber)',
                    color: '#08090a',
                    opacity: formName.trim() && formPrompt.trim() ? 1 : 0.4,
                  }}
                >
                  {editingId ? 'Guardar cambios' : 'Crear preset'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg text-[12px] cursor-pointer"
                  style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-colors duration-200 mb-3"
                style={{ border: '1px solid var(--aia-border)', color: 'var(--aia-text-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Crear preset
              </button>

              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)' }} />
                  ))}
                </div>
              ) : presets.length === 0 ? (
                <p className="text-[12px] mt-4 text-center" style={{ color: 'var(--aia-text-muted)' }}>
                  No tienes presets aún
                </p>
              ) : (
                <div className="space-y-1.5">
                  {/* Option to clear preset */}
                  <div
                    onClick={() => onSelect(null)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200"
                    style={{
                      backgroundColor: !selectedPresetId ? 'var(--aia-bg-hover)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (selectedPresetId) e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)' }}
                    onMouseLeave={e => { if (selectedPresetId) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span className="text-[13px]" style={{ color: 'var(--aia-text-secondary)' }}>
                      Sin preset
                    </span>
                  </div>

                  {presets.map(preset => (
                    <div
                      key={preset.id}
                      className="group flex items-start justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-200"
                      style={{
                        backgroundColor: selectedPresetId === preset.id ? 'var(--aia-bg-hover)' : 'transparent',
                      }}
                      onClick={() => onSelect(preset)}
                      onMouseEnter={e => { if (selectedPresetId !== preset.id) e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)' }}
                      onMouseLeave={e => { if (selectedPresetId !== preset.id) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium truncate" style={{ color: 'var(--aia-text-primary)' }}>
                            {preset.name}
                          </span>
                          {preset.is_global && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-muted)' }}>
                              Global
                            </span>
                          )}
                          {preset.is_default && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-amber)' }}>
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--aia-text-muted)' }}>
                          {preset.system_prompt.slice(0, 80)}...
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleDefault(preset) }}
                          className="p-1 rounded cursor-pointer"
                          style={{ color: preset.is_default ? 'var(--aia-amber)' : 'var(--aia-text-muted)' }}
                          title={preset.is_default ? 'Quitar como default' : 'Marcar como default'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={preset.is_default ? 'var(--aia-amber)' : 'none'} stroke="currentColor" strokeWidth="1.5">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>
                        {!preset.is_global && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); handleEdit(preset) }}
                              className="p-1 rounded cursor-pointer"
                              style={{ color: 'var(--aia-text-muted)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(preset.id) }}
                              className="p-1 rounded cursor-pointer"
                              style={{ color: 'var(--aia-text-muted)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
