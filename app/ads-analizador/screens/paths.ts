/**
 * Las URLs de la mini-app.
 *
 * Módulo plano —sin `'use client'`— porque lo consume `generateStaticParams`.
 *
 * El id de la campaña va en el query (`/campana?id=…`) y no en el path: así
 * todas las URLs siguen siendo enumerables en el build y la ruta queda
 * estática, sin render bajo demanda.
 */
export const BASE = '/ads-analizador'

export const STATIC_PATHS = [
  BASE,
  `${BASE}/agregar`,
  `${BASE}/campana`,
  `${BASE}/ajustes`,
] as const

export const rutas = {
  home: BASE,
  agregar: `${BASE}/agregar`,
  campana: (id: string) => `${BASE}/campana?id=${id}`,
  ajustes: (id: string) => `${BASE}/ajustes?id=${id}`,
}
