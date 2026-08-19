'use client'

import type { TablerIcon } from '@tabler/icons-react'
import {
  IconToolsKitchen2, IconCoffee, IconCar, IconGasStation, IconBus, IconBike,
  IconHome, IconBolt, IconDroplet, IconDeviceMobile, IconHeartbeat, IconDumbbell,
  IconBarbell, IconSparkles, IconMovie, IconMusic, IconBook2, IconShoppingBag, IconPaw,
  IconPlane, IconGift, IconTool, IconPackage, IconBriefcase, IconDeviceLaptop,
  IconChartBar, IconPigMoney, IconCoins, IconCreditCard, IconWallet, IconTag,
} from '@tabler/icons-react'
import { IconChip, tintVars } from './ui'

/**
 * El set curado de íconos de línea para categorías y fijos — reemplaza al
 * emoji (§13-15 de contexto_ui_finanzas.md). Un slug de texto en vez de un
 * carácter: no depende de la plataforma, y se pinta siempre del mismo tinte
 * neutro en vez de traer su propia paleta — es la FORMA la que dice de qué
 * categoría se trata, no un color distinto por cada una.
 *
 * Más grande que las 14 categorías semilla a propósito: es también el catálogo
 * que ofrece <IconPickerGrid> para categorías y fijos creados a mano.
 */
export const CATEGORY_ICONS: Record<string, TablerIcon> = {
  comida: IconToolsKitchen2,
  cafe: IconCoffee,
  transporte: IconCar,
  combustible: IconGasStation,
  bus: IconBus,
  bici: IconBike,
  vivienda: IconHome,
  servicios: IconBolt,
  agua: IconDroplet,
  suscripciones: IconDeviceMobile,
  salud: IconHeartbeat,
  deporte: IconDumbbell,
  gym: IconBarbell,
  personal: IconSparkles,
  ocio: IconMovie,
  musica: IconMusic,
  educacion: IconBook2,
  compras: IconShoppingBag,
  mascota: IconPaw,
  viaje: IconPlane,
  regalo: IconGift,
  herramientas: IconTool,
  otros: IconPackage,
  sueldo: IconBriefcase,
  freelance: IconDeviceLaptop,
  extraordinario: IconGift,
  inversion: IconChartBar,
  ahorro: IconPigMoney,
  'otros-ingreso': IconCoins,
  tarjeta: IconCreditCard,
  billetera: IconWallet,
  etiqueta: IconTag,
}

/** Orden de presentación en la grilla de selección de Ajustes. */
const ICON_PICKER_ORDER = Object.keys(CATEGORY_ICONS)

/**
 * Chip de categoría: ícono de línea sobre el tinte neutro, o —si el slug no
 * está en el catálogo— la inicial del nombre. Un solo fallback, no los tres
 * que había antes (`?? '•'`, `?? name.charAt(0)` repetido en cada pantalla).
 * Siempre neutro: ver la nota de §5 en contexto_ui_finanzas.md.
 */
export function CategoryIcon({ slug, name, size = 40 }: {
  slug?: string | null
  name: string
  size?: number
}) {
  const Icon = slug ? CATEGORY_ICONS[slug] : undefined
  return (
    <IconChip size={size}>
      {Icon ? <Icon size={size * 0.45} stroke={1.8} /> : (name.trim().charAt(0).toUpperCase() || '•')}
    </IconChip>
  )
}

/** El glifo solo, sin el chip cuadrado detrás — para meterlo dentro de una
    pastilla (categoría del quick-add, de un fijo) donde ya hay su propio
    fondo. `currentColor` para heredar el color del texto del botón. */
export function CategoryGlyph({ slug, size = 15 }: { slug?: string | null; size?: number }) {
  const Icon = slug ? CATEGORY_ICONS[slug] : undefined
  if (!Icon) return null
  return <Icon size={size} stroke={2} aria-hidden />
}

export function IconPickerGrid({ value, onChange }: {
  value: string | null
  onChange: (slug: string) => void
}) {
  return (
    <div className="grid grid-cols-6 min-[420px]:grid-cols-8 gap-2" role="listbox" aria-label="Elegir ícono">
      {ICON_PICKER_ORDER.map(slug => {
        const Icon = CATEGORY_ICONS[slug]
        const active = value === slug
        return (
          <button
            key={slug}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onChange(slug)}
            title={slug}
            className={`grid place-items-center aspect-square rounded-[var(--fz-r-chip)] transition-[transform,box-shadow] active:scale-90 ${
              active ? 'ring-2 ring-[var(--fz-accent)] ring-offset-2 ring-offset-[var(--fz-surface)]' : ''
            }`}
            style={tintVars('neutral')}
          >
            <Icon size={18} stroke={1.8} />
          </button>
        )
      })}
    </div>
  )
}
