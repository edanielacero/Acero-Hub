'use client'

import type { ReactNode } from 'react'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { IconChevronLeft, IconChevronRight, type TablerIcon } from '@tabler/icons-react'
import { FzLink } from '../../components/router'
import { PageHeader } from '../../components/tx-row'
import { IconChip, Panel } from '../../components/ui'

/** La raíz del menú: todas las hojas de ajustes vuelven acá por defecto. */
export const AJUSTES_HOME = '/finanzas/ajustes'

/**
 * Cabecera de una hoja de ajustes.
 *
 * El enlace de vuelta va ARRIBA del título y no en la esquina: en móvil no hay
 * barra superior donde colgarlo, y estas pantallas son las únicas de la
 * mini-app que se anidan — sin él, salir de "Categorías de gasto" dependería
 * del botón atrás del navegador, que en la app instalada no siempre está.
 */
export function SettingsHeader({ title, action, back = AJUSTES_HOME, backLabel = 'Ajustes' }: {
  title: ReactNode
  action?: ReactNode
  back?: string
  backLabel?: string
}) {
  return (
    <>
      <FzLink
        href={back}
        className="inline-flex items-center gap-0.5 -ml-1 mb-2 text-[13px] font-semibold text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]"
      >
        <IconChevronLeft size={16} stroke={2.2} />
        {backLabel}
      </FzLink>
      <PageHeader title={title} action={action} />
    </>
  )
}

export interface SettingsMenuItem {
  href: string
  label: string
  description: string
  Icon: TablerIcon
  /** Estado actual de esa sección — el menú no es una lista muerta. */
  meta?: ReactNode
}

/**
 * El menú de ajustes: filas en un solo panel, no cards sueltas como en "Más".
 *
 * La diferencia es deliberada — "Más" indexa secciones que son destinos por
 * derecho propio; esto es un ajuste dentro de otro, y la lista agrupada es lo
 * que lo dice sin necesidad de explicarlo.
 */
export function SettingsMenu({ items }: { items: SettingsMenuItem[] }) {
  return (
    <Panel pad={false}>
      <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
        {items.map(item => (
          <SettingsMenuRow key={item.href} item={item} />
        ))}
      </div>
    </Panel>
  )
}

function SettingsMenuRow({ item }: { item: SettingsMenuItem }) {
  const { Icon } = item
  return (
    <FzLink
      href={item.href}
      /* Las filas son transparentes sobre el panel, así que el hover no puede
         ser un `brightness` como en las cards de "Más": no hay fondo propio que
         oscurecer. Pinta el hundido y se recorta contra las esquinas del panel. */
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--fz-surface-sunk)] active:bg-[var(--fz-surface-sunk)] first:rounded-t-[var(--fz-r-card)] last:rounded-b-[var(--fz-r-card)]"
    >
      <IconChip>
        <Icon size={20} stroke={1.9} />
      </IconChip>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-[16px] font-semibold tracking-[-0.01em] truncate">{item.label}</span>
          {/* Igual que en "Más": el meta se reserva su ancho a la derecha y no
              empuja al título, así un valor largo no lo corta a la mitad. */}
          {item.meta && (
            <span className="text-[13px] font-semibold shrink-0 ml-auto text-[var(--fz-ink-2)]">{item.meta}</span>
          )}
        </span>
        <span className="block mt-0.5 text-[13px] text-[var(--fz-ink-2)] leading-snug">{item.description}</span>
      </span>
      <IconChevronRight size={18} stroke={2} className="text-[var(--fz-ink-3)] shrink-0 self-center" />
    </FzLink>
  )
}

/** Envoltura común de las hojas: el mismo padding que el resto de pantallas. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">{children}</div>
}

/** Sensores compartidos por las listas arrastrables de Ajustes — mismo
    umbral que ya usa Cuentas: `distance: 6` deja que un tap normal (editar,
    abrir el menú) no dispare un drag por 1px de temblor del dedo. */
export function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}
