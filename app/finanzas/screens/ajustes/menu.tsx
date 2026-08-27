'use client'

import { IconCategory, IconCoins, IconReportMoney, IconUserCircle, IconUsersGroup } from '@tabler/icons-react'
import { CURRENCY_META } from '@/lib/finanzas/types'
import { useBudgetViewPref } from '../../components/budget-view-pref'
import { useFinanzas } from '../../components/data-context'
import { PageHeader } from '../../components/tx-row'
import { BUDGET_VIEW_OPTIONS } from './presupuesto'
import { AJUSTES_HOME, SettingsMenu, SettingsPage, type SettingsMenuItem } from './shared'

/**
 * El índice de Ajustes.
 *
 * Antes era una sola pantalla con cuatro paneles apilados: había que scrollear
 * media página para llegar a Personas y las dos listas de categorías competían
 * por el mismo alto. Cada ajuste vive ahora en su propia URL —así se puede
 * entrar directo o compartir el enlace— y esto queda como la puerta.
 *
 * Cada fila dice en qué estado está su sección, igual que las cards de "Más":
 * el menú no debería obligar a entrar solo para ver qué hay configurado.
 */
export function AjustesScreen() {
  const { categories, people, rates, profiles } = useFinanzas()
  const { mode } = useBudgetViewPref()

  const bob = rates.BOB ?? CURRENCY_META.BOB.defaultRate
  const activas = categories.filter(c => !c.archived).length
  const personasActivas = people.filter(p => !p.archived).length

  const items: SettingsMenuItem[] = [
    {
      href: `${AJUSTES_HOME}/presupuesto`,
      label: 'Presupuesto',
      description: 'Cómo se ve el progreso: lo gastado o lo que queda',
      Icon: IconReportMoney,
      meta: BUDGET_VIEW_OPTIONS.find(o => o.value === mode)?.label,
    },
    {
      href: `${AJUSTES_HOME}/tipo-de-cambio`,
      label: 'Tipo de cambio',
      description: 'Cotizaciones automáticas o fijadas a mano · igual en todos los perfiles',
      Icon: IconCoins,
      meta: <span className="fz-num">Bs {bob.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>,
    },
    {
      href: `${AJUSTES_HOME}/categorias`,
      label: 'Categorías',
      description: 'Las de gasto y las de ingreso, cada una por su lado',
      Icon: IconCategory,
      meta: categories.length ? `${activas}` : undefined,
    },
    {
      href: `${AJUSTES_HOME}/perfiles`,
      label: 'Perfiles',
      description: 'Separa finanzas que no tienen nada que ver entre sí',
      Icon: IconUserCircle,
      meta: profiles.length > 1 ? `${profiles.length}` : undefined,
    },
    {
      href: `${AJUSTES_HOME}/personas`,
      label: 'Personas',
      description: 'Con quiénes compartes gastos',
      Icon: IconUsersGroup,
      meta: people.length ? `${personasActivas}` : undefined,
    },
  ]

  return (
    <SettingsPage>
      <PageHeader title="Ajustes" subtitle="Cómo funciona tu app" />
      <SettingsMenu items={items} />
    </SettingsPage>
  )
}
