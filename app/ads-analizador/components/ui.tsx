'use client'

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconArrowLeft, IconLoader2, IconX } from '@tabler/icons-react'
import type { Color } from '@/lib/ads-analizador/types'
import { AdsLink } from '../router'

/** Contenedor de página: angosto en celular, hasta 1024px en escritorio. */
export function Pagina({ children, angosta = false }: { children: ReactNode; angosta?: boolean }) {
  return (
    <main className={`mx-auto w-full ${angosta ? 'max-w-2xl' : 'max-w-5xl'} px-4 pb-24 pt-4 sm:px-6 sm:pt-6`}>
      {children}
    </main>
  )
}

/** Barra superior fija con volver, título y acciones. */
export function Barra({ titulo, subtitulo, atras, acciones, angosta = false }: {
  titulo: ReactNode
  subtitulo?: ReactNode
  atras?: string
  acciones?: ReactNode
  /** Mismo ancho que una <Pagina angosta>, para que el título alinee con el contenido. */
  angosta?: boolean
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--ads-hairline)] bg-[color-mix(in_srgb,var(--ads-canvas)_85%,transparent)] backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className={`mx-auto flex h-16 w-full ${angosta ? 'max-w-2xl' : 'max-w-5xl'} items-center gap-3 px-4 sm:px-6`}>
        {atras && (
          <AdsLink
            href={atras}
            aria-label="Volver"
            className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ads-ink-2)] transition hover:bg-black/5"
          >
            <IconArrowLeft size={20} />
          </AdsLink>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.01em] sm:text-lg">{titulo}</h1>
          {subtitulo && <p className="truncate text-xs text-[var(--ads-ink-2)]">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
    </header>
  )
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-[var(--ads-accent)] text-white hover:bg-[var(--ads-accent-press)] shadow-sm',
  secundario: 'bg-white text-[var(--ads-ink)] border border-[var(--ads-hairline-2)] hover:bg-[var(--ads-surface-2)] shadow-sm',
  peligro: 'bg-white text-[var(--ads-rojo)] border border-[var(--ads-rojo-line)] hover:bg-[var(--ads-rojo-tint)]',
  fantasma: 'text-[var(--ads-ink-2)] hover:bg-black/5',
}

export function Boton({ variante = 'primario', cargando, icono, className = '', children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; icono?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || cargando}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    >
      {cargando ? <IconLoader2 size={18} className="animate-spin" /> : icono}
      {children}
    </button>
  )
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // min-w-0: dentro de una grilla, sin esto una tabla ancha estira la columna
    // entera y la página scrollea de costado en el celular.
    <section className={`min-w-0 rounded-2xl border border-[var(--ads-hairline)] bg-[var(--ads-surface)] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {children}
    </section>
  )
}

export function Campo({ etiqueta, ayuda, error, children, htmlFor }: {
  etiqueta: string; ayuda?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--ads-ink)]">{etiqueta}</label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--ads-rojo)]">{error}</p>
      ) : ayuda ? (
        <p className="text-xs leading-relaxed text-[var(--ads-ink-2)]">{ayuda}</p>
      ) : null}
    </div>
  )
}

export function Entrada({ prefijo, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { prefijo?: string }) {
  return (
    <div className={`flex h-11 items-center rounded-xl border border-[var(--ads-hairline-2)] bg-white px-3 shadow-sm transition focus-within:border-[var(--ads-accent)] focus-within:ring-4 focus-within:ring-[var(--ads-accent-tint)] ${className}`}>
      {prefijo && <span className="mr-2 text-sm text-[var(--ads-ink-3)]">{prefijo}</span>}
      {/* 16px: con menos, Safari de iPhone hace zoom al enfocar el campo. */}
      <input {...rest} className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-[var(--ads-ink-3)] sm:text-sm" />
    </div>
  )
}

export function Segmentado<T extends string>({ opciones, valor, onChange, nombre, columnas }: {
  opciones: { valor: T; etiqueta: ReactNode; detalle?: string }[]
  valor: T | null
  onChange: (v: T) => void
  nombre: string
  columnas?: number
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnas ?? opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map(o => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(o.valor)}
            className={`flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left text-sm transition ${
              activo
                ? 'border-[var(--ads-accent)] bg-[var(--ads-accent-tint)] text-[var(--ads-accent-press)] ring-1 ring-[var(--ads-accent)]'
                : 'border-[var(--ads-hairline-2)] bg-white text-[var(--ads-ink)] hover:bg-[var(--ads-surface-2)]'
            }`}
          >
            <span className="font-semibold">{o.etiqueta}</span>
            {o.detalle && <span className={`text-xs ${activo ? 'text-[var(--ads-accent)]' : 'text-[var(--ads-ink-2)]'}`}>{o.detalle}</span>}
          </button>
        )
      })}
    </div>
  )
}

export const SEMAFORO: Record<Color, { etiqueta: string; texto: string; tinte: string; linea: string; punto: string }> = {
  verde: { etiqueta: 'Sana', texto: 'var(--ads-verde)', tinte: 'var(--ads-verde-tint)', linea: 'var(--ads-verde-line)', punto: 'var(--ads-verde-dot)' },
  amarillo: { etiqueta: 'Revisar', texto: 'var(--ads-amarillo)', tinte: 'var(--ads-amarillo-tint)', linea: 'var(--ads-amarillo-line)', punto: 'var(--ads-amarillo-dot)' },
  rojo: { etiqueta: 'Foco rojo', texto: 'var(--ads-rojo)', tinte: 'var(--ads-rojo-tint)', linea: 'var(--ads-rojo-line)', punto: 'var(--ads-rojo-dot)' },
}

/** Sin datos todavía no es "revisar": no hay nada que revisar. Va en gris. */
export const SIN_DATOS = { etiqueta: 'Sin datos', texto: 'var(--ads-ink-2)', tinte: 'var(--ads-surface-2)', linea: 'var(--ads-hairline-2)', punto: 'var(--ads-ink-3)' }

export function estiloEstado(estado: { color: Color; accion: string }) {
  return estado.accion === 'sin_datos' ? SIN_DATOS : SEMAFORO[estado.color]
}

export function PillEstado({ estado, etiqueta }: { estado: { color: Color; accion: string }; etiqueta?: string }) {
  const s = estiloEstado(estado)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{ color: s.texto, backgroundColor: s.tinte, borderColor: s.linea }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.punto }} />
      {etiqueta ?? s.etiqueta}
    </span>
  )
}

export function Chip({ children, icono }: { children: ReactNode; icono?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--ads-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--ads-ink-2)] ring-1 ring-inset ring-[var(--ads-hairline)]">
      {icono}{children}
    </span>
  )
}

export function Aviso({ tono = 'rojo', children }: { tono?: 'rojo' | 'amarillo' | 'info'; children: ReactNode }) {
  const estilos = {
    rojo: 'bg-[var(--ads-rojo-tint)] text-[var(--ads-rojo)] border-[var(--ads-rojo-line)]',
    amarillo: 'bg-[var(--ads-amarillo-tint)] text-[var(--ads-amarillo)] border-[var(--ads-amarillo-line)]',
    info: 'bg-[var(--ads-accent-tint)] text-[var(--ads-accent-press)] border-[#C7D4FB]',
  }[tono]
  return <div role={tono === 'rojo' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${estilos}`}>{children}</div>
}

/**
 * Hoja modal: sube desde abajo en celular, centrada en escritorio. Escape y el
 * velo la cierran.
 */
export function Hoja({ abierta, onCerrar, titulo, children }: {
  abierta: boolean; onCerrar: () => void; titulo: string; children: ReactNode
}) {
  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [abierta, onCerrar])

  if (!abierta) return null
  /*
    Portal a #ads-root: la <Barra> usa backdrop-filter, y un ancestro con
    backdrop-filter se vuelve el bloque contenedor de todo `position: fixed`
    adentro. Una hoja abierta desde un botón de la barra quedaba encerrada en sus
    64 px de alto. Se monta en #ads-root y no en <body> para heredar las
    variables del tema y la tipografía de la mini-app.
  */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center font-[family-name:var(--font-ads)] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <button aria-label="Cerrar" className="ads-velo absolute inset-0 bg-[rgba(16,24,40,0.45)]" onClick={onCerrar} />
      <div
        className="ads-subir relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ads-ink-2)] hover:bg-black/5">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.getElementById('ads-root') ?? document.body,
  )
}

export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-black/[0.05] ${className}`} />
}

export function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-[var(--ads-ink-2)]">{etiqueta}</p>
      <p className="mt-0.5 truncate text-base font-semibold tracking-[-0.01em]">{valor}</p>
      {detalle && <p className="truncate text-xs text-[var(--ads-ink-3)]">{detalle}</p>}
    </div>
  )
}
