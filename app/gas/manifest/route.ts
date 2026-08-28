/**
 * El manifest de Gas.
 *
 * Va como ruta dentro de la mini-app y no en `app/manifest.ts` a propósito: el
 * archivo de convención de Next inyecta el enlace en TODAS las páginas del Hub,
 * y esto es de Gas nomás. Lo enlaza únicamente el layout de esta ruta.
 *
 * `start_url` apunta a /gas porque es lo que se instala: quien agrega esto a su
 * pantalla de inicio quiere abrir Gas, no el portal del Hub.
 */
export function GET() {
  return Response.json(
    {
      // `short_name` es el que iOS pone bajo el ícono en la pantalla de inicio.
      name: 'Gas',
      short_name: 'Gas',
      description: 'Kilometraje y gasto por auto',
      start_url: '/gas',
      scope: '/gas',
      display: 'standalone',
      // El negro del ícono, para que la pantalla de arranque no destelle en
      // otro color antes de que cargue la app.
      background_color: '#14110B',
      // El canvas claro de la app, que es lo que se ve una vez abierta.
      theme_color: '#F2F1ED',
      lang: 'es',
      icons: [
        { src: '/gas/icon-180', sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: '/gas/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/gas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` deja que Android recorte el ícono a la forma del sistema.
        { src: '/gas/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
