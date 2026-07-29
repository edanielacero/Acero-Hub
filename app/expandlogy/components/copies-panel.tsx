'use client'

import { useState } from 'react'
import { textareaCls } from './ui'

type CopyType = 'titulos' | 'cta' | 'facebook' | 'google' | 'email'

const COPY_TYPES: { id: CopyType; label: string }[] = [
  { id: 'titulos', label: 'Títulos' },
  { id: 'cta', label: 'CTA' },
  { id: 'facebook', label: 'Facebook Ads' },
  { id: 'google', label: 'Google Ads' },
  { id: 'email', label: 'Email' },
]

// Prototipo: no hay generación real con IA — son variaciones hardcodeadas
// por tipo de copy, solo para mostrar cómo se vería el resultado.
function mockVariations(type: CopyType, clientName: string): string[] {
  switch (type) {
    case 'titulos':
      return [
        `${clientName}: calidad que se nota desde el primer día`,
        `Tu proyecto con ${clientName}, sin sorpresas`,
        `${clientName} — la opción de confianza en tu zona`,
      ]
    case 'cta':
      return ['Pedí tu cotización gratis', 'Reservá tu turno esta semana', 'Hablá con nosotros ahora']
    case 'facebook':
      return [
        `🏡 ¿Tu casa necesita un cambio? En ${clientName} transformamos espacios con resultados que se notan. Cotización gratis, sin compromiso. 👉 Escribinos hoy.`,
        `Antes de elegir a cualquiera, conocé el trabajo de ${clientName}. Presupuestos claros, tiempos reales, resultados que hablan solos. 📩 Contactanos.`,
      ]
    case 'google':
      return [
        `${clientName} | Presupuesto Gratis\nServicio profesional en tu zona. Contactanos hoy mismo.`,
        `${clientName} — Resultados Garantizados\nAtención personalizada. Pedí tu cotización sin cargo.`,
      ]
    case 'email':
      return [
        `Asunto: Tu proyecto con ${clientName} puede empezar esta semana\n\nHola,\n\nGracias por tu interés en nuestros servicios. Nos encantaría contarte cómo podemos ayudarte con tu próximo proyecto — sin compromiso y con un presupuesto claro desde el primer contacto.`,
      ]
  }
}

export function CopiesPanel({ clientName }: { clientName: string }) {
  const [type, setType] = useState<CopyType>('titulos')
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  function handleGenerate() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setResults(null)
    setTimeout(() => {
      setResults(mockVariations(type, clientName))
      setGenerating(false)
    }, 700)
  }

  async function handleCopy(text: string, i: number) {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(i)
    setTimeout(() => setCopiedIndex(prev => (prev === i ? null : prev)), 1500)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 mb-3">Tipo de copy</p>
        <div className="flex flex-wrap gap-2">
          {COPY_TYPES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setType(t.id); setResults(null) }}
              className={`px-3.5 py-2 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${
                type === t.id
                  ? 'accent-btn border-transparent'
                  : 'bg-transparent border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300">Instrucciones para la IA</p>
        <textarea
          rows={3}
          className={textareaCls}
          placeholder={`Ej: Copy para promoción de temporada de ${clientName}, tono cercano y directo`}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="accent-btn accent-btn-shadow self-start h-11 px-5 rounded-xl font-bold text-[13px] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {generating ? 'Generando…' : 'Generar copys'}
        </button>
      </div>

      {(generating || results) && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300">Resultado</p>
          {generating ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : (
            results!.map((text, i) => (
              <div key={i} className="flex items-start justify-between gap-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
                <p className="text-[13px] text-slate-700 dark:text-zinc-200 whitespace-pre-wrap flex-1">{text}</p>
                <button
                  onClick={() => handleCopy(text, i)}
                  className="shrink-0 text-[11px] font-semibold accent-txt hover:opacity-80 cursor-pointer"
                >
                  {copiedIndex === i ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
