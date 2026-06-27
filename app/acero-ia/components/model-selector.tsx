'use client'

import { useState, useRef, useEffect } from 'react'

export type ModelMode = 'auto' | 'haiku' | 'sonnet' | 'opus' | 'image'

interface ModelSelectorProps {
  value: ModelMode
  onChange: (mode: ModelMode) => void
  disabled?: boolean
}

const OPTIONS: { value: ModelMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'image', label: 'Imagen' },
]

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = OPTIONS.find(o => o.value === value) ?? OPTIONS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className="h-8 px-3 rounded-lg flex-shrink-0 flex items-center gap-1.5 text-[11px] font-medium cursor-pointer transition-colors duration-200"
        style={{
          backgroundColor: 'var(--aia-bg-hover)',
          color: value === 'auto' ? 'var(--aia-text-secondary)' : 'var(--aia-amber)',
        }}
        disabled={disabled}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: value === 'auto' ? 'var(--aia-text-muted)' : 'var(--aia-amber)' }}
        />
        {current.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 w-36 rounded-xl py-1 shadow-lg z-50"
          style={{
            backgroundColor: 'var(--aia-bg-elevated)',
            border: '1px solid var(--aia-border)',
          }}
        >
          {OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] cursor-pointer transition-colors duration-200"
              style={{
                backgroundColor: value === option.value ? 'var(--aia-bg-hover)' : 'transparent',
                color: value === option.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
              }}
              onMouseEnter={e => {
                if (value !== option.value) e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)'
              }}
              onMouseLeave={e => {
                if (value !== option.value) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span className="font-medium">{option.label}</span>
              {value === option.value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="2.5" strokeLinecap="round" className="ml-auto">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
