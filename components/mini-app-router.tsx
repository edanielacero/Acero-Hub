'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type AnchorHTMLAttributes, type ReactNode, type Ref,
} from 'react'
import { usePathname } from 'next/navigation'

/**
 * Ruteo interno de una mini-app, sin pasar por el router de Next.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Cada mini-app del Hub vive en UNA sola ruta de Next (`[[...slug]]`) y resuelve
 * sus pantallas acá, en el cliente. Cambiar de pantalla no es una navegación:
 * es un cambio de estado más un `pushState` para que la URL siga contando dónde
 * estás. Cero red, cero payload RSC, cero router de Next en el medio.
 *
 * La URL sigue siendo real. `generateStaticParams` prerenderiza un HTML por
 * cada pantalla conocida, así que entrar directo a una URL, recargarla o
 * compartirla funciona como cualquier página.
 *
 * ── Cómo se usa en una mini-app nueva ───────────────────────────────────────
 *   1. `const { Provider, Link, usePath, useNav } = createMiniAppRouter('/mi-app')`
 *      en un módulo propio de la app.
 *   2. Envolver el shell en <Provider>.
 *   3. Usar <Link> en vez de next/link, y usePath() en vez de usePathname().
 *   4. Una sola ruta `app/mi-app/[[...slug]]/page.tsx` con generateStaticParams.
 *
 * Ver documentos/arquitectura/mini-apps.md.
 */

export interface MiniAppRouter {
  /** Path actual, siempre empezando por el base de la mini-app. */
  path: string
  /** Segmentos después del base. `/mi-app/a/b` → `['a','b']`. */
  segments: string[]
  navigate: (href: string) => void
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** React 19 pasa `ref` como una prop más; alguna barra la usa para medir. */
  ref?: Ref<HTMLAnchorElement>
}

export function createMiniAppRouter(base: string) {
  const Ctx = createContext<MiniAppRouter | null>(null)

  function Provider({ children }: { children: ReactNode }) {
    /*
      El valor inicial sale de usePathname() y no de `location`: en el prerender
      del servidor `location` no existe, y arrancar con algo distinto de lo que
      el HTML estático ya trae sería un hydration mismatch.

      A partir del montaje la fuente de verdad pasa a ser este estado —
      usePathname() se queda viejo porque el router de Next ya no interviene, y
      eso es exactamente lo que buscamos.
    */
    const initial = usePathname()
    const [path, setPath] = useState(initial)

    const navigate = useCallback((href: string) => {
      // Fuera de la mini-app se navega de verdad: ahí hay otro layout, otro
      // bundle y otro árbol que montar.
      if (!href.startsWith(base)) {
        window.location.href = href
        return
      }
      if (href === window.location.pathname) return
      window.history.pushState(null, '', href)
      setPath(href)
      // Cada pantalla es una vista nueva: heredar el scroll de la anterior deja
      // la pantalla a media altura al volver desde una lista larga.
      window.scrollTo(0, 0)
    }, [])

    // Atrás y adelante del navegador. Sin esto la URL cambia pero la pantalla no.
    useEffect(() => {
      const onPop = () => setPath(window.location.pathname)
      window.addEventListener('popstate', onPop)
      return () => window.removeEventListener('popstate', onPop)
    }, [])

    const value = useMemo<MiniAppRouter>(() => ({
      path,
      segments: path.slice(base.length).split('/').filter(Boolean),
      navigate,
    }), [path, navigate])

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
  }

  function useNav(): MiniAppRouter {
    const ctx = useContext(Ctx)
    if (!ctx) throw new Error(`El router de ${base} necesita su <Provider> arriba`)
    return ctx
  }

  /** Solo el path. La mayoría de los llamadores no necesitan `navigate`. */
  function usePath(): string {
    return useNav().path
  }

  /**
   * Reemplazo de <Link> puertas adentro. Sigue siendo un <a> con href real —
   * "abrir en pestaña nueva", copiar el enlace y los lectores de pantalla
   * funcionan igual—, pero el click normal lo maneja el router de arriba.
   */
  function Link({ href, onClick, children, ...rest }: LinkProps) {
    const { navigate } = useNav()
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

  return { Provider, Link, usePath, useNav }
}
