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
      name: 'Finanzas',
      short_name: 'Finanzas',
      description: 'Tus finanzas personales',
      start_url: '/finanzas',
      scope: '/finanzas',
      display: 'standalone',
      background_color: '#F3F4F6',
      theme_color: '#F3F4F6',
      lang: 'es',
      icons: [
        { src: '/finanzas/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
