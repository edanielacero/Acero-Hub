'use client'

import { readProfilePref } from './profile-pref'

/**
 * `fetch` para las rutas de Finanzas, con el perfil activo puesto (Sprint 8).
 *
 * Todas las rutas del dominio leen el perfil de `?profile=<id>`. Sin este
 * envoltorio, cada pantalla tendría que acordarse de agregarlo en sus 35 puntos
 * de llamada — y la que se olvidara **no fallaría**: escribiría en el perfil
 * default sin decir nada. Un gasto de la empresa apareciendo en el personal, en
 * silencio.
 *
 * El perfil se lee de localStorage y no del contexto de React a propósito: así
 * esto sirve igual desde un handler, un efecto o un módulo sin hooks, y no
 * obliga a pasar el id por props hasta el último botón.
 *
 * Si no hay perfil guardado (primer arranque), no se manda nada y el server
 * resuelve el default — que es exactamente lo que corresponde.
 */
export function fzFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(withProfile(path), init)
}

/** Le agrega `?profile=` a una ruta de Finanzas, respetando la query que ya tenga. */
export function withProfile(path: string): string {
  const { id } = readProfilePref()
  if (!id) return path
  if (/[?&]profile=/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}profile=${encodeURIComponent(id)}`
}
