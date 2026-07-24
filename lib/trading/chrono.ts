export interface ChronoTrade {
  date_entry: string
  custom_fields: Record<string, unknown> | null | undefined
  created_at: string
}

// "10AM" / "11 pm" → hora 0-23; null si no calza el formato (sin minutos)
export function parseHorario(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = value.trim().toUpperCase().match(/^(\d{1,2})\s*(AM|PM)$/)
  if (!m) return null
  const hour = parseInt(m[1], 10)
  if (hour < 1 || hour > 12) return null
  if (m[2] === 'AM') return hour === 12 ? 0 : hour
  return hour === 12 ? 12 : hour + 12
}

// Orden cronológico real de trades: fecha → horario (variable "horario") → orden de creación.
// date_entry solo distingue el día (la hora que guarda es un valor fijo, no la hora real del trade),
// así que sin este desempate varios trades del mismo día quedan en un orden arbitrario.
export function compareTradesChrono(a: ChronoTrade, b: ChronoTrade): number {
  const byDate = a.date_entry.localeCompare(b.date_entry)
  if (byDate !== 0) return byDate

  const ha = parseHorario(a.custom_fields?.['horario'])
  const hb = parseHorario(b.custom_fields?.['horario'])
  if (ha != null && hb != null && ha !== hb) return ha - hb

  return a.created_at.localeCompare(b.created_at)
}
