/**
 * Las URLs sin parámetro de la mini-app.
 *
 * Módulo plano —sin `'use client'`— porque lo consume `generateStaticParams`,
 * que corre en el build del servidor: exportado desde un módulo de cliente, el
 * servidor recibiría una referencia en lugar del array.
 *
 * Las URLs de sesión (`/trading-journal/<id>/…`) no están acá y no pueden
 * estarlo: el id sale de la base y es ilimitado. Se atienden con
 * `dynamicParams`, y la sub-pantalla la resuelve el router en el cliente.
 */
export const STATIC_PATHS = [
  '/trading-journal',
  '/trading-journal/notifications',
] as const

/**
 * Primeros segmentos que NO son un id de sesión. Si mañana se agrega otra
 * pantalla sin parámetro, va acá además de en STATIC_PATHS — si no, el router
 * la confundiría con una sesión.
 */
export const RESERVED_SEGMENTS = ['notifications'] as const

/** Sub-pantallas dentro de una sesión. La cadena vacía es el dashboard. */
export const SESSION_TABS = ['', 'stats', 'sweetspot', 'montecarlo', 'variables'] as const

export type SessionTab = (typeof SESSION_TABS)[number]
