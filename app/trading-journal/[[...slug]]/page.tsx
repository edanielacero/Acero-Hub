import { Screens } from '../screens'
import { STATIC_PATHS } from '../screens/paths'

/**
 * La única ruta de la mini-app. Las 7 pantallas se resuelven en el cliente
 * (ver ../router.tsx), así que moverse entre ellas no cuesta ni un request.
 *
 * Antes eran 7 rutas y 5 de ellas salían marcadas `ƒ` en el build —
 * renderizadas en el servidor bajo demanda, porque `[sessionId]` es un segmento
 * dinámico sin params conocidos. Cada click entre Dashboard, Stats, Sweet Spot,
 * Montecarlo y Variables era un viaje al servidor. Ahora es un cambio de estado.
 */

export function generateStaticParams() {
  return STATIC_PATHS.map(path => {
    const rest = path.replace('/trading-journal', '').split('/').filter(Boolean)
    // La raíz va sin `slug`: en un catch-all opcional, `[]` no genera la base.
    return rest.length ? { slug: rest } : { slug: undefined }
  })
}

/**
 * A diferencia de finanzas, acá `dynamicParams` queda en true y es obligatorio:
 * los ids de sesión salen de la base y no hay forma de enumerarlos en el build.
 * Una URL de sesión se renderiza en el servidor la primera vez — pero es un
 * render de componentes de cliente sin consultas, y a partir de ahí toda la
 * navegación dentro de la sesión es local.
 */
export const dynamicParams = true

export default function TradingJournalPage() {
  return <Screens />
}
