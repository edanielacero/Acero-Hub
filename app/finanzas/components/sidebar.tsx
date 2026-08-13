'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconHome2, IconListDetails, IconCompass, IconChartPie,
  IconWallet, IconCategory2, IconArrowsExchange, IconUsers, IconBell,
} from '@tabler/icons-react'
import { api } from '@/lib/finanzas/api-client'
import ProfileSwitcher from './profile-switcher'

const NAV = [
  { href: '/finanzas', label: 'Inicio', Icon: IconHome2, exact: true },
  { href: '/finanzas/transacciones', label: 'Movimientos', Icon: IconListDetails, exact: false },
  { href: '/finanzas/planificacion', label: 'Planificación', Icon: IconCompass, exact: false },
  { href: '/finanzas/reportes', label: 'Reportes', Icon: IconChartPie, exact: false },
]

const CONFIG = [
  { href: '/finanzas/cuentas', label: 'Cuentas', Icon: IconWallet },
  { href: '/finanzas/categorias', label: 'Categorías', Icon: IconCategory2 },
  { href: '/finanzas/tipo-cambio', label: 'Tipo de cambio', Icon: IconArrowsExchange },
  { href: '/finanzas/personas', label: 'Personas', Icon: IconUsers },
  { href: '/finanzas/alertas', label: 'Alertas', Icon: IconBell },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [name, setName] = useState('')

  useEffect(() => {
    api('/me').then(r => r.json()).then(j => setName(j.name ?? '')).catch(() => {})
  }, [])

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside className="fz-sidebar">
      <p className="text-[13px] font-semibold mb-3.5">Finanzas</p>

      <div className="mb-4">
        <ProfileSwitcher />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(item => (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium"
            style={{
              background: isActive(item.href, item.exact) ? 'hsl(0 0% 100% / 0.1)' : 'transparent',
              color: isActive(item.href, item.exact) ? 'var(--on-primary)' : 'hsl(0 0% 100% / 0.55)',
            }}>
            <item.Icon size={15} stroke={1.8} />
            {item.label}
          </Link>
        ))}
      </nav>

      <p className="text-[10px] uppercase tracking-wide mt-5 mb-1.5 px-2" style={{ color: 'hsl(0 0% 100% / 0.35)' }}>Configuración</p>
      <nav className="flex flex-col gap-0.5">
        {CONFIG.map(item => (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11.5px]"
            style={{
              background: isActive(item.href, false) ? 'hsl(0 0% 100% / 0.1)' : 'transparent',
              color: isActive(item.href, false) ? 'var(--on-primary)' : 'hsl(0 0% 100% / 0.55)',
            }}>
            <item.Icon size={14} stroke={1.8} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 pt-3.5" style={{ borderTop: '0.5px solid hsl(0 0% 100% / 0.15)' }}>
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: 'hsl(0 0% 100% / 0.15)' }}>
          {name.charAt(0).toUpperCase() || '·'}
        </span>
        <span className="text-[11px]">{name || '…'}</span>
      </div>
    </aside>
  )
}
