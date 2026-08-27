'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker de Finanzas.
 *
 * Va montado desde el layout de la mini-app y no desde el del Hub: el scope
 * queda en `/finanzas/`, así que ni el portal ni las otras mini-apps quedan
 * bajo un service worker que no pidieron.
 *
 * No renderiza nada. Falla en silencio a propósito: si el navegador no soporta
 * service workers, o el usuario está en una ventana privada, la app tiene que
 * funcionar igual — lo único que se pierde son las notificaciones.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/finanzas/sw.js', { scope: '/finanzas/' }).catch(() => {})
  }, [])

  return null
}
