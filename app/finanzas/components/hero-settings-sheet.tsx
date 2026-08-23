'use client'

import { useEffect } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import type { HeroMode } from './hero-pref'

const OPTIONS: { value: HeroMode; label: string; hint: string }[] = [
  { value: 'patrimonio', label: 'Patrimonio total', hint: 'Todo lo que tienes, sumado en dólares' },
  { value: 'presupuesto', label: 'Presupuesto total', hint: 'Cuánto llevas gastado de lo que te pusiste de tope' },
  { value: 'ambos', label: 'Los dos', hint: 'El card se desliza entre uno y otro' },
]

/** Qué dato manda en el card principal de la Home. */
export function HeroSettingsSheet({ mode, onChange, onClose }: {
  mode: HeroMode
  onChange: (m: HeroMode) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Qué mostrar arriba"
        className="fz-sheet relative w-full min-[900px]:w-[420px] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Qué mostrar arriba</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col gap-2" role="radiogroup" aria-label="Qué mostrar arriba">
          {OPTIONS.map(o => {
            const selected = mode === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => { onChange(o.value); onClose() }}
                className={`flex items-center gap-3 text-left p-3.5 rounded-[var(--fz-r-tile)] border transition-colors ${
                  selected
                    ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                    : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold ${selected ? 'text-[var(--fz-accent)]' : ''}`}>{o.label}</p>
                  <p className="text-[12px] text-[var(--fz-ink-3)]">{o.hint}</p>
                </div>
                {selected && <IconCheck size={18} stroke={2.4} className="text-[var(--fz-accent)] shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
