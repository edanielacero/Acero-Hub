'use client'

import { useCallback, useEffect, useState } from 'react'
import type { BudgetViewMode } from '@/lib/finanzas/budgets'

/**
 * Cómo mostrar el progreso de un presupuesto — configurable en Ajustes,
 * aplica igual en Presupuesto y en la Home. Vive en localStorage, no en la
 * base: es puramente cómo se lo quiere VER en este dispositivo, no un dato
 * financiero — mismo criterio que "ocultar montos" y qué card manda en el
 * hero de la Home.
 */
const KEY = 'fz:budgetView'

function isMode(v: string | null): v is BudgetViewMode {
  return v === 'gastado' || v === 'disponible'
}

export function useBudgetViewPref(): { mode: BudgetViewMode; setMode: (m: BudgetViewMode) => void } {
  // Arranca en el default y se corrige al montar, no en el inicializador: en
  // el prerender del servidor no hay localStorage, y pintar algo distinto de
  // lo que el HTML estático ya trae sería un hydration mismatch.
  const [mode, setModeState] = useState<BudgetViewMode>('gastado')

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY)
    if (isMode(saved)) setModeState(saved)
  }, [])

  const setMode = useCallback((m: BudgetViewMode) => {
    window.localStorage.setItem(KEY, m)
    setModeState(m)
  }, [])

  return { mode, setMode }
}
