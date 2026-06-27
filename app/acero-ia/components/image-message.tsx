'use client'

import { useState } from 'react'

interface ImageMessageProps {
  imageUrl: string
  prompt: string
  size: string
  quality: string
  onVariation: () => void
  onEditPrompt: (prompt: string) => void
}

export default function ImageMessage({ imageUrl, prompt, size, quality, onVariation, onEditPrompt }: ImageMessageProps) {
  const [loaded, setLoaded] = useState(false)

  const handleDownload = async () => {
    const res = await fetch(imageUrl)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `acero-ia-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="my-2">
      <div className="relative inline-block" style={{ maxWidth: '512px' }}>
        {!loaded && (
          <div
            className="rounded-xl animate-pulse flex items-center justify-center"
            style={{
              backgroundColor: 'var(--aia-bg-hover)',
              width: size === '1024x1792' ? '300px' : '512px',
              height: size === '1792x1024' ? '300px' : size === '1024x1792' ? '512px' : '512px',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30 animate-spin" style={{ animationDuration: '3s' }}>
              <polygon points="12,2 20,8 17,18 7,18 4,8" />
              <line x1="12" y1="2" x2="17" y2="18" />
              <line x1="12" y1="2" x2="7" y2="18" />
              <line x1="4" y1="8" x2="20" y2="8" />
            </svg>
          </div>
        )}
        <img
          src={imageUrl}
          alt={prompt}
          className="rounded-xl w-full"
          style={{ display: loaded ? 'block' : 'none', maxWidth: '512px' }}
          onLoad={() => setLoaded(true)}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors duration-200"
          style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Descargar
        </button>
        <button
          onClick={onVariation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors duration-200"
          style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Variación
        </button>
        <button
          onClick={() => onEditPrompt(prompt)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors duration-200"
          style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Editar prompt
        </button>
      </div>
    </div>
  )
}
