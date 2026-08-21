'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconArrowDown, IconLoader2 } from '@tabler/icons-react'
import { useFinanzas } from './data-context'

const THRESHOLD = 64
const MAX_PULL = 88
// Cuanto más se estira, más cuesta — mismo principio que el rebote nativo de
// iOS, que `overscroll-behavior-y: none` (theme.css) apaga en toda la
// mini-app para que este gesto propio sea el único que se vea.
const RESISTANCE = 0.45

/**
 * Pull-to-refresh manual: sin rebote nativo del browser (apagado a propósito
 * arriba) no hay otra forma de dar el gesto de "estirar para actualizar" de
 * una app nativa. Envuelve el contenido scrolleable de `<main>`; el indicador
 * empuja el contenido hacia abajo en vez de superponerse (crece en el flujo
 * normal, no con `position: absolute`), así que nunca tapa nada.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { reload } = useFinanzas()
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)
  const pullRef = useRef(0)
  const [pull, setPullState] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function setPull(v: number) {
    pullRef.current = v
    setPullState(v)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function reset() {
      startY.current = null
      dragging.current = false
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshing || window.scrollY > 0) return
      startY.current = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current

      // Hacia arriba, o el scroll nativo ya avanzó (p. ej. un carrusel
      // horizontal desvió el gesto): se suelta el seguimiento y que el
      // scroll normal siga su curso.
      if (dy <= 0 || window.scrollY > 0) {
        reset()
        setPull(0)
        return
      }

      dragging.current = true
      e.preventDefault()
      setPull(Math.min(MAX_PULL, dy * RESISTANCE))
    }

    function onTouchEnd() {
      if (dragging.current && pullRef.current >= THRESHOLD) {
        setRefreshing(true)
        setPull(THRESHOLD)
        void reload().finally(() => {
          setRefreshing(false)
          setPull(0)
        })
      } else {
        setPull(0)
      }
      reset()
    }

    // `touchmove` no puede ser pasivo: necesita `preventDefault()` para que
    // el gesto no scrollee la página mientras se estira el indicador.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [refreshing, reload])

  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div ref={containerRef}>
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{ height: pull, transition: dragging.current ? 'none' : 'height 200ms ease' }}
        aria-hidden
      >
        <span
          className="mb-2 grid place-items-center w-8 h-8 rounded-full bg-[var(--fz-surface)] text-[var(--fz-accent)] shadow-[var(--fz-sh-rest)]"
          style={{ opacity: progress, transform: `rotate(${refreshing ? 0 : progress * 180}deg)` }}
        >
          {refreshing
            ? <IconLoader2 size={16} stroke={2.2} className="animate-spin" />
            : <IconArrowDown size={16} stroke={2.2} />}
        </span>
      </div>
      {children}
    </div>
  )
}
