/**
 * Las URLs que atiende la mini-app.
 *
 * Vive en un módulo plano —sin `'use client'`— a propósito: lo consume
 * `generateStaticParams`, que corre en el build del servidor. Exportado desde
 * el módulo de pantallas, que sí es cliente, el servidor recibía una referencia
 * en lugar del array y el build fallaba al intentar recorrerlo.
 */
export const SCREEN_PATHS = [
  '/finanzas',
  '/finanzas/movimientos',
  '/finanzas/cuentas',
  '/finanzas/fijos',
  '/finanzas/deudas',
  '/finanzas/pasanaku',
  '/finanzas/mas',
  '/finanzas/ajustes',
] as const

export type ScreenPath = (typeof SCREEN_PATHS)[number]
