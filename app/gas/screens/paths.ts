/**
 * Las URLs sin parámetro de la mini-app.
 *
 * Módulo plano —sin `'use client'`— porque lo consume `generateStaticParams`,
 * que corre en el build del servidor: exportado desde un módulo de cliente, el
 * servidor recibiría una referencia en lugar del array.
 *
 * Una sola: el historial dejó de ser una pantalla aparte y vive en la mitad de
 * abajo de la home, filtrado por el auto que esté seleccionado en el carrusel.
 */
export const STATIC_PATHS = [
  '/gas',
] as const
