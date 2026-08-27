/**
 * Service worker de Finanzas.
 *
 * Vive en /finanzas/ y no en la raíz a propósito: su scope queda limitado a la
 * mini-app, que es lo único que usa notificaciones. El Hub y las demás
 * mini-apps no quedan bajo un service worker que no pidieron.
 *
 * No cachea nada. Existe solo para recibir push: la app ya resuelve el pintado
 * instantáneo con su snapshot en localStorage, y meter un caché de assets acá
 * agregaría una segunda fuente de verdad sobre qué versión estás viendo.
 */

// Tomar el control sin esperar a que se cierren las pestañas abiertas. Sin
// esto, activar las notificaciones y recibir la primera puede tardar una
// recarga entera.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let datos = { title: 'Finanzas', body: '', url: '/finanzas' }
  try {
    if (event.data) datos = { ...datos, ...event.data.json() }
  } catch {
    // Un payload que no es JSON no debería tirar abajo la notificación entera:
    // mejor mostrar algo genérico que no mostrar nada.
  }

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/finanzas/icon-192',
      badge: '/finanzas/icon-192',
      // Sin `tag`, dos avisos distintos se apilan; con uno fijo, el segundo
      // reemplazaría al primero. La URL es un buen término medio: dos avisos
      // de la misma pantalla se colapsan, dos de pantallas distintas no.
      tag: datos.url,
      data: { url: datos.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = event.notification.data?.url || '/finanzas'

  event.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Si la app ya está abierta, se la enfoca y se la navega. Abrir una
      // pestaña nueva cada vez dejaría media docena de Finanzas abiertas.
      for (const c of abiertas) {
        if (c.url.includes('/finanzas')) {
          await c.focus()
          if ('navigate' in c) await c.navigate(destino)
          return
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
