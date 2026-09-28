/**
 * Sin cron: al abrir la app, si alguna campaña activa no se sincronizó en las
 * últimas horas (o nunca), se sincroniza sola en segundo plano. Mientras, se ve
 * lo último guardado. Los números solo importan cuando alguien los mira.
 */
import type { CampanaConEstado } from './types'

export const HORAS_PARA_RESINCRONIZAR = 6

export function necesitaSincronizar(campanas: Pick<CampanaConEstado, 'campana'>[], ahora = Date.now()): boolean {
  const limite = ahora - HORAS_PARA_RESINCRONIZAR * 3_600_000
  return campanas.some(c => c.campana.activo && (!c.campana.ultimaSync || Date.parse(c.campana.ultimaSync) < limite))
}
