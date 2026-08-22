import type { Pasanaku, PasanakuInput } from './types'

/** Último día del mes, para no proponer un 31 de febrero. Mismo criterio que `lib/finanzas/recurring.ts`. */
function lastDayOf(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Suma meses a una fecha ISO, topando el día contra el largo real del mes destino. */
export function addMonthsClamped(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDayOf(ny, nm)))}`
}

/**
 * Cuándo te toca recibir — NUNCA se guarda, se deriva de `start_date` y
 * `my_slot`. Puesto 1 recibe en `start_date`; puesto 4 recibe tres meses
 * después. Mismo principio que el saldo de una cuenta: un dato derivado no se
 * puede desincronizar de la historia que describe.
 */
export function expectedTurnDate(p: Pick<Pasanaku, 'start_date' | 'my_slot'>): string {
  return addMonthsClamped(p.start_date, p.my_slot - 1)
}

export function validatePasanaku(input: Partial<PasanakuInput>): string | null {
  if (!input.name || !input.name.trim()) return 'Ponele un nombre'
  if (!input.account_id) return 'Elegí de qué cuenta sale'
  if (typeof input.contribution_amount !== 'number' || !Number.isFinite(input.contribution_amount) || input.contribution_amount <= 0) {
    return 'El aporte debe ser mayor a cero'
  }
  if (!Number.isInteger(input.total_slots) || (input.total_slots as number) <= 1) {
    return 'Los puestos tienen que ser al menos 2'
  }
  if (!Number.isInteger(input.my_slot) || (input.my_slot as number) < 1) {
    return 'Tu puesto tiene que ser 1 o más'
  }
  if ((input.my_slot as number) > (input.total_slots as number)) {
    return 'Tu puesto no puede ser mayor que el total de puestos'
  }
  if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) return 'Elegí una fecha de inicio'
  return null
}
