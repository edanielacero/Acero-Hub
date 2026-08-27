'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Activar y desactivar el push en ESTE dispositivo.
 *
 * El estado es del navegador, no del servidor: el mismo usuario puede tener las
 * notificaciones encendidas en el celular y apagadas en la computadora. Por eso
 * todo acá gira alrededor del `endpoint` de la suscripción local.
 */

export type EstadoPush =
  /** Todavía no se sabe: no terminó de leerse el service worker. */
  | 'cargando'
  /** El navegador no soporta push. */
  | 'no-soportado'
  /** iOS sin instalar en la pantalla de inicio: pedir permiso NO haría nada. */
  | 'ios-sin-instalar'
  /** El permiso está bloqueado; no se puede volver a pedir desde la app. */
  | 'bloqueado'
  /** Se puede activar. */
  | 'listo'
  /** Ya está activado acá. */
  | 'activo'

export interface Push {
  estado: EstadoPush
  endpoint: string | null
  ocupado: boolean
  error: string
  activar: () => Promise<void>
  desactivar: () => Promise<void>
}

/**
 * Web push necesita la clave pública como bytes.
 *
 * El `ArrayBuffer` explícito no es adorno: con TypeScript 6, `Uint8Array.from`
 * devuelve `Uint8Array<ArrayBufferLike>`, que no encaja en `BufferSource`.
 */
function b64ToBytes(b64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

/** ¿Está corriendo instalada en la pantalla de inicio? */
function esStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS se hace pasar por Mac; el táctil lo delata.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function usePush(): Push {
  const [estado, setEstado] = useState<EstadoPush>('cargando')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // En iPhone la ausencia de PushManager casi siempre significa "todavía
        // no la instalaste", no "tu teléfono no puede". Decir lo segundo sería
        // mandar al usuario a un callejón que no existe.
        setEstado(esIOS() && !esStandalone() ? 'ios-sin-instalar' : 'no-soportado')
        return
      }
      if (esIOS() && !esStandalone()) {
        setEstado('ios-sin-instalar')
        return
      }
      if (Notification.permission === 'denied') {
        setEstado('bloqueado')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setEndpoint(sub?.endpoint ?? null)
      setEstado(sub ? 'activo' : 'listo')
    })()
  }, [])

  const activar = useCallback(async () => {
    setOcupado(true)
    setError('')
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'listo')
        return
      }

      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!clave) throw new Error('Falta la clave pública de notificaciones')

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(clave),
      })

      const res = await fetch('/api/finanzas/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar')

      setEndpoint(sub.endpoint)
      setEstado('activo')
    } catch (e) {
      setError((e as Error).message || 'No se pudieron activar')
    } finally {
      setOcupado(false)
    }
  }, [])

  const desactivar = useCallback(async () => {
    setOcupado(true)
    setError('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // Primero el servidor: si se cancela local y falla el borrado, el
        // servidor seguiría mandando a un endpoint muerto hasta el próximo 410.
        await fetch('/api/finanzas/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEndpoint(null)
      setEstado('listo')
    } catch (e) {
      setError((e as Error).message || 'No se pudieron desactivar')
    } finally {
      setOcupado(false)
    }
  }, [])

  return { estado, endpoint, ocupado, error, activar, desactivar }
}
