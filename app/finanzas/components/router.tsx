'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type AnchorHTMLAttributes, type ReactNode, type Ref,
} from 'react'
import { usePathname } from 'next/navigation'

/**
 * Ruteo dentro de la mini-app, sin pasar por el router de Next.
 *
 * Las 7 pantallas viven en una sola ruta (`[[...slug]]`), así que cambiar de
 * pestaña no es una navegación: es un cambio de estado más un `pushState` para
 * que la URL siga contando dónde estás. Cero red, cero payload RSC, cero
 * desmontaje del <Shell> — el contexto de datos, el caché de movimientos y el
 * scroll sobreviven al cambio.
 *
 * La URL sigue siendo real: `[[...slug]]` prerenderiza una página estática por
 * cada slug conocido (ver generateStaticParams), así que entrar directo a
 * /finanzas/fijos, compartirlo o recargarlo funciona igual que antes.
 */

interface FzRouter {
  /** Path actual, siempre empezando en `/finanzas`. */
  path: string
  navigate: (href: string) => void
}

const Ctx = createContext<FzRouter | null>(null)

export function FzRouterProvider({ children }: { children: ReactNode }) {
  /*
    El valor inicial sale de usePathname() y no de `location`: en el prerender
    del servidor `location` no existe, y arrancar con otra cosa que lo que el
    HTML estático ya trae sería un hydration mismatch.

    A partir del montaje, la fuente de verdad pasa a ser este estado —
    usePathname() se queda viejo porque el router de Next ya no interviene, y
    eso es exactamente lo que buscamos.
  */
  const initial = usePathname()
  const [path, setPath] = useState(initial)

  const navigate = useCallback((href: string) => {
    // Fuera de la mini-app se navega de verdad: ahí sí hay otro layout, otro
    // bundle y otro árbol que montar.
    if (!href.startsWith('/finanzas')) {
      window.location.href = href
      return
    }
    if (href === window.location.pathname) return
    window.history.pushState(null, '', href)
    setPath(href)
    // Cada pantalla es una vista nueva: heredar el scroll de la anterior deja
    // la Home a media altura al volver desde una lista larga.
    window.scrollTo(0, 0)
  }, [])

  // Atrás y adelante del navegador. Sin esto la URL cambia pero la pantalla no.
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const value = useMemo(() => ({ path, navigate }), [path, navigate])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFzRouter(): FzRouter {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFzRouter debe usarse dentro de <FzRouterProvider>')
  return ctx
}

/** Solo el path. La mayoría de los llamadores no necesitan `navigate`. */
export function useFzPath(): string {
  return useFzRouter().path
}

type FzLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** React 19 pasa `ref` como una prop más; la tab bar la usa para medir el pill. */
  ref?: Ref<HTMLAnchorElement>
}

/**
 * Reemplazo de <Link> puertas adentro. Sigue siendo un <a> con href real —
 * "abrir en pestaña nueva", copiar el enlace y los lectores de pantalla
 * funcionan igual—, pero el click normal lo maneja el router de arriba.
 */
export function FzLink({ href, onClick, children, ...rest }: FzLinkProps) {
  const { navigate } = useFzRouter()

  return (
    <a
      href={href}
      onClick={e => {
        onClick?.(e)
        // Ctrl/Cmd/medio: el usuario pidió otra pestaña. No secuestrarlo.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        navigate(href)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
