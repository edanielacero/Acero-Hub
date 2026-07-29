export type ClientStatus = 'onboarding' | 'active' | 'paused' | 'archived'

export interface Client {
  id: string
  name: string
  info: string
  status: ClientStatus
  serviceEndsAt: string | null // ISO date — cuándo termina el servicio contratado (para cobrar renovación)
}
