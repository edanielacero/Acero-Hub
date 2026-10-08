'use client'

import { IconBrandWhatsapp, IconChevronRight, IconPhoneCall, IconShoppingCart } from '@tabler/icons-react'
import type { CampanaConEstado, TipoConversion } from '@/lib/ads-analizador/types'
import { fmtEntero, fmtMoneda } from '@/lib/ads-analizador/format'
import { colorPorResultado } from '@/lib/ads-analizador/load'
import { AdsLink } from '../router'
import { rutas } from '../screens/paths'
import { RoasMedidor } from './roas-badge'
import { Chip, PillEstado, estiloModo } from './ui'

export function TipoChip({ tipo }: { tipo: TipoConversion }) {
  if (tipo === 'compra_stripe') return <Chip icono={<IconShoppingCart size={13} />}>Compras</Chip>
  if (tipo === 'llamadas') return <Chip icono={<IconPhoneCall size={13} />}>Llamadas</Chip>
  return <Chip icono={<IconBrandWhatsapp size={13} />}>WhatsApp</Chip>
}

export function CampaignCard({ item }: { item: CampanaConEstado }) {
  const { campana: c, estado: e, totales: t, modo } = item
  const pausada = !c.activo
  // El medidor y el color son de toda la campaña; la píldora dice el modo (en
  // ciclo, cierre por revisar) y, en curso, el resultado total.
  const total = item.estadoTotal ?? e
  const color = colorPorResultado(total)
  const resultado = color ? { color, accion: 'esperar' } : { color: e.color, accion: 'sin_datos' }

  return (
    <AdsLink
      href={rutas.campana(c.id)}
      className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--ads-hairline)] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--ads-hairline-2)] hover:shadow-[0_8px_24px_-8px_rgba(16,24,40,0.15)] ${pausada ? 'opacity-70' : ''}`}
    >
      {/* Franja de color a la izquierda: el semáforo se lee antes que el texto. */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: pausada ? 'var(--ads-hairline-2)' : estiloModo(modo, modo === 'en_curso' ? resultado : e).punto }} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-[-0.01em]">{c.nombre}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TipoChip tipo={c.tipoConversion} />
            <Chip>{c.moneda}</Chip>
          </div>
        </div>
        {pausada ? <Chip>Pausada</Chip> : <PillEstado estado={modo === 'en_curso' ? resultado : e} modo={modo} />}
      </div>

      <RoasMedidor estado={total} compacto />

      <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[var(--ads-hairline)] pt-4">
        <Mini etiqueta="Gasto" valor={fmtMoneda(t.gasto, c.moneda)} />
        <Mini etiqueta={c.tipoConversion === 'compra_stripe' ? 'Compras' : c.tipoConversion === 'llamadas' ? 'Cierres' : 'Ventas'} valor={fmtEntero(t.conversiones)} />
        <Mini etiqueta="Costo/venta" valor={t.costoPorConversion == null ? '—' : fmtMoneda(t.costoPorConversion, c.moneda)} />
      </div>

      <IconChevronRight size={18} className="absolute right-4 top-1/2 hidden -translate-y-1/2 text-[var(--ads-ink-3)] opacity-0 transition group-hover:opacity-100 lg:block" />
    </AdsLink>
  )
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--ads-ink-3)]">{etiqueta}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{valor}</p>
    </div>
  )
}
