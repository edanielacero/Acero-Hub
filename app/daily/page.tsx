'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'

type Category = 'EDIT' | 'MU_CREATED'

interface FileEntry { id: string; name: string }
interface Bullet { id: string; text: string }
interface PendingBatch { files: string[] }

let _uid = 0
function uid() { return String(++_uid) }
function makeBullet(text: string): Bullet { return { id: uid(), text } }
function makeEntry(name: string): FileEntry { return { id: uid(), name } }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function todayLabel(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const month = MONTHS[d.getMonth()]
  const yyyy = String(d.getFullYear())
  return `${dd}, ${month}, ${yyyy}`
}

function generateReport(
  edits: FileEntry[],
  muCreated: FileEntry[],
  tomorrowBullets: Bullet[],
  blockerBullets: Bullet[]
): string {
  const isFriday = new Date().getDay() === 5
  const tomorrowLabel = isFriday ? 'Monday' : 'Tomorrow'
  const lines: string[] = []

  lines.push('What I Did Today:')
  lines.push('')

  const didLines: string[] = []
  if (edits.length > 0) {
    didLines.push('EDITS')
    edits.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (muCreated.length > 0) {
    if (didLines.length > 0) didLines.push('')
    didLines.push('MU CREATED')
    muCreated.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (didLines.length > 0) {
    lines.push(...didLines)
    lines.push('')
  }

  lines.push(`What I'll do ${tomorrowLabel}:`)
  tomorrowBullets.filter(b => b.text.trim()).forEach(b => lines.push(`\t• ${b.text}`))
  lines.push('')

  lines.push('Blockers/Issues:')
  blockerBullets.filter(b => b.text.trim()).forEach(b => lines.push(`\t• ${b.text}`))

  return lines.join('\n')
}

function BulletSection({ label, bullets, onUpdate, onRemove, onAdd }: {
  label: string
  bullets: Bullet[]
  onUpdate: (id: string, text: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] font-bold text-[#555] tracking-wide">{label}</p>
      <div className="flex flex-col gap-1.5">
        {bullets.map(b => (
          <div key={b.id} className="daily-in flex items-center gap-2">
            <span className="text-[#2a2a2a] text-sm shrink-0 select-none">•</span>
            <input
              type="text" value={b.text} onChange={e => onUpdate(b.id, e.target.value)}
              className="flex-1 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-3 py-2 text-sm text-[#ccc] placeholder-[#252525] outline-none focus:border-[#2e2e2e] transition-colors"
              placeholder="Escribe aquí..."
            />
            <button onClick={() => onRemove(b.id)} className="text-[#282828] hover:text-[#666] transition-colors cursor-pointer shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button onClick={onAdd} className="self-start flex items-center gap-1.5 text-[11px] text-[#2a2a2a] hover:text-[#666] transition-colors cursor-pointer px-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add item
      </button>
    </div>
  )
}

// Compact view rendered inside the Document PiP window via React portal
function DailyPipView({
  edits,
  muCreated,
  removingFileIds,
  onRemoveEdit,
  onRemoveMu,
  pendingBatch,
  onFilesDropped,
  onConfirmCategory,
  onCancelBatch,
  onCopy,
  copied,
  minimized,
  onMinimize,
  onRestore,
}: {
  edits: FileEntry[]
  muCreated: FileEntry[]
  removingFileIds: Set<string>
  onRemoveEdit: (id: string) => void
  onRemoveMu: (id: string) => void
  pendingBatch: PendingBatch | null
  onFilesDropped: (files: FileList) => void
  onConfirmCategory: (cat: Category) => void
  onCancelBatch: () => void
  onCopy: () => void
  copied: boolean
  minimized: boolean
  onMinimize: () => void
  onRestore: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  const hasFiles = edits.length > 0 || muCreated.length > 0

  // Minimized pill — accepts drag and auto-expands on drop
  if (minimized) {
    return (
      <div
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          onFilesDropped(e.dataTransfer.files)
          onRestore()
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
        }}
        className="h-screen flex items-center px-3 gap-2 select-none overflow-hidden"
        style={isDragging
          ? { backgroundColor: '#0c1a35', boxShadow: 'inset 0 0 0 1.5px #60a5fa, 0 0 14px rgba(96,165,250,0.2)', transition: 'background-color 0.15s, box-shadow 0.15s' }
          : { backgroundColor: '#0d0d0d', transition: 'background-color 0.15s, box-shadow 0.15s' }
        }
      >
        {isDragging ? (
          /* Drag-receiving state: animated icon + label */
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#60a5fa] shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[11px] font-black text-[#93c5fd] tracking-wide shrink-0">Suelta aquí</span>
          </>
        ) : (
          /* Normal minimized state */
          <>
            <span className="text-[11px] font-black text-[#555] tracking-wide shrink-0">Daily</span>
            {hasFiles && (
              <div className="flex items-center gap-1 text-[10px] text-[#333] font-mono shrink-0">
                {edits.length > 0 && <span>{edits.length}E</span>}
                {edits.length > 0 && muCreated.length > 0 && <span className="text-[#222]">·</span>}
                {muCreated.length > 0 && <span>{muCreated.length}M</span>}
              </div>
            )}
          </>
        )}
        <button
          onClick={onRestore}
          className="ml-auto text-[#444] hover:text-[#888] border border-[#222] hover:border-[#333] bg-[#141414] hover:bg-[#1a1a1a] rounded-md px-2 py-1 transition-all cursor-pointer shrink-0"
          title="Restaurar"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#080808] flex flex-col p-4 gap-3 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#2a2a2a]">Daily</span>
        <button
          onClick={onMinimize}
          className="flex items-center gap-1.5 text-[10px] text-[#444] hover:text-[#888] border border-[#1e1e1e] hover:border-[#2e2e2e] bg-[#0f0f0f] hover:bg-[#141414] rounded-md px-2 py-1 transition-all cursor-pointer shrink-0"
          title="Minimizar"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
          </svg>
          <span>Min</span>
        </button>
      </div>

      {/* Drop zone — smaller when files exist, full when empty */}
      <div
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          onFilesDropped(e.dataTransfer.files)
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
        }}
        className={`shrink-0 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all duration-200 select-none ${
          hasFiles ? 'h-20' : 'flex-1'
        } ${isDragging ? 'border-[#444] bg-[#111]' : 'border-[#1e1e1e] bg-[#0d0d0d]'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-colors duration-200 ${isDragging ? 'text-[#666]' : 'text-[#252525]'}`}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className={`text-[11px] font-medium transition-colors duration-200 ${isDragging ? 'text-[#999]' : 'text-[#333]'}`}>
          {isDragging ? 'Suelta aquí' : 'Arrastra archivos'}
        </p>
      </div>

      {/* File list with delete buttons — only when files exist */}
      {hasFiles && (
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-2.5">
          {edits.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#333] shrink-0 mb-1">Edits</p>
              {edits.map(f => (
                <div key={f.id} className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} flex items-center gap-1.5`}>
                  <span className="flex-1 text-[11px] text-[#555] font-mono truncate">• {f.name}</span>
                  <button onClick={() => onRemoveEdit(f.id)} className="text-[#2a2a2a] hover:text-[#777] transition-colors cursor-pointer shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {muCreated.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#333] shrink-0 mb-1">MU Created</p>
              {muCreated.map(f => (
                <div key={f.id} className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} flex items-center gap-1.5`}>
                  <span className="flex-1 text-[11px] text-[#555] font-mono truncate">• {f.name}</span>
                  <button onClick={() => onRemoveMu(f.id)} className="text-[#2a2a2a] hover:text-[#777] transition-colors cursor-pointer shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Copy */}
      <button
        onClick={onCopy}
        className={`shrink-0 w-full py-3 rounded-xl font-black text-sm tracking-wide transition-all duration-300 cursor-pointer ${
          copied
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-[#f0f0f0] text-[#0a0a0a] hover:bg-white active:scale-[0.99]'
        }`}
      >
        {copied ? '✓  Copiado' : 'Copy Daily'}
      </button>

      {/* Category modal — fixed inside the PiP window's viewport */}
      {pendingBatch && (
        <div
          className="daily-overlay fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4"
          onClick={onCancelBatch}
        >
          <div
            className="daily-modal bg-[#111] border border-[#1e1e1e] rounded-2xl p-5 w-full flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3a3a3a]">
                {pendingBatch.files.length} archivo{pendingBatch.files.length !== 1 ? 's' : ''}
              </p>
              <h2 className="text-base font-black text-[#f0f0f0]">¿Qué tipo?</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => onConfirmCategory('EDIT')}
                className="w-full py-3 rounded-xl bg-[#161616] border border-[#222] hover:border-[#333] hover:bg-[#1a1a1a] active:scale-[0.99] transition-all cursor-pointer text-left px-3"
              >
                <span className="text-sm font-black text-[#d0d0d0]">EDIT</span>
              </button>
              <button
                onClick={() => onConfirmCategory('MU_CREATED')}
                className="w-full py-3 rounded-xl bg-[#161616] border border-[#222] hover:border-[#333] hover:bg-[#1a1a1a] active:scale-[0.99] transition-all cursor-pointer text-left px-3"
              >
                <span className="text-sm font-black text-[#d0d0d0]">MU CREATED</span>
              </button>
            </div>
            <button onClick={onCancelBatch} className="text-xs text-[#2a2a2a] hover:text-[#666] transition-colors cursor-pointer text-center">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function copyStylesToWindow(target: Window) {
  // Extract all CSS rules from every loaded stylesheet (catches Turbopack/HMR injected styles)
  const allCss: string[] = []
  ;[...document.styleSheets].forEach(sheet => {
    try {
      ;[...sheet.cssRules].forEach(rule => allCss.push(rule.cssText))
    } catch {
      // Cross-origin sheet — copy as <link> instead
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  })
  if (allCss.length) {
    const style = target.document.createElement('style')
    style.textContent = allCss.join('\n')
    target.document.head.appendChild(style)
  }
  // Dark background immediately to prevent white flash before styles parse
  target.document.documentElement.style.cssText = 'background:#080808'
  target.document.body.style.cssText = 'background:#080808;margin:0;height:100%'
}

const STORAGE_KEY = 'daily_files'

export default function DailyPage() {
  const [edits, setEdits] = useState<FileEntry[]>([])
  const [muCreated, setMuCreated] = useState<FileEntry[]>([])
  const [removingFileIds, setRemovingFileIds] = useState<Set<string>>(new Set())
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | null>(null)
  const [pendingBatchSource, setPendingBatchSource] = useState<'main' | 'pip'>('main')
  const [isDragging, setIsDragging] = useState(false)
  const [tomorrowBullets, setTomorrowBullets] = useState<Bullet[]>(() => [
    makeBullet('Keep working on pending tasks'),
    makeBullet('Meeting'),
  ])
  const [blockerBullets, setBlockerBullets] = useState<Bullet[]>(() => [
    makeBullet('None'),
  ])
  const [copied, setCopied] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [pipContainer, setPipContainer] = useState<Element | null>(null)
  const [pipMinimized, setPipMinimized] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLoad = useRef(false)
  const pipWindowRef = useRef<Window | null>(null)

  const isFriday = new Date().getDay() === 5

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.edits)) setEdits(parsed.edits)
        if (Array.isArray(parsed.muCreated)) setMuCreated(parsed.muCreated)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ edits, muCreated }))
    } catch {}
  }, [edits, muCreated])

  // Close PiP window on unmount
  useEffect(() => {
    return () => { pipWindowRef.current?.close() }
  }, [])

  const reportText = useMemo(
    () => generateReport(edits, muCreated, tomorrowBullets, blockerBullets),
    [edits, muCreated, tomorrowBullets, blockerBullets]
  )

  const handleFiles = useCallback((files: FileList | File[], source: 'main' | 'pip' = 'main') => {
    const names = Array.from(files).map(f => f.name)
    if (names.length === 0) return
    setPendingBatch({ files: names })
    setPendingBatchSource(source)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files, 'main')
  }, [handleFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files, 'main')
    e.target.value = ''
  }

  const confirmCategory = (category: Category) => {
    if (!pendingBatch) return
    const entries = pendingBatch.files.map(makeEntry)
    if (category === 'EDIT') {
      setEdits(prev => [...prev, ...entries])
    } else {
      setMuCreated(prev => [...prev, ...entries])
    }
    setPendingBatch(null)
  }

  const removeFileWithAnimation = (id: string, setter: React.Dispatch<React.SetStateAction<FileEntry[]>>) => {
    setRemovingFileIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setter(prev => prev.filter(f => f.id !== id))
      setRemovingFileIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 150)
  }

  const removeEdit = (id: string) => removeFileWithAnimation(id, setEdits)
  const removeMu = (id: string) => removeFileWithAnimation(id, setMuCreated)

  const handleClear = () => {
    setEdits([])
    setMuCreated([])
    setRemovingFileIds(new Set())
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      const el = document.createElement('textarea')
      el.value = reportText
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [reportText])

  const openPip = async () => {
    if (pipActive) {
      pipWindowRef.current?.close()
      return
    }
    if (!('documentPictureInPicture' in window)) return
    try {
      const pipWin = await (window as any).documentPictureInPicture.requestWindow({
        width: 180,
        height: 52,
      })
      copyStylesToWindow(pipWin)
      const container = pipWin.document.createElement('div')
      pipWin.document.body.appendChild(container)
      pipWindowRef.current = pipWin
      setPipMinimized(true)
      setPipActive(true)
      setPipContainer(container)
      pipWin.addEventListener('pagehide', () => {
        setPipActive(false)
        setPipContainer(null)
        setPipMinimized(false)
        pipWindowRef.current = null
      })
    } catch {}
  }

  const minimizePip = () => {
    pipWindowRef.current?.resizeTo(180, 52)
    setPipMinimized(true)
  }

  const restorePip = () => {
    pipWindowRef.current?.resizeTo(260, 340)
    setPipMinimized(false)
  }

  const updateTomorrow = (id: string, text: string) =>
    setTomorrowBullets(prev => prev.map(b => b.id === id ? { ...b, text } : b))
  const removeTomorrow = (id: string) =>
    setTomorrowBullets(prev => prev.filter(b => b.id !== id))
  const addTomorrow = () =>
    setTomorrowBullets(prev => [...prev, makeBullet('')])

  const updateBlocker = (id: string, text: string) =>
    setBlockerBullets(prev => prev.map(b => b.id === id ? { ...b, text } : b))
  const removeBlocker = (id: string) =>
    setBlockerBullets(prev => prev.filter(b => b.id !== id))
  const addBlocker = () =>
    setBlockerBullets(prev => [...prev, makeBullet('')])

  const hasFiles = edits.length > 0 || muCreated.length > 0

  return (
    <div className="min-h-screen bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-[#3a3a3a]">Acero Hub</p>
            <h1 className="text-3xl font-black tracking-tight text-[#f0f0f0]">Daily</h1>
            <p className="text-sm text-[#3a3a3a]">Genera tu reporte de actividad diaria</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            {hasFiles && (
              <button
                onClick={handleClear}
                className="text-[11px] font-semibold text-[#666] hover:text-red-400 border border-[#222] hover:border-red-500/30 bg-[#0f0f0f] hover:bg-red-500/5 rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
              >
                Limpiar
              </button>
            )}
            {/* Picture-in-Picture toggle */}
            <button
              onClick={openPip}
              title={pipActive ? 'Cerrar ventana flotante' : 'Abrir ventana flotante'}
              className={`p-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                pipActive
                  ? 'text-[#ccc] border-[#333] bg-[#1a1a1a]'
                  : 'text-[#444] border-[#1e1e1e] bg-[#0d0d0d] hover:text-[#888] hover:border-[#2a2a2a] hover:bg-[#111]'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 sm:py-14 px-8 transition-all duration-200 select-none ${
            isDragging
              ? 'border-[#444] bg-[#111]'
              : 'border-[#1e1e1e] bg-[#0d0d0d] hover:border-[#2a2a2a] hover:bg-[#101010]'
          }`}
        >
          <svg
            width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-colors duration-200 ${isDragging ? 'text-[#666]' : 'text-[#252525]'}`}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="text-center flex flex-col gap-1">
            <p className={`text-sm font-medium transition-colors duration-200 ${isDragging ? 'text-[#aaa]' : 'text-[#3a3a3a]'}`}>
              {isDragging ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz clic para seleccionar'}
            </p>
            <p className="text-xs text-[#222]">Cualquier tipo · Múltiples a la vez</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleInputChange}
          />
        </div>

        {/* File lists or empty state */}
        {hasFiles ? (
          <div className="flex flex-col gap-6">
            {edits.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#444]">EDITS</p>
                  <span className="text-[10px] text-[#252525] tabular-nums">{edits.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {edits.map(f => (
                    <div
                      key={f.id}
                      className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} flex items-center gap-3 bg-[#0d0d0d] border border-[#191919] rounded-xl px-4 py-2.5 hover:border-[#222] transition-colors`}
                    >
                      <span className="flex-1 text-sm text-[#888] truncate font-mono">{f.name}</span>
                      <button onClick={() => removeEdit(f.id)} className="text-[#2e2e2e] hover:text-[#777] transition-colors cursor-pointer shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {muCreated.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#444]">MU CREATED</p>
                  <span className="text-[10px] text-[#252525] tabular-nums">{muCreated.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {muCreated.map(f => (
                    <div
                      key={f.id}
                      className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} flex items-center gap-3 bg-[#0d0d0d] border border-[#191919] rounded-xl px-4 py-2.5 hover:border-[#222] transition-colors`}
                    >
                      <span className="flex-1 text-sm text-[#888] truncate font-mono">{f.name}</span>
                      <button onClick={() => removeMu(f.id)} className="text-[#2e2e2e] hover:text-[#777] transition-colors cursor-pointer shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 py-6">
            <div className="w-9 h-9 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a] flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#252525]">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </div>
            <p className="text-xs text-[#252525] text-center">Los archivos subidos aparecerán aquí</p>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[#141414]" />

        {/* Editable sections */}
        <div className="flex flex-col gap-7">
          <BulletSection
            label={`What I'll do ${isFriday ? 'Monday' : 'Tomorrow'}:`}
            bullets={tomorrowBullets}
            onUpdate={updateTomorrow}
            onRemove={removeTomorrow}
            onAdd={addTomorrow}
          />
          <BulletSection
            label="Blockers/Issues:"
            bullets={blockerBullets}
            onUpdate={updateBlocker}
            onRemove={removeBlocker}
            onAdd={addBlocker}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-[#141414]" />

        {/* Text output + Copy */}
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-[#3a3a3a] font-mono px-1">{todayLabel()}</p>
          <pre className="text-sm text-[#555] font-mono bg-[#090909] border border-[#141414] rounded-2xl px-5 py-5 whitespace-pre overflow-x-auto leading-relaxed">{reportText}</pre>
          <button
            onClick={handleCopy}
            className={`w-full py-3.5 rounded-xl font-black text-sm tracking-wide transition-all duration-300 cursor-pointer ${
              copied
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-[#f0f0f0] text-[#0a0a0a] hover:bg-white active:scale-[0.99]'
            }`}
          >
            {copied ? '✓  Copiado' : 'Copy'}
          </button>
        </div>

      </div>

      {/* Category Modal (main page — only when drop happened here) */}
      {pendingBatch && pendingBatchSource === 'main' && (
        <div
          className="daily-overlay fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 px-4 pb-6 sm:pb-0"
          onClick={() => setPendingBatch(null)}
        >
          <div
            className="daily-modal bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3a3a3a]">
                {pendingBatch.files.length} archivo{pendingBatch.files.length !== 1 ? 's' : ''} seleccionado{pendingBatch.files.length !== 1 ? 's' : ''}
              </p>
              <h2 className="text-lg font-black text-[#f0f0f0]">¿Qué tipo de trabajo?</h2>
            </div>

            <div className="flex flex-col gap-1 bg-[#0d0d0d] rounded-xl px-4 py-3 border border-[#191919]">
              {pendingBatch.files.slice(0, 5).map((name, i) => (
                <p key={i} className="text-[11px] text-[#444] font-mono truncate">• {name}</p>
              ))}
              {pendingBatch.files.length > 5 && (
                <p className="text-[11px] text-[#2a2a2a] mt-0.5">+ {pendingBatch.files.length - 5} más</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmCategory('EDIT')}
                className="w-full py-3.5 rounded-xl bg-[#161616] border border-[#222] hover:border-[#333] hover:bg-[#1a1a1a] active:scale-[0.99] transition-all cursor-pointer text-left px-4 group"
              >
                <span className="block text-sm font-black text-[#d0d0d0] group-hover:text-[#f0f0f0] transition-colors">EDIT</span>
                <span className="block text-[11px] text-[#3a3a3a] mt-0.5">Archivo que ya existía · se estuvo trabajando</span>
              </button>
              <button
                onClick={() => confirmCategory('MU_CREATED')}
                className="w-full py-3.5 rounded-xl bg-[#161616] border border-[#222] hover:border-[#333] hover:bg-[#1a1a1a] active:scale-[0.99] transition-all cursor-pointer text-left px-4 group"
              >
                <span className="block text-sm font-black text-[#d0d0d0] group-hover:text-[#f0f0f0] transition-colors">MU CREATED</span>
                <span className="block text-[11px] text-[#3a3a3a] mt-0.5">Archivo nuevo · creado desde cero</span>
              </button>
            </div>

            <button
              onClick={() => setPendingBatch(null)}
              className="text-xs text-[#2a2a2a] hover:text-[#666] transition-colors cursor-pointer text-center py-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* PiP portal — renders DailyPipView into the floating window's document */}
      {pipContainer && createPortal(
        <DailyPipView
          edits={edits}
          muCreated={muCreated}
          removingFileIds={removingFileIds}
          onRemoveEdit={removeEdit}
          onRemoveMu={removeMu}
          pendingBatch={pendingBatchSource === 'pip' ? pendingBatch : null}
          onFilesDropped={files => handleFiles(files, 'pip')}
          onConfirmCategory={confirmCategory}
          onCancelBatch={() => setPendingBatch(null)}
          onCopy={handleCopy}
          copied={copied}
          minimized={pipMinimized}
          onMinimize={minimizePip}
          onRestore={restorePip}
        />,
        pipContainer
      )}
    </div>
  )
}
