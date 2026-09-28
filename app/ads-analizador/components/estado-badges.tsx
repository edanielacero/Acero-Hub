'use client'

import { IconAlertTriangle, IconClockHour4, IconFlame, IconRefresh, IconSchool, IconUsers } from '@tabler/icons-react'
import type { Bandera } from '@/lib/ads-analizador/types'
import { fechaCorta } from '@/lib/ads-analizador/calc'

function texto(b: Bandera): { icono: React.ReactNode; texto: string; tono: 'rojo' | 'amarillo' | 'neutro' } {
  switch (b.tipo) {
    case 'foco_rojo':
      return {
        icono: <IconFlame size={14} />, tono: 'rojo',
        texto: b.motivo === 'gasto_sin_resultados' ? 'Gasto sin ventas' : 'Días sin ventas',
      }
    case 'en_aprendizaje':
      return { icono: <IconSchool size={14} />, tono: 'amarillo', texto: `Aprendizaje · ${b.resultados7d}/50` }
    case 'muestra_chica':
      return { icono: <IconAlertTriangle size={14} />, tono: 'amarillo', texto: `Muestra chica · ${b.conversiones}` }
    case 'reajuste_tecnico':
      return { icono: <IconRefresh size={14} />, tono: 'neutro', texto: `Reajuste hasta ${fechaCorta(b.hasta)}` }
    case 'ventana_decision':
      return { icono: <IconClockHour4 size={14} />, tono: 'neutro', texto: `Decidir desde ${fechaCorta(b.hasta)}` }
    case 'fatiga_audiencia':
      return { icono: <IconUsers size={14} />, tono: 'amarillo', texto: `Frecuencia ${b.frecuencia.toFixed(1)}` }
  }
}

const TONOS = {
  rojo: 'bg-[var(--ads-rojo-tint)] text-[var(--ads-rojo)] ring-[var(--ads-rojo-line)]',
  amarillo: 'bg-[var(--ads-amarillo-tint)] text-[var(--ads-amarillo)] ring-[var(--ads-amarillo-line)]',
  neutro: 'bg-[var(--ads-accent-tint)] text-[var(--ads-accent-press)] ring-[#C7D4FB]',
}

/** Una etiqueta por bandera activa. No decide el color de nada: lo explica. */
export function EstadoBadges({ banderas }: { banderas: Bandera[] }) {
  if (banderas.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {banderas.map(b => {
        const t = texto(b)
        return (
          <li key={b.tipo} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONOS[t.tono]}`}>
            {t.icono}{t.texto}
          </li>
        )
      })}
    </ul>
  )
}

/** Explicación larga de cada bandera, para el dashboard. */
export function explicacion(b: Bandera): string {
  switch (b.tipo) {
    case 'foco_rojo':
      return b.motivo === 'gasto_sin_resultados'
        ? 'Ya se gastó 2,5 veces el margen de una venta sin conseguir ninguna.'
        : '3 días seguidos con gasto y ninguna venta confirmada.'
    case 'en_aprendizaje':
      return `Meta necesita ~50 resultados en 7 días para estabilizarse. Van ${b.resultados7d}.`
    case 'muestra_chica':
      return `Con ${b.conversiones} ventas confirmadas cualquier ROAS puede ser casualidad.`
    case 'reajuste_tecnico':
      return `El algoritmo se está reacomodando al último cambio hasta el ${fechaCorta(b.hasta)}.`
    case 'ventana_decision':
      return `No hagas otro cambio grande antes del ${fechaCorta(b.hasta)}.`
    case 'fatiga_audiencia':
      return `La misma gente ve el anuncio ${b.frecuencia.toFixed(1)} veces: refresca el creativo o amplía la audiencia antes de subir presupuesto.`
  }
}
