import { Screens } from '../screens'
import { STATIC_PATHS } from '../screens/paths'

/**
 * La única ruta de la mini-app. Las pantallas se resuelven en el cliente
 * (ver ../router.tsx), así que moverse entre ellas no cuesta ni un request.
 */

export function generateStaticParams() {
  return STATIC_PATHS.map(path => {
    const rest = path.replace('/gas', '').split('/').filter(Boolean)
    // La raíz va sin `slug`: en un catch-all opcional, `[]` no genera la base.
    return rest.length ? { slug: rest } : { slug: undefined }
  })
}

/**
 * En false: hoy todas las URLs de Gas son enumerables. Cuando aparezca alguna
 * con un id que salga de la base hay que pasarlo a true.
 */
export const dynamicParams = false

export default function GasPage() {
  return <Screens />
}
