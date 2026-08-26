'use client'

import { useCallback, useEffect, useState } from 'react'

const KEY = 'fz:avisos-cerrados'
/** Cuántas claves se guardan. Sobra para años de avisos mensuales. */
const MAX = 40

/**
 * Los avisos de la Home que cerraste con la X. Viven en localStorage, igual
 * que `fz:hero`: son de este dispositivo y no valen un viaje al servidor ni
 * sincronizarse entre teléfonos.
 *
 * La clave lleva el período adentro (`ahorro:2026-07`,
 * `pasanaku:2026-08:<ids>`), así cerrar el aviso de este mes no esconde el
 * del mes que viene. Y como el aviso además desaparece solo cuando la tarea
 * se completa, lo que queda guardado es "ya lo vi", nunca "ya lo hice".
 *
 * `ready` arranca en `false` y pasa a `true` recién al montar: en el
 * prerender no hay localStorage, y pintar un aviso para esconderlo un frame
 * después se ve como un parpadeo. Mismo criterio que `useHeroPref`.
 */
export function useDismissedBanners(): {
  ready: boolean
  isDismissed: (key: string) => boolean
  dismiss: (key: string) => void
} {
  const [keys, setKeys] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) setKeys(parsed.filter((k): k is string => typeof k === 'string'))
    } catch {
      // localStorage bloqueado o JSON corrupto: se arranca sin nada cerrado,
      // que es el lado seguro del error — mostrar de más, nunca esconder de
      // más un aviso que el usuario todavía tiene que atender.
    }
    setReady(true)
  }, [])

  const dismiss = useCallback((key: string) => {
    setKeys(prev => {
      if (prev.includes(key)) return prev
      const next = [...prev, key].slice(-MAX)
      try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ver arriba */ }
      return next
    })
  }, [])

  const isDismissed = useCallback((key: string) => keys.includes(key), [keys])

  return { ready, isDismissed, dismiss }
}
