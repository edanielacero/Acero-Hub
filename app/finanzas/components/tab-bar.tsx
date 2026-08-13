'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconHome2, IconHome2Filled, IconListDetails, IconListDetailsFilled,
  IconCompass, IconCompassFilled, IconChartPie, IconChartPieFilled, IconPlus,
} from '@tabler/icons-react'
import { useQuickAdd } from './quick-add-context'

const TABS = [
  { href: '/finanzas', label: 'Inicio', Icon: IconHome2, IconActive: IconHome2Filled, exact: true },
  { href: '/finanzas/transacciones', label: 'Movimientos', Icon: IconListDetails, IconActive: IconListDetailsFilled, exact: false },
]

const TABS_RIGHT = [
  { href: '/finanzas/planificacion', label: 'Planificación', Icon: IconCompass, IconActive: IconCompassFilled, exact: false },
  { href: '/finanzas/reportes', label: 'Reportes', Icon: IconChartPie, IconActive: IconChartPieFilled, exact: false },
]

const ALL_TABS = [...TABS, ...TABS_RIGHT]

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href)
}

export default function TabBar() {
  const pathname = usePathname()
  const { openQuickAdd } = useQuickAdd()
  const navRef = useRef<HTMLElement | null>(null)
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [pill, setPill] = useState<{ x: number; visible: boolean }>({ x: 0, visible: false })

  const activeHref = ALL_TABS.find(t => isActive(pathname, t.href, t.exact))?.href

  useLayoutEffect(() => {
    function measure() {
      const nav = navRef.current
      const el = activeHref ? tabRefs.current[activeHref] : null
      if (!nav || !el) {
        setPill(p => (p.visible ? { ...p, visible: false } : p))
        return
      }
      // Medido en coordenadas de viewport (getBoundingClientRect) en vez de
      // offsetLeft: evita cualquier ambigüedad entre el borde de borde/padding
      // del contenedor. nav.clientLeft (= su border-left-width real) corrige
      // el único desfase que sí importa, sin asumir ningún valor fijo.
      const navRect = nav.getBoundingClientRect()
      const tabRect = el.getBoundingClientRect()
      setPill({ x: tabRect.left - navRect.left - nav.clientLeft, visible: true })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeHref])

  function renderTab(tab: (typeof ALL_TABS)[number]) {
    const active = isActive(pathname, tab.href, tab.exact)
    const TabIcon = active ? tab.IconActive : tab.Icon
    return (
      <Link key={tab.href} href={tab.href}
        ref={el => { tabRefs.current[tab.href] = el }}
        className={`fz-tab ${active ? 'fz-tab-active' : ''}`}
        aria-label={tab.label} aria-current={active ? 'page' : undefined}>
        <TabIcon size={23} stroke={1.7} />
      </Link>
    )
  }

  return (
    <nav className="fz-tabbar" ref={navRef}>
      <div className="fz-tab-pill" style={{ transform: `translate(${pill.x}px, -50%)`, opacity: pill.visible ? 1 : 0 }} />
      {TABS.map(renderTab)}
      <button onClick={() => openQuickAdd()} className="fz-tab-action" aria-label="Nueva transacción">
        <span className="fz-tab-action-badge">
          <IconPlus size={18} stroke={2.4} />
        </span>
      </button>
      {TABS_RIGHT.map(renderTab)}
    </nav>
  )
}
