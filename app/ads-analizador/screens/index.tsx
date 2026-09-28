'use client'

import { useAdsRouter } from '../router'
import { AgregarCampanaScreen } from './agregar-campana'
import { AjustesCampanaScreen } from './ajustes-campana'
import { CampanaScreen } from './campana'
import { HomeScreen } from './home'

/** Resuelve la pantalla desde los segmentos de la URL. */
export function Screens() {
  const { segments } = useAdsRouter()
  switch (segments[0]) {
    case 'agregar': return <AgregarCampanaScreen />
    case 'campana': return <CampanaScreen />
    case 'ajustes': return <AjustesCampanaScreen />
    default: return <HomeScreen />
  }
}
