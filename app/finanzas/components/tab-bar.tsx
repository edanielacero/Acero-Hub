'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { TAB_ITEMS, activeTabHref } from './nav-items'
import { FzLink, useFzPath } from './router'

/**
 * Tab bar de vidrio, a todo el ancho y anclada al borde inferior.
 * Ver documentos/finanzas/contexto_ui_finanzas.md §6.
 */
export function TabBar() {
  const pathname = useFzPath()
  const navRef = useRef<HTMLElement | null>(null)
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [pill, setPill] = useState<{ x: number; w: number; visible: boolean }>({ x: 0, w: 0, visible: false })

  const activeHref = activeTabHref(pathname)

  // Se mide en coordenadas de viewport con getBoundingClientRect(), no con
  // offsetLeft, para no depender de dónde cae el borde o el padding del
  // contenedor. nav.clientLeft (= el border-left-width real) corrige el único
  // desfase que sí importa, sin asumir ningún valor fijo.
  useLayoutEffect(() => {
    function measure() {
      const nav = navRef.current
      const el = activeHref ? tabRefs.current[activeHref] : null
      if (!nav || !el) {
        setPill(p => (p.visible ? { ...p, visible: false } : p))
        return
      }
      const navRect = nav.getBoundingClientRect()
      const tabRect = el.getBoundingClientRect()
      // El ancho también se mide: los tabs son flexibles, así que no hay un
      // valor fijo que el CSS pueda asumir.
      setPill({ x: tabRect.left - navRect.left - nav.clientLeft, w: tabRect.width, visible: true })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeHref])

  const renderTab = (item: (typeof TAB_ITEMS)[number]) => {
    const active = item.href === activeHref
    const Glyph = active ? item.IconActive : item.Icon
    return (
      <FzLink
        key={item.href}
        href={item.href}
        ref={el => { tabRefs.current[item.href] = el }}
        aria-current={active ? 'page' : undefined}
        className={`fz-tab ${active ? 'fz-tab-active' : ''}`}
      >
        <Glyph size={22} stroke={1.8} />
        <span className="fz-tab-label">{item.label}</span>
      </FzLink>
    )
  }

  return (
    <nav ref={navRef} className="fz-tabbar" aria-label="Navegación de Finanzas">
      {/* useLayoutEffect y no useEffect: mide y posiciona antes del paint, si no
          el pill se ve saltar desde x=0 en la primera carga. */}
      <span
        className="fz-tab-pill"
        style={{ transform: `translateX(${pill.x}px)`, width: pill.w, opacity: pill.visible ? 1 : 0 }}
      />
      {TAB_ITEMS.map(renderTab)}
    </nav>
  )
}
