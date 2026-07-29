'use client'

import { useEffect } from 'react'

export function BottomSheet({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]" />
      <div
        className="relative w-full sm:max-w-lg bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-zinc-800 border-b-0 sm:border-b rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-slate-300/30 dark:shadow-black max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-slate-100 dark:border-zinc-800">
          <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 flex items-center justify-center text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

export const inputCls = 'w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none accent-input transition-colors min-h-[48px]'
export const textareaCls = `${inputCls} resize-none`
export const labelCls = 'block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2'

const URL_RE = /(https?:\/\/[^\s]+)/g

// Convierte URLs sueltas dentro de texto plano en links clicables, sin tocar
// el resto del texto ni requerir un parser de markdown completo.
export function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="accent-txt underline underline-offset-2 hover:opacity-80 break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}
