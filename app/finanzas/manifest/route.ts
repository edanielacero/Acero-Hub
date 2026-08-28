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
      // `short_name` es el que iOS pone bajo el ícono en la pantalla de inicio.
      name: 'Mis Finanzas',
      short_name: 'Mis Finanzas',
      description: 'Tus finanzas personales',
      start_url: '/finanzas',
      scope: '/finanzas',
      display: 'standalone',
      // El verde del borde del ícono, para que la pantalla de arranque no
      // destelle en otro color antes de que cargue la app. Al coincidir con el
      // borde, el ícono no recorta contra el fondo: se funde con él.
      background_color: '#1B7448',
      theme_color: '#F3F4F6',
      lang: 'es',
      // Los PNG son estáticos, de `public/finanzas/`. Antes se generaban al
      // vuelo con ImageResponse desde un `icon-mark.tsx`, que servía cuando la
      // marca eran tres barras y un círculo; el ícono de ahora es una
      // ilustración y no se dibuja con cuatro paths. Se rehacen con
      // `documentos/design/finanzas-icon-build.js` a partir del original.
      icons: [
        { src: '/finanzas/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` deja que Android recorte el ícono a la forma del sistema.
        // Va en un archivo aparte y no en el mismo 512: el dibujo llega hasta
        // el borde, así que un recorte a círculo se comería los chips de las
        // esquinas. Ese va al 78% sobre campo verde para aguantar el recorte.
        { src: '/finanzas/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}
