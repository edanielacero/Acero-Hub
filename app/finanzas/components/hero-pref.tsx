'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Qué muestra el card principal de la Home. Vive en localStorage y no en la
 * base: es una preferencia de este dispositivo, igual que `fz:hidden` — no
 * algo que valga un viaje al servidor ni sincronizar entre teléfonos.
 *
 * `ambos` convierte el card en un carrusel de dos: patrimonio y presupuesto,
 * uno por swipe.
 */
export type HeroMode = 'patrimonio' | 'presupuesto' | 'ambos'

const KEY = 'fz:hero'

function isHeroMode(v: string | null): v is HeroMode {
  return v === 'patrimonio' || v === 'presupuesto' || v === 'ambos'
}

export function useHeroPref(): { mode: HeroMode; setMode: (m: HeroMode) => void } {
  // Arranca en el default y se corrige al montar, no en el inicializador: en
  // el prerender del servidor no hay localStorage, y pintar algo distinto de
  // lo que el HTML estático ya trae sería un hydration mismatch. El mismo
  // criterio que usa `hidden` en data-context.
  const [mode, setModeState] = useState<HeroMode>('patrimonio')

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY)
    if (isHeroMode(saved)) setModeState(saved)
  }, [])

  const setMode = useCallback((m: HeroMode) => {
    window.localStorage.setItem(KEY, m)
    setModeState(m)
  }, [])

  return { mode, setMode }
}
