'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * El comprobante.
 *
 * Deliberadamente NO es la hoja que sube desde abajo que usan las otras
 * mini-apps del Hub: acá cada acción es un movimiento de plata, así que el
 * popup es un papel —cabezal impreso, línea de corte punteada y borde inferior
 * dentado— que cae con un golpe de sello. La forma comunica lo mismo que el
 * contenido.
 */

/** Cuántos dientes lleva el borde inferior. El SVG se estira al ancho real. */
const DIENTE = 16
const DIENTES = 24
const ANCHO = DIENTE * DIENTES

const bordeDentado = (() => {
  let d = 'M0 0'
  // sweep-flag en 0, no en 1: con 1 el arco se curva hacia ARRIBA —fuera del
  // viewBox— y el borde sale recto, sin un solo diente a la vista.
  for (let x = 0; x < ANCHO; x += DIENTE) d += ` A ${DIENTE / 2} ${DIENTE / 2} 0 0 0 ${x + DIENTE} 0`
  return `${d} Z`
})()

export function Comprobante({ rotulo, titulo, onCerrar, children }: {
  /** Lo que va impreso arriba a la izquierda, en la banda oscura. */
  rotulo: string
  titulo: string
  onCerrar: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onTecla)
    return () => document.removeEventListener('keydown', onTecla)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onCerrar}>
      <div className="gas-velo absolute inset-0 bg-[#17181C]/55 backdrop-blur-[3px]" />

      {/* `max-h-full overflow-y-auto`: el comprobante de corrección con un error
          arriba y la confirmación de borrado abajo no entra en una pantalla
          chica, y sin scroll el botón quedaba fuera de alcance. */}
      <div
        className="gas-sello gas-sin-barra relative max-h-full w-full max-w-[360px] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="rounded-t-[14px] overflow-hidden shadow-[0_24px_60px_-12px_rgba(23,24,28,0.45)]">

          {/* Cabezal impreso */}
          <div className="flex items-center justify-between bg-[var(--gas-ink)] px-5 py-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/70">
              {rotulo}
            </span>
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-white/60 transition-colors hover:text-white cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Cuerpo */}
          <div className="bg-[var(--gas-surface)] px-6 pb-6 pt-5">
            <h2 className="mb-5 text-[21px] font-bold leading-tight tracking-[-0.02em] text-[var(--gas-ink)]">
              {titulo}
            </h2>
            {children}
          </div>
        </div>

        {/* Borde dentado: el papel arrancado */}
        <svg
          className="-mt-px block w-full"
          height="8"
          viewBox={`0 0 ${ANCHO} 8`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={bordeDentado} fill="var(--gas-surface)" />
        </svg>
      </div>
    </div>
  )
}

/** La línea de corte del comprobante. */
export function Corte() {
  return (
    <div
      className="my-4 h-px w-full"
      style={{
        backgroundImage: 'repeating-linear-gradient(90deg, var(--gas-hairline-2) 0 6px, transparent 6px 12px)',
      }}
    />
  )
}

/** Un renglón etiqueta → valor, como los de un ticket. */
export function Renglon({ etiqueta, valor, fuerte, tono }: {
  etiqueta: ReactNode
  valor: ReactNode
  fuerte?: boolean
  tono?: 'malo' | 'bueno' | 'acento'
}) {
  const color = tono === 'malo' ? 'var(--gas-malo)'
    : tono === 'bueno' ? 'var(--gas-bueno)'
    : tono === 'acento' ? 'var(--gas-accent)'
    : 'var(--gas-ink)'

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[13px] text-[var(--gas-ink-2)]">{etiqueta}</span>
      {/* Los puntos suspensivos que unen etiqueta y valor, como en un ticket. */}
      <span className="mx-1 flex-1 border-b border-dotted border-[var(--gas-hairline-2)]" />
      <span
        className={`shrink-0 tabular-nums ${fuerte ? 'text-[16.5px] font-bold' : 'text-[14px] font-semibold'}`}
        style={{ color }}
      >
        {valor}
      </span>
    </div>
  )
}

/* ─── Controles ────────────────────────────────────────────────────────────── */

type Tono = 'lleno' | 'naranja' | 'activo' | 'suave' | 'fantasma' | 'peligro'

const TONOS: Record<Tono, string> = {
  lleno:    'bg-[var(--gas-ink)] text-[var(--gas-ink-invert)] hover:bg-[#2A2C33]',
  // Reservado para empezar a usar el auto, que es LA acción de la app.
  naranja:  'bg-[var(--gas-cta)] text-white hover:bg-[var(--gas-cta-press)]',
  // El auto en uso: ámbar quemado, el mismo del estado activo de la tarjeta.
  activo:   'bg-[var(--gas-accent)] text-white hover:brightness-110',
  suave:    'bg-[var(--gas-accent-tint)] text-[var(--gas-accent)] border border-[var(--gas-accent-line)] hover:brightness-97',
  fantasma: 'bg-[var(--gas-surface-alto)] text-[var(--gas-ink-2)] border border-[var(--gas-hairline)] hover:text-[var(--gas-ink)]',
  peligro:  'bg-[var(--gas-malo-tint)] text-[var(--gas-malo)] border border-[var(--gas-malo-line)]',
}

/**
 * El tamaño es una prop y no clases sueltas en `className` a propósito: dos
 * utilidades de Tailwind que compiten (`px-4` de acá y `px-3` de afuera) las
 * resuelve el orden del stylesheet, no el del atributo, así que "pisar" el
 * padding desde el llamador no es confiable. Y el modificador `!` tampoco
 * servía: en Tailwind v4 va como sufijo (`px-3!`), no como prefijo.
 */
type Tamano = 'grande' | 'normal' | 'chico'

const TAMANOS: Record<Tamano, string> = {
  grande: 'px-5 py-3.5 text-[15px]',
  normal: 'px-4 py-3 text-[14px]',
  chico:  'px-3.5 py-2.5 text-[13px]',
}

export function Boton({ tono = 'lleno', tamano = 'normal', className = '', children, ...rest }: {
  tono?: Tono
  tamano?: Tamano
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-xl font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${TAMANOS[tamano]} ${TONOS[tono]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * Campo numérico.
 *
 * `inputMode="decimal"` para que iOS abra el teclado con coma, y el valor lo
 * normaliza `parseNumeroInput` — el usuario está en Bolivia y va a escribir
 * "0,70". Ver lib/gas/format.ts.
 */
export function Campo({ etiqueta, sufijo, ayuda, ...rest }: {
  etiqueta: string
  sufijo?: string
  ayuda?: ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
        {etiqueta}
      </span>
      <div className="flex items-baseline gap-2 border-b-2 border-[var(--gas-ink)] pb-1.5 focus-within:border-[var(--gas-accent)]">
        <input
          inputMode="decimal"
          autoComplete="off"
          className="w-full bg-transparent text-[34px] font-bold tabular-nums tracking-[-0.02em] text-[var(--gas-ink)] outline-none placeholder:text-[var(--gas-hairline-2)]"
          {...rest}
        />
        {sufijo && <span className="shrink-0 text-[14px] font-bold text-[var(--gas-ink-3)]">{sufijo}</span>}
      </div>
      {ayuda && <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--gas-ink-2)]">{ayuda}</p>}
    </label>
  )
}

/**
 * Campo de texto de una línea, para la nota del viaje.
 *
 * Deliberadamente discreto al lado de `Campo`: aquel es la cifra que uno viene
 * a cargar, este es un agregado opcional y no tiene que competirle.
 */
export function CampoNota({ etiqueta, ...rest }: {
  etiqueta: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
        {etiqueta}
      </span>
      <input
        type="text"
        autoComplete="off"
        maxLength={200}
        className="w-full rounded-xl border border-[var(--gas-hairline)] bg-[var(--gas-surface-alto)] px-3.5 py-3 text-[14px] text-[var(--gas-ink)] outline-none transition-colors placeholder:text-[var(--gas-ink-3)] focus:border-[var(--gas-ink)]"
        {...rest}
      />
    </label>
  )
}

/** El error de un comprobante, cuando el servidor rechaza. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-3 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed"
      style={{ backgroundColor: 'var(--gas-malo-tint)', color: 'var(--gas-malo)' }}
    >
      {children}
    </p>
  )
}
