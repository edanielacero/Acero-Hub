'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconDotsVertical, type TablerIcon } from '@tabler/icons-react'

/* ─── Tinte de chip ────────────────────────────────────────────────────────
   Tres valores y no siete: 'neutral' es el único que usan categoría, persona
   y navegación — el ícono de línea ya diferencia, así que el color no tiene
   que hacerlo también. 'in'/'out' son la excepción semántica: existen para
   los pocos lugares donde el chip mismo tiene que decir "entró plata" o
   "salió plata" (p. ej. el historial de una deuda cobrada). */

export type Tint = 'neutral' | 'in' | 'out'

export function tintVars(tint: Tint) {
  if (tint === 'in') return { background: 'var(--fz-in-tint)', color: 'var(--fz-in-text)' }
  if (tint === 'out') return { background: 'var(--fz-out-tint)', color: 'var(--fz-out-text)' }
  return { background: 'var(--fz-tint-neutral)', color: 'var(--fz-tint-neutral-fg)' }
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

export function IconChip({ children, tint = 'neutral', size = 40 }: {
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

/* ─── Avatar de persona ────────────────────────────────────────────────────
   Círculo, nunca squircle: es lo que separa "persona" de "categoría" de un
   vistazo, sin leer nada. Siempre neutro — el nombre ya va escrito al lado,
   así que un color distinto por persona no aporta nada y suma variedad de
   color que no hace falta (§15/§16.10 de contexto_ui_finanzas.md). */

export function PersonAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center shrink-0 rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42, ...tintVars('neutral') }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
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

/* ─── Filtro desplegable ───────────────────────────────────────────────────
   Un `<select>` pelado abre el picker nativo del sistema operativo — en iOS,
   una rueda que no tiene nada que ver con el resto de la app (feedback del
   usuario: "su propia UI, no un selector del sistema operativo"). Mismo
   patrón de popover que <RowMenu> (cierra solo, clic afuera o Escape), pero
   con el valor elegido a la vista en vez de un ⋮. */

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

export function DropdownField<T extends string>({ label, value, options, onChange, placeholder }: {
  /** Rótulo accesible del control — no se dibuja, es el `aria-label`. */
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (v: T) => void
  /** Qué mostrar cuando `value` no matchea ninguna opción (p. ej. "Todos"). */
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-12 min-w-0 px-3.5 rounded-[var(--fz-r-field)] border text-[14px] font-semibold flex items-center gap-1.5 transition-colors bg-[var(--fz-surface-sunk)] ${
          open ? 'border-[var(--fz-accent)]' : 'border-[var(--fz-hairline)]'
        } ${current ? 'text-[var(--fz-ink)]' : 'text-[var(--fz-ink-3)]'}`}
      >
        <span className="flex-1 min-w-0 truncate text-left">{current?.label ?? placeholder}</span>
        <IconChevronDown
          size={16} stroke={2}
          className={`shrink-0 text-[var(--fz-ink-3)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full mt-1 z-10 w-full min-w-[172px] max-h-64 overflow-y-auto rounded-[var(--fz-r-field)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)] border border-[var(--fz-hairline)] py-1.5"
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-2 px-3.5 h-10 text-[14px] font-medium text-left truncate transition-colors ${
                o.value === value
                  ? 'text-[var(--fz-accent)]'
                  : 'text-[var(--fz-ink)] hover:bg-[var(--fz-surface-sunk)]'
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <IconCheck size={16} stroke={2.4} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Campo de fecha ───────────────────────────────────────────────────────
   Un `input[type=date]` pelado obliga a abrir el picker y elegir el día aun
   cuando la respuesta es "hoy", que es lo que se contesta casi siempre al
   cargar un movimiento. Los atajos resuelven ese caso —y el de "me olvidé de
   anotarlo ayer"— en un toque, y dejan el picker para el resto.

   El `flex-wrap` no es decorativo: en las pantallas más angostas los atajos
   bajan a una segunda línea en vez de empujar el campo fuera del sheet. */

/** Suma días a una fecha ISO respetando el calendario local (fines de mes, DST). */
function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function DateField({ value, onChange, today }: {
  value: string
  onChange: (value: string) => void
  /** Hoy en ISO local — se recibe hecho para no recalcularlo en cada render. */
  today: string
}) {
  const yesterday = addDaysISO(today, -1)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* `flex` en forma larga y no `flex-1` + `basis-*`: la abreviada pisa al
          basis y el campo volvería a arrancar en 0. El basis chico es el que
          hace que la fila se parta en dos antes que desbordar el sheet. */}
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${fieldClass} h-12 flex-[1_1_150px]`}
      />
      <div className="flex gap-1.5 shrink-0">
        <DayShortcut label="Hoy" active={value === today} onClick={() => onChange(today)} />
        <DayShortcut label="Ayer" active={value === yesterday} onClick={() => onChange(yesterday)} />
      </div>
    </div>
  )
}

function DayShortcut({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-12 px-3 rounded-[var(--fz-r-field)] text-[13px] font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
      }`}
    >
      {label}
    </button>
  )
}

/* ─── Control segmentado ───────────────────────────────────────────────────── */

export function Segmented<T extends string>({ options, value, onChange }: {
  /** `icon` es opcional: úsalo cuando cada opción es su propia categoría
      visual (Gasto/Ingreso/Transferir) y ayuda distinguirlas de un vistazo;
      sin él el segmento se ve como antes (solo texto). El ícono hereda
      `currentColor`, así que ya sale blanco cuando está seleccionado. */
  options: { value: T; label: string; icon?: ReactNode }[]
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
          className={`flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-[var(--fz-r-pill)] text-[13px] font-semibold transition-colors ${
            value === o.value
              ? 'bg-[var(--fz-accent)] text-white'
              : 'text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Esqueleto ────────────────────────────────────────────────────────────
   Ocupa el lugar exacto de un dato que todavía no llegó. La alternativa —
   pintar el valor inicial del estado— muestra $0, que no es "cargando": es un
   número equivocado, y en una app de plata eso se lee como un saldo real. */

export function Skeleton({ w, h = 14, radius, onDark = false, className = '' }: {
  w: number | string
  h?: number
  /** Por defecto una píldora achatada; se fija cuando reemplaza algo cuadrado. */
  radius?: number | string
  onDark?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`fz-skel ${onDark ? 'fz-skel-dark' : ''} ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: h,
        borderRadius: radius ?? Math.min(h / 2, 8),
      }}
    />
  )
}

/* ─── Estado vacío ─────────────────────────────────────────────────────────── */

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: TablerIcon; title: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <span
        aria-hidden
        className="grid place-items-center w-14 h-14 rounded-full mb-3.5 bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-3)]"
      >
        <Icon size={24} stroke={1.6} />
      </span>
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

/* ─── Menú de fila (⋮) ─────────────────────────────────────────────────────
   Editar/Archivar/Borrar (o el subconjunto que aplique) detrás de un ⋮ en
   vez de un botón suelto por acción: en Cuentas competían con el drag handle
   y el monto por atención, y la mayoría de las veces no se tocan. El mismo
   componente lo usan todas las listas de la mini-app — Cuentas, Movimientos,
   Fijos, Deudas, categorías y personas de Ajustes — para que "tres puntos
   arriba a la derecha de la fila" signifique siempre lo mismo.

   Cierra solo (clic afuera o Escape): nada de un backdrop a pantalla completa
   por un menú de dos o tres líneas.

   Es el atajo directo para quien ya sabe qué quiere hacer; tocar la fila en
   sí abre <DetailSheet> (detail-sheet.tsx) con el resumen primero. */

export interface RowMenuItem {
  label: string
  icon: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  /** Aclaración al pasar el mouse — por ejemplo, por qué "Borrar" conviene
      cambiarse por "Archivar" en este caso puntual. */
  title?: string
}

export function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid place-items-center w-8 h-8 min-[900px]:w-9 min-[900px]:h-9 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] transition-colors"
      >
        <IconDotsVertical size={18} stroke={1.8} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-10 w-44 rounded-[var(--fz-r-field)] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)] border border-[var(--fz-hairline)] py-1.5 overflow-hidden"
        >
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onClick() }}
              className={`w-full flex items-center gap-2.5 px-3.5 h-10 text-[14px] font-medium text-left transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                item.danger
                  ? 'text-[var(--fz-out-text)] hover:bg-[var(--fz-out-tint)]'
                  : 'text-[var(--fz-ink)] hover:bg-[var(--fz-surface-sunk)]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
