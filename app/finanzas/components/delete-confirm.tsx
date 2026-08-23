'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IconChevronsRight, IconLoader2, IconX } from '@tabler/icons-react'
import { ErrorNote } from './ui'

/**
 * Confirmación de borrado, igual en toda la mini-app (§ feedback del
 * usuario: "todos los botones Eliminar deben tener confirmación,
 * mostrando qué se está eliminando, y la confirmación es un slider, no un
 * botón — sin cancelar, solo la X").
 *
 * `children` es la vista previa de lo que se borra — cada pantalla arma la
 * suya con los átomos que ya tiene a mano (`<CategoryIcon>`, `<PersonAvatar>`,
 * `<CurrencyIcon>`…), típicamente con `<DeletePreview>` de acá abajo.
 */
export function DeleteConfirmSheet({ open, onClose, onConfirm, title, confirming, error, children }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  /** La eliminación está en curso: bloquea la X y muestra el spinner en el handle. */
  confirming?: boolean
  /** Falló el intento anterior: se muestra arriba del slider, que vuelve a
      quedar listo para otro intento — este sheet no tiene por qué depender
      de un banner de error en la pantalla de atrás. */
  error?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // z-[60]: por encima de cualquier sheet desde el que se abra (quick-add,
    // fijos, deudas ya usan z-50) — nunca queda tapado por el que lo abrió.
    <div className="fixed inset-0 z-[60] flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.4)]" onClick={onClose} aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="fz-sheet relative w-full min-[900px]:w-[420px] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h2>
          {/* Sin botón de cancelar a propósito: la X es la única salida. Un
              "Cancelar" al lado de un slider no aporta nada — soltar el dedo
              antes de llegar al final ya cancela. */}
          <button
            type="button" onClick={onClose} aria-label="Cerrar" disabled={confirming}
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] disabled:opacity-40"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-6 pt-3 flex flex-col gap-4">
          {children}
          <ErrorNote>{error}</ErrorNote>
          <SlideToConfirm label="Desliza para eliminar" onConfirm={onConfirm} busy={confirming} />
        </div>
      </div>
    </div>
  )
}

/** Fila de vista previa: ícono/avatar ya armado por quien llama + título +
    dato secundario + monto opcional. La misma forma para cuenta, categoría,
    persona, movimiento, fijo o deuda. */
export function DeletePreview({ icon, title, subtitle, amount }: {
  icon: ReactNode
  title: string
  subtitle?: string
  amount?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold truncate">{title}</p>
        {subtitle && <p className="text-[12px] text-[var(--fz-ink-3)] truncate">{subtitle}</p>}
      </div>
      {amount != null && <div className="text-[15px] font-semibold fz-num shrink-0">{amount}</div>}
    </div>
  )
}

const HANDLE = 52
/** A partir de acá, soltar cuenta como "confirmado" — no hace falta llegar
    al pixel exacto del borde. */
const THRESHOLD = 0.85

/**
 * El slider en sí. Un botón de "Eliminar" se toca sin querer o por reflejo;
 * un gesto sostenido de arrastre de punta a punta no. `role="slider"` +
 * flecha derecha/Enter/Espacio como atajo de teclado, para que no sea un
 * gesto imposible de reproducir sin mouse ni dedo.
 */
function SlideToConfirm({ label, onConfirm, busy }: {
  label: string
  onConfirm: () => void
  busy?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const wasBusyRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState(false)

  // `busy` pasa de true a false cuando el intento anterior TERMINÓ. Si seguimos
  // montados en ese momento es porque falló (el éxito cierra el sheet entero,
  // que desmonta esto antes de que el reset llegue a verse) — así que el
  // slider vuelve a su posición inicial y queda listo para reintentar.
  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      setDone(false)
      setProgress(0)
    }
    wasBusyRef.current = !!busy
  }, [busy])

  // Misma cuenta acá que en el `left` del render (inset de 4px a cada lado):
  // si no coinciden, el handle se despega del dedo/cursor a medida que avanza.
  function progressFor(clientX: number): number {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const usable = rect.width - HANDLE - 8
    if (usable <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left - 4 - HANDLE / 2) / usable))
  }

  function finish(commit: boolean) {
    draggingRef.current = false
    setDragging(false)
    if (commit) {
      setDone(true)
      setProgress(1)
      onConfirm()
    } else {
      setProgress(0)
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (busy || done) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setDragging(true)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return
    setProgress(progressFor(e.clientX))
  }
  function onPointerUp() {
    if (!draggingRef.current) return
    finish(progress >= THRESHOLD)
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (busy || done) return
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      finish(true)
    }
  }

  return (
    <div
      ref={trackRef}
      className="relative h-14 rounded-[var(--fz-r-pill)] bg-[var(--fz-out-tint)] overflow-hidden select-none"
    >
      <p
        className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold text-[var(--fz-out-text)] pointer-events-none transition-opacity"
        style={{ opacity: Math.max(0, 1 - progress * 1.6) }}
      >
        {label}
      </p>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => finish(false)}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        disabled={busy}
        className="absolute top-1 grid place-items-center rounded-full bg-[var(--fz-out)] text-white touch-none cursor-grab active:cursor-grabbing disabled:cursor-default"
        style={{
          width: HANDLE,
          height: HANDLE,
          left: `calc(4px + ${progress} * (100% - ${HANDLE + 8}px))`,
          transition: dragging ? 'none' : 'left 200ms ease-out',
        }}
      >
        {busy
          ? <IconLoader2 size={20} stroke={2} className="animate-spin" />
          : <IconChevronsRight size={22} stroke={2} />}
      </button>
    </div>
  )
}
