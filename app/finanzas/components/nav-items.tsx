import {
  IconCoin, IconCoinFilled, IconHome2, IconHome2Filled,
  IconReceipt, IconReceiptFilled, IconSettings, IconSettingsFilled,
  IconUsersGroup, IconRepeat,
} from '@tabler/icons-react'

export interface NavItem {
  href: string
  label: string
  exact?: boolean
  /**
   * Si aparece en la tab bar. La tab bar son 4 pestañas + el FAB central: una
   * quinta baja los targets de 44px y descentra el botón de acción. Compartidos
   * vive en la sidebar y se llega desde la Home, que en móvil es donde
   * naturalmente lo buscás.
   */
  mobile: boolean
  Icon: typeof IconHome2
  IconActive: typeof IconHome2
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/finanzas',              label: 'Inicio',       exact: true, mobile: true,  Icon: IconHome2,      IconActive: IconHome2Filled },
  { href: '/finanzas/movimientos',  label: 'Movimientos',               mobile: true,  Icon: IconReceipt,    IconActive: IconReceiptFilled },
  { href: '/finanzas/fijos',        label: 'Fijos',                     mobile: false, Icon: IconRepeat,     IconActive: IconRepeat },
  { href: '/finanzas/compartidos',  label: 'Compartidos',               mobile: false, Icon: IconUsersGroup, IconActive: IconUsersGroup },
  { href: '/finanzas/cuentas',      label: 'Cuentas',                   mobile: true,  Icon: IconCoin,       IconActive: IconCoinFilled },
  { href: '/finanzas/ajustes',      label: 'Ajustes',                   mobile: true,  Icon: IconSettings,   IconActive: IconSettingsFilled },
]

/** Los 4 destinos de la tab bar, en orden. */
export const TAB_ITEMS: NavItem[] = NAV_ITEMS.filter(i => i.mobile)

export function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href)
}
