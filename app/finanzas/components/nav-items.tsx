import {
  IconCoin, IconCoinFilled, IconDots, IconDotsFilled, IconHome2, IconHome2Filled,
  IconReceipt, IconReceiptFilled, IconReportMoney, IconRotateClockwise2, IconSettings, IconSettingsFilled,
  IconUsersGroup, IconRepeat,
} from '@tabler/icons-react'

export interface NavItem {
  href: string
  label: string
  exact?: boolean
  /**
   * Si ocupa una de las ranuras de la tab bar. Todo lo que no lleva `tab`
   * cae automáticamente en "Más": agregar una sección nueva a NAV_ITEMS es
   * lo único que hace falta para que aparezca ahí.
   */
  tab?: boolean
  /** Bajada de la card en /finanzas/mas. La tab bar solo muestra el label. */
  description?: string
  Icon: typeof IconHome2
  IconActive: typeof IconHome2
}

/** Todos los destinos reales, en el orden de la sidebar de escritorio. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/finanzas',              label: 'Inicio',       exact: true, tab: true, Icon: IconHome2,   IconActive: IconHome2Filled },
  { href: '/finanzas/movimientos',  label: 'Movimientos',               tab: true, Icon: IconReceipt, IconActive: IconReceiptFilled },
  {
    href: '/finanzas/fijos', label: 'Gastos Fijos', tab: true,
    description: 'Lo que pagás todos los meses',
    Icon: IconRepeat, IconActive: IconRepeat,
  },
  {
    href: '/finanzas/deudas', label: 'Deudas',
    description: 'Lo que te deben, venga de donde venga',
    Icon: IconUsersGroup, IconActive: IconUsersGroup,
  },
  {
    href: '/finanzas/pasanaku', label: 'Pasanaku',
    description: 'Tus aportes y cuándo te toca recibir',
    Icon: IconRotateClockwise2, IconActive: IconRotateClockwise2,
  },
  {
    href: '/finanzas/presupuesto', label: 'Presupuesto',
    description: 'Cuánto te queda por categoría, y en general',
    Icon: IconReportMoney, IconActive: IconReportMoney,
  },
  { href: '/finanzas/cuentas',      label: 'Cuentas',                   tab: true, Icon: IconCoin,    IconActive: IconCoinFilled },
  {
    href: '/finanzas/ajustes', label: 'Ajustes',
    description: 'Tasas de cambio, categorías y personas',
    Icon: IconSettings, IconActive: IconSettingsFilled,
  },
]

/**
 * "Más" no es una sección: es la puerta a las que no entran en la tab bar.
 * Por eso vive fuera de NAV_ITEMS — en escritorio la sidebar lista los
 * destinos reales y este ítem no tiene nada que hacer ahí.
 */
export const MORE_ITEM: NavItem = {
  href: '/finanzas/mas', label: 'Más',
  Icon: IconDots, IconActive: IconDotsFilled,
}

/** Lo que se muestra como cards dentro de /finanzas/mas. */
export const MORE_ITEMS: NavItem[] = NAV_ITEMS.filter(i => !i.tab)

/** Los destinos de la tab bar, en orden. */
export const TAB_ITEMS: NavItem[] = [...NAV_ITEMS.filter(i => i.tab), MORE_ITEM]

export function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href)
}

/**
 * Qué pestaña se pinta activa. Estando en Deudas o Ajustes ninguna de la
 * tab bar coincide con la URL, pero la barra no puede quedarse sin pestaña
 * activa: en ese caso el pill va a "Más", que es de donde saliste.
 */
export function activeTabHref(pathname: string): string | undefined {
  const direct = TAB_ITEMS.find(t => isActive(pathname, t.href, t.exact))
  if (direct) return direct.href
  return MORE_ITEMS.some(i => isActive(pathname, i.href, i.exact)) ? MORE_ITEM.href : undefined
}
