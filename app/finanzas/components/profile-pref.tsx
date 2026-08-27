'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AccentKey } from '@/lib/finanzas/types'

/**
 * El perfil activo de ESTE dispositivo (Sprint 8).
 *
 * Vive en localStorage y no en la base, igual que `fz:hero` y `fz:hidden`:
 * cambiar de perfil en el celular no debe cambiarlo en la computadora. Además
 * evita un viaje al servidor por navegación.
 *
 * Se guarda el **acento junto al id**, no solo el id. Es la misma lógica del
 * snapshot: pintar el primer frame en verde para corregirlo a naranja medio
 * segundo después no es solo un parpadeo, es medio segundo diciendo algo falso
 * sobre en qué perfil estás — y el color es justamente lo que evita registrar
 * un movimiento en el perfil equivocado.
 */
export interface ProfilePref {
  id: string | null
  accent: AccentKey
}

const KEY = 'fz:profile'
const DEFAULT: ProfilePref = { id: null, accent: 'verde' }

function read(): ProfilePref {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw)
    if (typeof parsed?.id !== 'string') return DEFAULT
    return { id: parsed.id, accent: parsed.accent ?? 'verde' }
  } catch {
    return DEFAULT
  }
}

/** Lo lee sin hook: el provider lo necesita antes del primer fetch. */
export function readProfilePref(): ProfilePref {
  if (typeof window === 'undefined') return DEFAULT
  return read()
}

export function writeProfilePref(pref: ProfilePref): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pref))
  } catch {}
}

export function useProfilePref(): {
  pref: ProfilePref
  setPref: (p: ProfilePref) => void
} {
  // Arranca en el default y se corrige al montar, no en el inicializador: en el
  // prerender del servidor no hay localStorage, y pintar algo distinto de lo
  // que el HTML estático ya trae sería un hydration mismatch. Mismo criterio
  // que `useHeroPref` y que `hidden` en data-context.
  const [pref, setPrefState] = useState<ProfilePref>(DEFAULT)

  useEffect(() => { setPrefState(read()) }, [])

  const setPref = useCallback((p: ProfilePref) => {
    writeProfilePref(p)
    setPrefState(p)
  }, [])

  return { pref, setPref }
}
