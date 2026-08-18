import {
  IconCoin, IconCoinFilled, IconHome2, IconHome2Filled,
  IconReceipt, IconReceiptFilled, IconSettings, IconSettingsFilled,
} from '@tabler/icons-react'

export interface NavItem {
  href: string
  label: string
  exact?: boolean
  Icon: typeof IconHome2
  IconActive: typeof IconHome2
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/finanzas',             label: 'Inicio',      exact: true, Icon: IconHome2,    IconActive: IconHome2Filled },
  { href: '/finanzas/movimientos', label: 'Movimientos',              Icon: IconReceipt,  IconActive: IconReceiptFilled },
  { href: '/finanzas/cuentas',     label: 'Cuentas',                  Icon: IconCoin,     IconActive: IconCoinFilled },
  { href: '/finanzas/ajustes',     label: 'Ajustes',                  Icon: IconSettings, IconActive: IconSettingsFilled },
]

export function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href)
}
