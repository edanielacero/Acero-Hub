'use client'

import { useTjRouter } from '../router'
import { RESERVED_SEGMENTS, SESSION_TABS, type SessionTab } from './paths'
import { SessionListScreen } from './session-list'
import { NotificationsScreen } from './notifications'
import { DashboardScreen } from './dashboard'
import { StatsScreen } from './stats'
import { SweetSpotScreen } from './sweetspot'
import { MontecarloScreen } from './montecarlo'
import { VariablesScreen } from './variables'

/**
 * Resuelve la pantalla desde los segmentos de la URL.
 *
 *   /trading-journal                    → lista de sesiones
 *   /trading-journal/notifications      → notificaciones
 *   /trading-journal/<id>               → dashboard de la sesión
 *   /trading-journal/<id>/stats         → …y sus sub-pantallas
 *
 * El id de sesión sale de la base, así que no puede prerenderizarse. Lo que sí
 * se logra es que moverse entre las 5 pantallas de una sesión no cueste ningún
 * request: antes cada una era una ruta `ƒ`, o sea un render en el servidor por
 * cada click.
 */

const SESSION_SCREENS: Record<SessionTab, (p: { sessionId: string }) => React.ReactNode> = {
  '': DashboardScreen,
  'stats': StatsScreen,
  'sweetspot': SweetSpotScreen,
  'montecarlo': MontecarloScreen,
  'variables': VariablesScreen,
}

function isSessionTab(s: string): s is SessionTab {
  return (SESSION_TABS as readonly string[]).includes(s)
}

export function Screens() {
  const { segments } = useTjRouter()

  if (segments.length === 0) return <SessionListScreen />
  if (segments[0] === 'notifications') return <NotificationsScreen />

  // Cualquier otro primer segmento es un id de sesión. RESERVED_SEGMENTS existe
  // para que agregar una pantalla sin parámetro no quede interpretada como una
  // sesión inexistente.
  if ((RESERVED_SEGMENTS as readonly string[]).includes(segments[0])) {
    return <SessionListScreen />
  }

  const sessionId = segments[0]
  const tab = segments[1] ?? ''
  const Screen = isSessionTab(tab) ? SESSION_SCREENS[tab] : DashboardScreen
  return <Screen sessionId={sessionId} />
}
