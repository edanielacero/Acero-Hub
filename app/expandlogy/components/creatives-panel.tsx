'use client'

import { useState } from 'react'
import { textareaCls } from './ui'

interface MockMedia {
  type: 'image' | 'video'
  label: string
}

// Prototipo: no hay integración real con Drive ni generación de imágenes —
// tanto el material "cargado" como los resultados son placeholders visuales.
const MOCK_MEDIA: MockMedia[] = [
  { type: 'image', label: 'antes-despues-1.jpg' },
  { type: 'image', label: 'equipo-trabajando.jpg' },
  { type: 'video', label: 'intro-servicios.mp4' },
  { type: 'image', label: 'fachada-terminada.jpg' },
  { type: 'image', label: 'detalle-acabado.jpg' },
  { type: 'video', label: 'testimonio-cliente.mp4' },
]

function MediaIcon({ type, className }: { type: MockMedia['type']; className?: string }) {
  if (type === 'video') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

export function CreativesPanel({ clientName }: { clientName: string }) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [hasResults, setHasResults] = useState(false)

  function handleGenerate() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setHasResults(false)
    setTimeout(() => {
      setGenerating(false)
      setHasResults(true)
    }, 900)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 mb-3">
          Material cargado de {clientName}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MOCK_MEDIA.map(m => (
            <div key={m.label} className="flex flex-col gap-2 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3">
              <div className="aspect-video rounded-lg bg-slate-200 dark:bg-zinc-800 flex items-center justify-center">
                <MediaIcon type={m.type} className="text-slate-400 dark:text-zinc-600" />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300">Generar nuevos anuncios con IA</p>
        <textarea
          rows={3}
          className={textareaCls}
          placeholder={`Ej: Anuncio de temporada para ${clientName}, estilo antes/después, tono profesional y cercano`}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="accent-btn accent-btn-shadow self-start h-11 px-5 rounded-xl font-bold text-[13px] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {generating ? 'Generando…' : 'Generar 4 anuncios'}
        </button>
      </div>

      {(generating || hasResults) && (
        <div>
          <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 mb-3">Resultado</p>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-2">
                <div
                  className={`aspect-square rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center justify-center ${
                    generating ? 'bg-slate-100 dark:bg-zinc-900 animate-pulse' : 'accent-tint-md'
                  }`}
                >
                  {!generating && <span className="accent-txt text-[11px] font-bold">✨ IA</span>}
                </div>
                {!generating && (
                  <button disabled className="text-[11px] text-slate-400 dark:text-zinc-600 cursor-not-allowed text-center py-1">
                    Descargar (prototipo)
                  </button>
                )}
              </div>
            ))}
          </div>
          {!generating && (
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-2">
              Vista previa — en la versión final se podrán descargar y quedan guardadas en el historial del cliente.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
