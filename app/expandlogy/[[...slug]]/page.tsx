import { Screens } from '../screens'
import { STATIC_PATHS } from '../screens/paths'

/**
 * La única ruta de la mini-app. Las 6 pantallas se resuelven en el cliente
 * (ver ../router.tsx), así que moverse entre ellas no cuesta ni un request.
 */

export function generateStaticParams() {
  return STATIC_PATHS.map(path => {
    const rest = path.replace('/expandlogy', '').split('/').filter(Boolean)
    // La raíz va sin `slug`: en un catch-all opcional, `[]` no genera la base.
    return rest.length ? { slug: rest } : { slug: undefined }
  })
}

/**
 * En true por `/expandlogy/clients/<id>`: el id sale de los datos y no hay
 * forma de enumerarlo en el build. Todo lo demás está en STATIC_PATHS y se
 * sirve prerenderizado.
 */
export const dynamicParams = true

export default function ExpandlogyPage() {
  return <Screens />
}
