/**
 * Las URLs sin parámetro de la mini-app.
 *
 * Módulo plano —sin `'use client'`— porque lo consume `generateStaticParams`,
 * que corre en el build del servidor: exportado desde un módulo de cliente, el
 * servidor recibiría una referencia en lugar del array.
 */
export const STATIC_PATHS = [
  '/expandlogy',
  '/expandlogy/onboardings',
  '/expandlogy/ad-generator',
  '/expandlogy/campanas',
  '/expandlogy/pagos',
] as const

/**
 * El detalle de cliente lleva un id que sale de los datos, así que no se puede
 * prerenderizar: `/expandlogy/clients/<id>` lo resuelve el router en el cliente.
 */
export const CLIENTS_SEGMENT = 'clients'
