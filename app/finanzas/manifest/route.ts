/**
 * El manifest de Finanzas.
 *
 * Va como ruta dentro de la mini-app y no en `app/manifest.ts` a propósito: el
 * archivo de convención de Next inyecta el enlace en TODAS las páginas del Hub,
 * y las notificaciones son solo de Finanzas. Esto lo enlaza únicamente el
 * layout de esta ruta.
 *
 * `start_url` apunta a /finanzas porque es lo que se instala: quien agrega esto
 * a su pantalla de inicio quiere abrir Finanzas, no el portal del Hub.
 */
export function GET() {
  return Response.json(
    {
      // "Plata" y no "Finanzas": es la palabra que usa la app en todas partes
      // ("dónde tenés tu plata", "la plata es fungible"), entra sin truncarse
      // bajo el ícono de iOS, y sirve igual para el perfil personal y el de
      // empresa. `short_name` es el que iOS pone en la pantalla de inicio.
      name: 'Plata',
      short_name: 'Plata',
      description: 'Tus finanzas personales',
      start_url: '/finanzas',
      scope: '/finanzas',
      display: 'standalone',
      background_color: '#12281D',
      theme_color: '#F3F4F6',
      lang: 'es',
      icons: [
        { src: '/finanzas/icon-180', sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` deja que Android recorte el ícono a la forma del sistema.
        // El dibujo va centrado con margen suficiente para aguantar el recorte.
        { src: '/finanzas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
