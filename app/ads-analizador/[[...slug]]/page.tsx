import { Screens } from '../screens'
import { BASE, STATIC_PATHS } from '../screens/paths'

/**
 * La única ruta de la mini-app. Las pantallas se resuelven en el cliente
 * (ver ../router.tsx), así que moverse entre ellas no cuesta ni un request.
 */
export function generateStaticParams() {
  return STATIC_PATHS.map(path => {
    const rest = path.replace(BASE, '').split('/').filter(Boolean)
    return rest.length ? { slug: rest } : { slug: undefined }
  })
}

export const dynamicParams = false

export default function AdsPage() {
  return <Screens />
}
