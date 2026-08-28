'use client'

import { HomeScreen } from './home'

/**
 * La mini-app tiene una sola pantalla: el carrusel de autos arriba y el
 * historial filtrable abajo. Cuando aparezca una segunda, acá va el mapa
 * contra `useGasRouter().segments`, como en las otras mini-apps.
 */
export function Screens() {
  return <HomeScreen />
}
