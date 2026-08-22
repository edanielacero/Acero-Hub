import { Screens } from '../screens'
import { SCREEN_PATHS } from '../screens/paths'

/**
 * La única ruta de la mini-app. Las 8 pantallas se resuelven en el cliente
 * (ver components/router.tsx), así que cambiar de pestaña no cuesta ni un
 * request: es un cambio de estado.
 *
 * Lo que esta ruta sí conserva es la URL. `generateStaticParams` prerenderiza
 * un HTML por cada pantalla, así que /finanzas/fijos entrado a mano, recargado
 * o compartido sigue siendo una página estática servida desde el CDN — no un
 * redirect ni un render dinámico.
 */

export function generateStaticParams() {
  return SCREEN_PATHS.map(path => {
    const rest = path.replace('/finanzas', '').split('/').filter(Boolean)
    // La raíz va sin `slug`: en un catch-all opcional, `[]` no genera /finanzas.
    return rest.length ? { slug: rest } : { slug: undefined }
  })
}

/**
 * Sin esto, una URL desconocida bajo /finanzas se renderizaría en el servidor
 * bajo demanda — justo el viaje que este cambio vino a eliminar.
 */
export const dynamicParams = false

export default function FinanzasPage() {
  return <Screens />
}
