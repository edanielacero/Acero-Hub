'use client'

import { useFzPath } from '../components/router'
import { SCREEN_PATHS, type ScreenPath } from './paths'
import { HomeScreen } from './home'
import { MovimientosScreen } from './movimientos'
import { CuentasScreen } from './cuentas'
import { FijosScreen } from './fijos'
import { DeudasScreen } from './deudas'
import { PasanakuScreen } from './pasanaku'
import { PresupuestoScreen } from './presupuesto'
import { MasScreen } from './mas'
import { AjustesScreen } from './ajustes'

/**
 * Las 8 pantallas de la mini-app, elegidas por el path del router interno.
 *
 * No hay lazy loading a propósito: medido, las 7 originales pesaban 25.7 KB
 * gzip más que la Home sola sobre una base de 203 KB — un 13%. Partirlas en chunks
 * agrega un viaje de red justo cuando el usuario ya tocó la pestaña, que es
 * peor negocio que esos 25 KB al abrir.
 *
 * El `Record<ScreenPath, …>` es lo que mantiene esto sincronizado con
 * paths.ts: agregar una URL allá sin su pantalla acá no compila.
 */
const SCREENS: Record<ScreenPath, () => React.ReactNode> = {
  '/finanzas': HomeScreen,
  '/finanzas/movimientos': MovimientosScreen,
  '/finanzas/cuentas': CuentasScreen,
  '/finanzas/fijos': FijosScreen,
  '/finanzas/deudas': DeudasScreen,
  '/finanzas/pasanaku': PasanakuScreen,
  '/finanzas/presupuesto': PresupuestoScreen,
  '/finanzas/mas': MasScreen,
  '/finanzas/ajustes': AjustesScreen,
}

function isScreenPath(p: string): p is ScreenPath {
  return (SCREEN_PATHS as readonly string[]).includes(p)
}

export function Screens() {
  const path = useFzPath()
  // Una barra final o un slug desconocido caen en la Home en vez de dejar la
  // pantalla en blanco: dentro de la app no hay a dónde mandar un 404.
  const clean = path.replace(/\/$/, '') || '/finanzas'
  const Screen = isScreenPath(clean) ? SCREENS[clean] : HomeScreen
  return <Screen />
}
