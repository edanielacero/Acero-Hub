'use client'

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { parseSessionClaims, readSessionClaims } from '@/lib/session-claims'
import { createClient } from '@/lib/supabase'

/**
 * Gate de navegación de una mini-app, en el cliente.
 *
 * Reemplaza al redirect que hacía proxy.ts. El motivo del cambio es de
 * velocidad, no de seguridad: aquel corría en el servidor en cada navegación y
 * en cada prefetch, y con el token vencido salía a la red de Supabase a
 * refrescar — 276 ms medidos, ~583 ms en el arranque con los prefetch de la tab
 * bar encima, todo delante del primer pintado. Acá el mismo permiso se resuelve
 * leyendo la cookie, síncrono, sin red — salvo cuando la cookie dice que NO,
 * que es el único caso en que se sale a pedir un token nuevo (ver abajo).
 *
 * ⚠️ Como todo gate de cliente, esto decide QUÉ PINTAR, no a qué datos se puede
 * llegar. Quien fabrique una cookie ve el cascarón vacío y nada más: las rutas
 * de /api verifican la firma del JWT con requireUser() y RLS filtra por usuario.
 * Verificado endpoint por endpoint — todos responden 401 sin sesión válida.
 */
export function AccessGate({ project, children }: { project: string; children: ReactNode }) {
  const router = useRouter()
  const [denied, setDenied] = useState(false)

  /*
    El primer render SIEMPRE devuelve children, igual que el HTML prerenderizado
    — si dependiera de la cookie, que en el build no existe, React lo cantaría
    como hydration mismatch y tiraría el árbol entero.

    La verificación va en un efecto de layout: corre en el cliente antes del
    pintado, así que el `setDenied` alcanza a ocultar el cascarón sin que
    llegue a verse. En el servidor no hay efecto de layout que valga.
  */
  const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect
  useIso(() => {
    const claims = readSessionClaims()

    if (!claims) {
      setDenied(true)
      router.replace('/login')
      return
    }
    if (claims.projects.includes(project)) return

    /*
      El token dice que no, pero puede estar diciendo algo viejo: los permisos
      quedan congelados en el JWT hasta que se renueva. Antes de echar a alguien
      a quien SÍ le concedieron el acceso hace un minuto, se pide un token nuevo
      —GoTrue vuelve a correr el hook y recalcula los slugs contra la base— y se
      mira de nuevo. Es lo que hace que entrar directo por URL a una mini-app
      recién concedida funcione recargando, sin cerrar sesión.

      El request se paga SOLO en este camino: a quien el token ya le da permiso
      no le cuesta nada. Mientras tanto sigue sin pintarse nada, igual que
      antes — quien no tenga acceso no llega a ver el cascarón.
    */
    setDenied(true)
    let vivo = true

    void (async () => {
      const { data } = await createClient().auth.refreshSession()
      if (!vivo) return

      const frescos = data.session ? parseSessionClaims(data.session.access_token) : null
      if (frescos?.projects.includes(project)) {
        setDenied(false)
        return
      }
      router.replace('/')
    })()

    return () => { vivo = false }
  }, [project, router])

  if (denied) return null
  return <>{children}</>
}
