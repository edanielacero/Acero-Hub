'use client'

import { ReactNode } from 'react'

/* ─── Tintes de categoría ──────────────────────────────────────────────────
   Los 7 tintes se reparten de forma determinística por hash del nombre, así
   cada categoría conserva siempre el mismo color sin guardarlo en la base. */

export const TINTS = ['lavender', 'peach', 'mint', 'sky', 'rose', 'sand', 'slate'] as const
export type Tint = (typeof TINTS)[number]

export function tintFor(name: string): Tint {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]
}

export function tintVars(tint: Tint) {
  return {
    background: `var(--fz-tint-${tint})`,
    color: `var(--fz-tint-${tint}-fg)`,
  }
}

/* ─── Contenedores ─────────────────────────────────────────────────────────── */

export function Panel({ children, className = '', pad = true }: {
  children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <div
      className={`bg-[var(--fz-surface)] rounded-[var(--fz-r-card)] shadow-[var(--fz-sh-rest)] ${pad ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[19px] font-bold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  )
}

/* ─── Chip de ícono ────────────────────────────────────────────────────────
   El átomo visual que más se repite: cuadrado redondeado, fondo en tinte,
   glifo en el color saturado de ese tinte. */

export function IconChip({ children, tint = 'slate', size = 40 }: {
  children: ReactNode; tint?: Tint; size?: number
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center shrink-0 rounded-[var(--fz-r-chip)]"
      style={{ width: size, height: size, fontSize: size * 0.45, ...tintVars(tint) }}
    >
      {children}
    </span>
  )
}

/* ─── Botones ──────────────────────────────────────────────────────────────── */

type BtnProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'soft' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  disabled?: boolean
  full?: boolean
  className?: string
}

export function Btn({
  children, onClick, type = 'button', variant = 'primary',
  size = 'md', disabled, full, className = '',
}: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--fz-r-pill)] ' +
    'transition-[transform,background-color,opacity] duration-[120ms] active:scale-[0.97] ' +
    'disabled:opacity-40 disabled:pointer-events-none'
  const sizes = size === 'sm' ? 'h-9 px-3.5 text-[13px]' : 'h-12 px-5 text-[15px]'
  const variants: Record<string, string> = {
    primary: 'bg-[var(--fz-accent)] text-white hover:bg-[var(--fz-accent-press)]',
    soft: 'bg-[var(--fz-accent-tint)] text-[var(--fz-accent)] hover:brightness-[0.97]',
    ghost: 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]',
    danger: 'bg-[var(--fz-out-tint)] text-[var(--fz-out-text)] hover:brightness-[0.97]',
  }
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

/* ─── Campos ───────────────────────────────────────────────────────────────── */

export function Label({ children }: { children: ReactNode }) {
  return <span className="block text-[13px] font-medium text-[var(--fz-ink-2)] mb-1.5">{children}</span>
}

/**
 * 16px no es capricho: Safari en iOS hace zoom automático al enfocar cualquier
 * campo con font-size menor a 16px, y después no vuelve solo. Todo input,
 * select y textarea de la mini-app tiene que quedarse en 16 o más.
 */
const fieldClass =
  // `min-w-0`: un <select> se dimensiona por su opción más larga, y como hijo
  // directo de un grid (los filtros de Movimientos) estiraba la columna y con
  // ella la página entera.
  'w-full min-w-0 px-4 rounded-[var(--fz-r-field)] bg-[var(--fz-surface-sunk)] ' +
  'border border-[var(--fz-hairline)] text-[16px] font-medium text-[var(--fz-ink)] ' +
  'placeholder:text-[var(--fz-ink-3)] outline-none focus:border-[var(--fz-accent)]'

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} h-12 ${props.className ?? ''}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} py-3 leading-snug resize-y ${props.className ?? ''}`} />
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${fieldClass} h-12 appearance-none pr-9 ${props.className ?? ''}`}>
      {props.children}
    </select>
  )
}

/* ─── Control segmentado ───────────────────────────────────────────────────── */

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 p-1 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface-sunk)]">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 h-9 rounded-[var(--fz-r-pill)] text-[13px] font-semibold transition-colors ${
            value === o.value
              ? 'bg-[var(--fz-accent)] text-white'
              : 'text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Estado vacío ─────────────────────────────────────────────────────────── */

export function EmptyState({ emoji, title, description, action }: {
  emoji: string; title: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <div className="text-[32px] mb-3" aria-hidden>{emoji}</div>
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="text-[13px] text-[var(--fz-ink-2)] mt-1 max-w-[36ch]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ─── Aviso de error ───────────────────────────────────────────────────────── */

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="text-[13px] font-medium text-[var(--fz-out-text)] bg-[var(--fz-out-tint)] rounded-[var(--fz-r-field)] px-3.5 py-2.5">
      {children}
    </p>
  )
}

/* ─── Fecha legible ────────────────────────────────────────────────────────── */

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/** Convierte 'YYYY-MM-DD' a Date local — `new Date(iso)` lo interpretaría como UTC. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function monthName(monthIndex: number): string {
  return MESES[monthIndex]
}

export function formatDayLabel(iso: string, todayISO: string): string {
  if (iso === todayISO) return 'Hoy'
  const d = parseISO(iso)
  const yesterday = parseISO(todayISO)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.getTime() === yesterday.getTime()) return 'Ayer'
  return `${d.getDate()} de ${MESES[d.getMonth()]}`
}
