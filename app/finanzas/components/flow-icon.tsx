'use client'

import { createElement, forwardRef } from 'react'
import type { IconProps, TablerIcon } from '@tabler/icons-react'

/**
 * Gasto e Ingreso con los íconos reales que pidió el usuario — cash e
 * withdraw de SVG Repo (svgrepo.com, sets de uso libre), no un armado propio
 * con piezas de Tabler. Los .svg tal como se bajaron viven en ./icons/ —
 * esto reexporta sus paths como componentes React, mismo criterio que
 * <CurrencyIcon> con las banderas de moneda: van inline y no como
 * `<img src>` para no depender de un archivo estático ni parpadear al cargar.
 *
 * Son `filled` (relleno sólido, sin trazo) y no `outline` como el resto de
 * los íconos de línea de Tabler que usa la app — por eso la fábrica pinta
 * con `fill`, no con `stroke`. `currentColor` es lo que los deja heredar el
 * tinte del chip que los rodea (in/out/neutral, ver tintVars en ui.tsx) en
 * vez de quedar pegados al negro del archivo original. `fillRule`/`clipRule`
 * se preservan por path porque acá sí importan: son los que recortan el
 * agujero de la moneda y el marco de la caja en vez de pintarlos macizos.
 */
interface FlowPath {
  d: string
  fillRule?: 'evenodd' | 'nonzero'
  clipRule?: 'evenodd' | 'nonzero'
}

function createFilledIcon(displayName: string, viewBox: string, paths: FlowPath[]): TablerIcon {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    ({ color = 'currentColor', size = 24, stroke: _stroke, title, className, children, ...rest }, ref) =>
      createElement(
        'svg',
        {
          ref,
          xmlns: 'http://www.w3.org/2000/svg',
          width: size,
          height: size,
          viewBox,
          fill: color,
          stroke: 'none',
          className,
          ...rest,
        },
        [
          title && createElement('title', { key: 'svg-title' }, title),
          ...paths.map((p, i) => createElement('path', {
            key: `svg-${i}`,
            d: p.d,
            fillRule: p.fillRule,
            clipRule: p.clipRule,
          })),
          ...(Array.isArray(children) ? children : [children]),
        ],
      ),
  )
  Component.displayName = displayName
  return Component as unknown as TablerIcon
}

/** cash.svg — plata que entra. */
export const IconIngreso = createFilledIcon('IconIngreso', '0 0 24 24', [
  { d: 'M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16ZM12 14.0967C10.842 14.0967 9.90331 13.158 9.90331 12C9.90331 10.842 10.842 9.90331 12 9.90331C13.158 9.90331 14.0967 10.842 14.0967 12C14.0967 13.158 13.158 14.0967 12 14.0967Z', fillRule: 'evenodd', clipRule: 'evenodd' },
  { d: 'M7 12C7 12.5523 6.55229 13 6 13C5.44772 13 5 12.5523 5 12C5 11.4477 5.44772 11 6 11C6.55229 11 7 11.4477 7 12Z' },
  { d: 'M18 13C18.5523 13 19 12.5523 19 12C19 11.4477 18.5523 11 18 11C17.4477 11 17 11.4477 17 12C17 12.5523 17.4477 13 18 13Z' },
  { d: 'M21 5C22.6569 5 24 6.34315 24 8V16C24 17.6569 22.6569 19 21 19H3C1.34315 19 0 17.6569 0 16V8C0 6.34315 1.34315 5 3 5H21ZM4 7H20C20 7.26264 20.0517 7.52272 20.1522 7.76537C20.2528 8.00802 20.4001 8.2285 20.5858 8.41421C20.7715 8.59993 20.992 8.74725 21.2346 8.84776C21.4773 8.94827 21.7374 9 22 9V15C21.7374 15 21.4773 15.0517 21.2346 15.1522C20.992 15.2528 20.7715 15.4001 20.5858 15.5858C20.4001 15.7715 20.2528 15.992 20.1522 16.2346C20.0517 16.4773 20 16.7374 20 17H4C4 16.7374 3.94827 16.4773 3.84776 16.2346C3.74725 15.992 3.59993 15.7715 3.41421 15.5858C3.2285 15.4001 3.00802 15.2528 2.76537 15.1522C2.52272 15.0517 2.26264 15 2 15V9C2.26264 9 2.52272 8.94827 2.76537 8.84776C3.00802 8.74725 3.2285 8.59993 3.41421 8.41421C3.59993 8.2285 3.74725 8.00802 3.84776 7.76537C3.94827 7.52272 4 7.26264 4 7Z', fillRule: 'evenodd', clipRule: 'evenodd' },
])

/** withdraw.svg — plata que sale. */
export const IconGasto = createFilledIcon('IconGasto', '0 0 24 24', [
  { d: 'M12 9C11.4477 9 11 9.44771 11 10V15.5856L9.70711 14.2928C9.3166 13.9024 8.68343 13.9024 8.29292 14.2928C7.90236 14.6834 7.90236 15.3165 8.29292 15.7071L11.292 18.7063C11.6823 19.0965 12.3149 19.0968 12.7055 18.707L15.705 15.7137C16.0955 15.3233 16.0955 14.69 15.705 14.2996C15.3145 13.909 14.6814 13.909 14.2908 14.2996L13 15.5903V10C13 9.44771 12.5523 9 12 9Z' },
  { d: 'M21 1C22.6569 1 24 2.34315 24 4V8C24 9.65685 22.6569 11 21 11H19V20C19 21.6569 17.6569 23 16 23H8C6.34315 23 5 21.6569 5 20V11H3C1.34315 11 0 9.65685 0 8V4C0 2.34315 1.34315 1 3 1H21ZM22 8C22 8.55228 21.5523 9 21 9H19V7H20C20.5523 7 21 6.55229 21 6C21 5.44772 20.5523 5 20 5H4C3.44772 5 3 5.44772 3 6C3 6.55229 3.44772 7 4 7H5V9H3C2.44772 9 2 8.55228 2 8V4C2 3.44772 2.44772 3 3 3H21C21.5523 3 22 3.44772 22 4V8ZM7 7V20C7 20.5523 7.44772 21 8 21H16C16.5523 21 17 20.5523 17 20V7H7Z', fillRule: 'evenodd', clipRule: 'evenodd' },
])
