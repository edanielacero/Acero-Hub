'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PRESET_VARIABLES } from '@/lib/trading/presets'

// ─── Types ─────────────────────────────────────────────────────────────────────

type VarType = 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'

export interface Variable {
  id: string
  key: string
  label: string
  type: VarType
  options: string[] | null
  is_preset: boolean
  is_required: boolean
  is_active: boolean
  sort_order: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<VarType, string> = {
  text:             'Texto',
  number:           'Número',
  select_single:    'Selección única',
  select_multiple:  'Selección múltiple',
  boolean:          'Sí / No',
}

const TYPE_OPTIONS: VarType[] = ['text', 'number', 'select_single', 'select_multiple', 'boolean']

// ─── Helpers ───────────────────────────────────────────────────────────────────

function api(path: string, opts?: RequestInit) {
  return fetch(`/api/trading-journal${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

function IconChevronUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  )
}

function IconChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function IconLock({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

// ─── Form Styles ───────────────────────────────────────────────────────────────

const inp = [
  'w-full bg-slate-50 dark:bg-zinc-900',
  'border border-slate-200 dark:border-zinc-700/60 rounded-xl',
  'px-4 py-3 text-[14px] text-slate-900 dark:text-white',
  'placeholder-slate-400 dark:placeholder-zinc-600',
  'outline-none accent-input transition-colors duration-150',
  'min-h-[48px]',
].join(' ')

const fieldLabel = 'block text-[11px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-[0.1em] mb-2'

// ─── Bottom Sheet ──────────────────────────────────────────────────────────────

function BottomSheet({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-[3px]" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-zinc-800 border-b-0 rounded-t-[32px] shadow-2xl shadow-slate-300/30 dark:shadow-black max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[3px] rounded-full bg-slate-200 dark:bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between px-6 py-3.5 shrink-0">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors duration-150 cursor-pointer">
            <IconX size={16} />
          </button>
        </div>
        <div className="h-px bg-slate-100 dark:bg-zinc-800 mx-6 shrink-0" />
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Options Editor ────────────────────────────────────────────────────────────

function OptionsEditor({ options, onChange }: {
  options: string[]
  onChange: (opts: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addOption = () => {
    const v = draft.trim()
    if (!v || options.includes(v)) return
    onChange([...options, v])
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
          <span className="flex-1 text-[13px] text-slate-800 dark:text-zinc-200">{opt}</span>
          <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150 cursor-pointer rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
            <IconX size={12} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
          placeholder="Nueva opción..." className={inp} />
        <button type="button" onClick={addOption} disabled={!draft.trim()}
          className="shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl accent-btn accent-btn-shadow transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          <IconPlus size={14} />
        </button>
      </div>
      {options.length === 0 && (
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center py-1">Agrega al menos una opción</p>
      )}
    </div>
  )
}

// ─── Variable Form ─────────────────────────────────────────────────────────────

function VariableForm({ initial, sessionId, onSave, onClose }: {
  initial?: Variable
  sessionId: string
  onSave: () => void
  onClose: () => void
}) {
  const isEdit = !!initial?.id
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<VarType>(initial?.type ?? 'text')
  const [options, setOptions] = useState<string[]>(initial?.options ?? [])
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const needsOptions = type === 'select_single' || type === 'select_multiple'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!label.trim()) { setErr('El nombre es obligatorio'); return }
    if (needsOptions && options.length === 0) { setErr('Agrega al menos una opción'); return }
    setSaving(true)
    let res: Response
    if (isEdit) {
      res = await api(`/sessions/${sessionId}/variables/${initial!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: label.trim(), options: needsOptions ? options : null, is_required: isRequired }),
      })
    } else {
      res = await api(`/sessions/${sessionId}/variables`, {
        method: 'POST',
        body: JSON.stringify({ label: label.trim(), type, options: needsOptions ? options : undefined, is_required: isRequired }),
      })
    }
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErr(data.error ?? 'Error al guardar')
      return
    }
    onSave()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className={fieldLabel}>Nombre *</label>
        <input className={inp} placeholder="Ej. Sesión de mercado, Razón de entrada..."
          value={label} onChange={e => setLabel(e.target.value)} autoFocus />
      </div>
      {!isEdit && (
        <div>
          <label className={fieldLabel}>Tipo de dato</label>
          <div className="grid grid-cols-1 gap-1.5">
            {TYPE_OPTIONS.map(t => (
              <button key={t} type="button" onClick={() => { setType(t); setOptions([]) }}
                className={`flex items-center justify-between px-4 min-h-[44px] rounded-xl text-[13px] font-medium border transition-all duration-150 cursor-pointer text-left ${
                  type === t
                    ? 'accent-selected border'
                    : 'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600'
                }`}>
                <span>{TYPE_LABELS[t]}</span>
                {type === t && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {needsOptions && (
        <div>
          <label className={fieldLabel}>Opciones</label>
          <OptionsEditor options={options} onChange={setOptions} />
        </div>
      )}
      <label className="flex items-center gap-3 cursor-pointer min-h-[44px] px-1">
        <div className="relative">
          <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} className="sr-only peer" />
          <div className={`w-11 h-6 rounded-full transition-colors duration-200 border ${isRequired ? 'accent-toggle-on' : 'bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700'}`} />
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${isRequired ? 'bg-white translate-x-5' : 'bg-slate-400 dark:bg-zinc-500'}`} />
        </div>
        <div>
          <p className="text-[13px] font-medium text-slate-700 dark:text-zinc-300">Obligatorio</p>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">Se pedirá siempre al registrar un trade</p>
        </div>
      </label>
      {err && <p className="text-[12px] text-red-500 dark:text-red-400 px-1">{err}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-colors duration-150 cursor-pointer">
          Cancelar
        </button>
        <button type="submit" disabled={!label.trim() || saving}
          className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed accent-btn accent-btn-shadow">
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear variable'}
        </button>
      </div>
    </form>
  )
}

// ─── Delete Confirm Sheet ──────────────────────────────────────────────────────

function DeleteSheet({ variable, onConfirm, onClose }: {
  variable: Variable
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet title="Eliminar variable" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/15">
          <p className="text-[14px] text-slate-600 dark:text-zinc-400 leading-relaxed">
            ¿Eliminar <span className="text-slate-900 dark:text-white font-bold">{variable.label}</span>?
            {' '}Se borrará este campo de todos los trades existentes.
            <span className="text-red-600 dark:text-red-400 font-semibold"> Esta acción no se puede deshacer.</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-colors duration-150 cursor-pointer">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 hover:border-red-300 dark:hover:border-red-500/40 transition-all duration-150 cursor-pointer">
            Eliminar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ─── Variable Row ──────────────────────────────────────────────────────────────

function VariableRow({ variable, index, total, onToggleActive, onEdit, onDelete, onMoveUp, onMoveDown }: {
  variable: Variable; index: number; total: number
  onToggleActive: () => void; onEdit: () => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-150 ${
      variable.is_active
        ? 'bg-white dark:bg-zinc-950 border-slate-100 dark:border-zinc-800/60 shadow-sm dark:shadow-none'
        : 'bg-slate-50/50 dark:bg-zinc-950/50 border-slate-100 dark:border-zinc-800/40 opacity-60'
    }`}>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={index === 0} aria-label="Subir"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer">
          <IconChevronUp size={12} />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} aria-label="Bajar"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer">
          <IconChevronDown size={12} />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{variable.label}</span>
          {variable.is_preset && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              <IconLock size={9} />Preset
            </span>
          )}
          {variable.is_required && (
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400">Requerido</span>
          )}
        </div>
        <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">{TYPE_LABELS[variable.type]}</span>
        {variable.options && variable.options.length > 0 && (
          <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5 truncate">
            {variable.options.slice(0, 4).join(' · ')}{variable.options.length > 4 ? ` +${variable.options.length - 4}` : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggleActive} aria-label={variable.is_active ? 'Desactivar' : 'Activar'}
          className="relative min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer">
          <div className={`w-9 h-5 rounded-full transition-colors duration-200 border ${variable.is_active ? 'accent-toggle-on' : 'bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700'}`} />
          <div className={`absolute w-[15px] h-[15px] rounded-full transition-all duration-200 ${variable.is_active ? 'bg-white translate-x-[9px]' : 'bg-slate-400 dark:bg-zinc-500 -translate-x-[3px]'}`} />
        </button>
        <button onClick={onEdit} aria-label="Editar"
          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors duration-150 cursor-pointer">
          <IconEdit size={14} />
        </button>
        <button onClick={onDelete} aria-label="Eliminar"
          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150 cursor-pointer">
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Add Preset Sheet ──────────────────────────────────────────────────────────

function AddPresetSheet({ preset, sessionId, onSave, onClose }: {
  preset: typeof PRESET_VARIABLES[number]
  sessionId: string
  onSave: () => void
  onClose: () => void
}) {
  const needsOptions = preset.type === 'select_single' || preset.type === 'select_multiple'
  const [options, setOptions] = useState<string[]>(preset.options ?? [])
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (needsOptions && options.length === 0) { setErr('Agrega al menos una opción'); return }
    setSaving(true)
    const res = await api(`/sessions/${sessionId}/variables`, {
      method: 'POST',
      body: JSON.stringify({ preset_key: preset.key, options: needsOptions ? options : undefined }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Error al guardar')
      return
    }
    onSave()
  }

  return (
    <BottomSheet title={`Agregar: ${preset.label}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{preset.label}</p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{preset.description}</p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-wider mt-1.5">
              {TYPE_LABELS[preset.type as VarType] ?? preset.type}
            </p>
          </div>
        </div>
        {needsOptions && (
          <div>
            <label className={fieldLabel}>Opciones {preset.key === 'instrument' && '(tus instrumentos)'}</label>
            <OptionsEditor options={options} onChange={setOptions} />
          </div>
        )}
        {err && <p className="text-[12px] text-red-500 dark:text-red-400 px-1">{err}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={saving || (needsOptions && options.length === 0)}
            className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold accent-btn accent-btn-shadow disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors">
            {saving ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}

// ─── Variables Content ─────────────────────────────────────────────────────────

export default function VariablesContent({ sessionId }: { sessionId: string }) {
  const [variables, setVariables] = useState<Variable[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editVar, setEditVar]       = useState<Variable | null>(null)
  const [deleteVar, setDeleteVar]   = useState<Variable | null>(null)
  const [addPreset, setAddPreset]   = useState<typeof PRESET_VARIABLES[number] | null>(null)
  const [reordering, setReordering] = useState(false)

  const load = useCallback(async () => {
    const res = await api(`/sessions/${sessionId}/variables`).then(r => r.json()).catch(() => ({ variables: [] }))
    setVariables(res.variables ?? [])
    setLoading(false)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const toggleActive = async (v: Variable) => {
    setVariables(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
    await api(`/sessions/${sessionId}/variables/${v.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !v.is_active }),
    })
  }

  const moveVar = async (index: number, direction: 'up' | 'down') => {
    const next = [...variables]
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
    setVariables(next)
    setReordering(true)
    await api(`/sessions/${sessionId}/variables/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds: next.map(v => v.id) }),
    })
    setReordering(false)
  }

  const deleteVariable = async (v: Variable) => {
    setDeleteVar(null)
    setVariables(prev => prev.filter(x => x.id !== v.id))
    await api(`/sessions/${sessionId}/variables/${v.id}`, { method: 'DELETE' })
  }

  const presets          = variables.filter(v => v.is_preset)
  const custom           = variables.filter(v => !v.is_preset)
  const activeCount      = variables.filter(v => v.is_active).length
  const addedKeys        = new Set(variables.map(v => v.key))
  const availablePresets = PRESET_VARIABLES.filter(p => !addedKeys.has(p.key))

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          {loading ? '' : variables.length === 0
            ? 'Sin variables configuradas'
            : `${activeCount} activa${activeCount !== 1 ? 's' : ''} · ${variables.length} total`}
        </p>
        {variables.length > 0 && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 min-h-[36px] rounded-xl text-[12px] font-bold accent-btn accent-btn-shadow transition-all duration-150 cursor-pointer">
            <IconPlus size={12} />
            Nueva
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0,1,2].map(i => (
            <div key={i} className="h-[72px] rounded-2xl bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {variables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 accent-tint accent-border-lo border">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="accent-txt">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </div>
              <p className="text-[15px] font-bold text-slate-700 dark:text-zinc-300 mb-2">Sin variables aún</p>
              <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-6 leading-relaxed max-w-[220px]">
                Las variables personalizan qué datos registras en cada trade
              </p>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 min-h-[44px] rounded-xl text-[13px] font-bold accent-btn accent-btn-shadow transition-all duration-150 cursor-pointer">
                <IconPlus size={13} />
                Agregar variable
              </button>
            </div>
          ) : (
            <>
              {presets.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-2 px-1">
                    Predefinidas · {presets.length}
                  </p>
                  <div className="flex flex-col gap-2">
                    {presets.map((v, i) => (
                      <VariableRow key={v.id} variable={v} index={i} total={presets.length}
                        onToggleActive={() => toggleActive(v)} onEdit={() => setEditVar(v)}
                        onDelete={() => setDeleteVar(v)}
                        onMoveUp={() => moveVar(variables.indexOf(v), 'up')}
                        onMoveDown={() => moveVar(variables.indexOf(v), 'down')} />
                    ))}
                  </div>
                </div>
              )}
              {custom.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-2 px-1">
                    Personalizadas · {custom.length}
                  </p>
                  <div className="flex flex-col gap-2">
                    {custom.map((v, i) => (
                      <VariableRow key={v.id} variable={v} index={i} total={custom.length}
                        onToggleActive={() => toggleActive(v)} onEdit={() => setEditVar(v)}
                        onDelete={() => setDeleteVar(v)}
                        onMoveUp={() => moveVar(variables.indexOf(v), 'up')}
                        onMoveDown={() => moveVar(variables.indexOf(v), 'down')} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {availablePresets.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-2 px-1">
                Predefinidas disponibles
              </p>
              <div className="flex flex-col gap-1.5">
                {availablePresets.map(p => (
                  <button key={p.key} onClick={() => setAddPreset(p)}
                    className="flex items-center justify-between px-4 min-h-[52px] rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-dashed border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-500 accent-row transition-all duration-150 cursor-pointer text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{p.label}</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">{p.description}</p>
                    </div>
                    <span className="text-[11px] accent-txt font-bold shrink-0 ml-3">+ Agregar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowCreate(true)}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-600 hover:text-slate-600 dark:hover:text-zinc-300 transition-all duration-150 cursor-pointer">
            <IconPlus size={14} />
            Agregar variable personalizada
          </button>

          {reordering && (
            <p className="text-center text-[11px] text-slate-500 dark:text-zinc-400 animate-pulse">Guardando orden...</p>
          )}
        </div>
      )}

      {/* Nested sheets */}
      {addPreset && (
        <AddPresetSheet preset={addPreset} sessionId={sessionId}
          onSave={() => { setAddPreset(null); load() }} onClose={() => setAddPreset(null)} />
      )}
      {showCreate && (
        <BottomSheet title="Nueva variable" onClose={() => setShowCreate(false)}>
          <VariableForm sessionId={sessionId}
            onSave={() => { setShowCreate(false); load() }} onClose={() => setShowCreate(false)} />
        </BottomSheet>
      )}
      {editVar && (
        <BottomSheet title="Editar variable" onClose={() => setEditVar(null)}>
          <VariableForm initial={editVar} sessionId={sessionId}
            onSave={() => { setEditVar(null); load() }} onClose={() => setEditVar(null)} />
        </BottomSheet>
      )}
      {deleteVar && (
        <DeleteSheet variable={deleteVar}
          onConfirm={() => deleteVariable(deleteVar)} onClose={() => setDeleteVar(null)} />
      )}
    </>
  )
}
