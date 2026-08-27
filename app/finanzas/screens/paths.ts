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
  '/finanzas/presupuesto',
  '/finanzas/ahorro',
  '/finanzas/mas',
  '/finanzas/ajustes',
  // Ajustes es un menú: cada sección es su propia URL, prerenderizada igual
  // que las demás, para poder entrar directo o compartir el enlace.
  '/finanzas/ajustes/presupuesto',
  '/finanzas/ajustes/tipo-de-cambio',
  '/finanzas/ajustes/categorias',
  '/finanzas/ajustes/categorias/gasto',
  '/finanzas/ajustes/categorias/ingreso',
  '/finanzas/ajustes/personas',
  '/finanzas/ajustes/perfiles',
] as const

export type ScreenPath = (typeof SCREEN_PATHS)[number]
