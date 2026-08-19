'use client'

import { useExpRouter } from '../router'
import { CLIENTS_SEGMENT } from './paths'
import { HomeScreen } from './home'
import { OnboardingsScreen } from './onboardings'
import { AdGeneratorScreen } from './ad-generator'
import { CampanasScreen } from './campanas'
import { PagosScreen } from './pagos'
import { ClientDetailScreen } from './client-detail'

/**
 * Resuelve la pantalla desde los segmentos de la URL.
 *
 *   /expandlogy                  → home
 *   /expandlogy/onboardings      → …y las otras pestañas
 *   /expandlogy/clients/<id>     → detalle de cliente
 */

const TABS: Record<string, () => React.ReactNode> = {
  '': HomeScreen,
  'onboardings': OnboardingsScreen,
  'ad-generator': AdGeneratorScreen,
  'campanas': CampanasScreen,
  'pagos': PagosScreen,
}

export function Screens() {
  const { segments } = useExpRouter()

  if (segments[0] === CLIENTS_SEGMENT && segments[1]) {
    return <ClientDetailScreen clientId={segments[1]} />
  }

  const Screen = TABS[segments[0] ?? ''] ?? HomeScreen
  return <Screen />
}
