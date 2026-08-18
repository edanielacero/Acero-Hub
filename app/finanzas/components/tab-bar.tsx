'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef, useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { NAV_ITEMS, isActive } from './nav-items'
import { useQuickAdd } from './quick-add-context'

/**
 * Tab bar de vidrio, a todo el ancho y anclada al borde inferior.
 * Ver documentos/finanzas/contexto_ui_finanzas.md §6.
 * El (+) va al medio, partiendo los 4 items en dos y dos.
 */
export function TabBar() {
  const pathname = usePathname()
  const openQuickAdd = useQuickAdd()
  const navRef = useRef<HTMLElement | null>(null)
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [pill, setPill] = useState<{ x: number; w: number; visible: boolean }>({ x: 0, w: 0, visible: false })

  const activeHref = NAV_ITEMS.find(t => isActive(pathname, t.href, t.exact))?.href

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

  const left = NAV_ITEMS.slice(0, 2)
  const right = NAV_ITEMS.slice(2)

  const renderTab = (item: (typeof NAV_ITEMS)[number]) => {
    const active = item.href === activeHref
    const Glyph = active ? item.IconActive : item.Icon
    return (
      <Link
        key={item.href}
        href={item.href}
        ref={el => { tabRefs.current[item.href] = el }}
        aria-current={active ? 'page' : undefined}
        className={`fz-tab ${active ? 'fz-tab-active' : ''}`}
      >
        <Glyph size={22} stroke={1.8} />
        <span className="fz-tab-label">{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      <nav ref={navRef} className="fz-tabbar" aria-label="Navegación de Finanzas">
        {/* useLayoutEffect y no useEffect: mide y posiciona antes del paint, si no
            el pill se ve saltar desde x=0 en la primera carga. */}
        <span
          className="fz-tab-pill"
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w, opacity: pill.visible ? 1 : 0 }}
        />
        {left.map(renderTab)}
        <button type="button" onClick={openQuickAdd} className="fz-tab-action" aria-label="Nuevo movimiento">
          <span className="fz-tab-action-badge"><IconPlus size={24} stroke={2.4} /></span>
        </button>
        {right.map(renderTab)}
      </nav>
    </>
  )
}
