'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Mantiene viva la sesión desde el navegador.
 *
 * Hasta ahora el único que refrescaba el JWT era el proxy, y lo hacía en el
 * camino crítico: con el token vencido, `getClaims()` sale a la red de Supabase
 * y **todo** el request espera — medido en 276 ms, y lo pagaba también cada
 * prefetch de la tab bar, así que abrir la app tras un rato costaba ~583 ms
 * antes de pintar un pixel.
 *
 * `createBrowserClient` guarda la sesión en `document.cookie`, o sea en el
 * mismo lugar donde el servidor la busca: refrescar acá deja la cookie fresca
 * para las rutas de API sin que ellas cambien en nada. Y al correr de fondo,
 * el refresco deja de estar delante del primer pintado.
 *
 * Va en el layout raíz para cubrir el Hub y las tres mini-apps por igual: la
 * sesión es del Hub, no de una app.
 */
export function SessionKeeper() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()

    // `getSession()` refresca si hace falta. Se llama al montar para no depender
    // solo del temporizador interno, que no corrió mientras la pestaña no existía
    // — que es justo el caso de abrir la app después de horas.
    void supabase.auth.getSession()

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // Sin el proxy no hay redirección de servidor que rescate a una pantalla
      // que se quedó sin sesión: la hace el cliente.
      if (!pathname.startsWith('/login') && !pathname.startsWith('/invite')) {
        router.replace('/login')
      }
    })

    return () => data.subscription.unsubscribe()
  }, [router, pathname])

  return null
}
