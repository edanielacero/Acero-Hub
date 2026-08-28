import type { Auto, Movimiento, Viaje } from './types'

/**
 * Las cuentas de Gas, en un solo lugar: las usan igual la ruta de API y la
 * pantalla, así que no puede haber dos versiones del mismo número.
 */

/** Redondeo a 2 decimales, la precisión del boliviano. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Los km del viaje, o `null` si todavía está en curso. */
export function kmRecorridos(v: Viaje): number | null {
  if (v.kmFinal === null) return null
  return Math.round((v.kmFinal - v.kmInicial) * 10) / 10
}

/** Lo que costó el viaje entero, sin repartir. */
export function costoTotal(v: Viaje): number | null {
  const km = kmRecorridos(v)
  return km === null ? null : round2(km * v.bsPorKm)
}

/** Un viaje es compartido desde la segunda persona. */
export function esCompartido(v: Viaje): boolean {
  return v.personas > 1
}

/**
 * Lo que le tocó pagar al conductor. `personas` lo incluye, así que ir con 3
 * acompañantes es dividir entre 4.
 */
export function miParte(v: Viaje): number | null {
  const total = costoTotal(v)
  return total === null ? null : round2(total / v.personas)
}

/**
 * Cuánto mueve el saldo este movimiento.
 *
 * Un viaje descuenta SOLO la parte del conductor, no el costo total — decisión
 * del usuario (28/08/2026): el saldo mide su plata, no el gas del tanque. Un
 * viaje en curso todavía no mueve nada: no se sabe cuánto va a costar.
 */
export function efectoEnSaldo(m: Movimiento): number {
  if (m.tipo === 'carga') return m.monto
  return -(miParte(m) ?? 0)
}

/** El saldo del auto: la suma de todo lo que pasó con él. */
export function saldo(movimientos: Movimiento[]): number {
  return round2(movimientos.reduce((total, m) => total + efectoEnSaldo(m), 0))
}

/**
 * Cuántos km alcanza a pagar el saldo, yendo solo. Con el saldo en negativo no
 * quedan km: quedan deudas, y ese caso la tarjeta lo dice con todas las letras.
 */
export function kmDisponibles(saldoActual: number, auto: Auto): number {
  if (saldoActual <= 0) return 0
  return Math.floor(saldoActual / auto.bsPorKm)
}

/**
 * El historial: del más nuevo al más viejo, y con el saldo en que quedó el auto
 * después de cada movimiento.
 *
 * El saldo corriente se acumula del más VIEJO al más nuevo —que es el orden en
 * que pasaron las cosas— y recién ahí se da vuelta la lista para mostrarla.
 */
export function historial(movimientos: Movimiento[]): Array<{ mov: Movimiento; saldo: number }> {
  const cronologico = [...movimientos].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn))

  let acumulado = 0
  const filas = cronologico.map(mov => {
    acumulado = round2(acumulado + efectoEnSaldo(mov))
    return { mov, saldo: acumulado }
  })

  return filas.reverse()
}

/** El viaje abierto de un auto, si lo hay. */
export function viajeEnCurso(movimientos: Movimiento[]): Viaje | null {
  const abierto = movimientos.find(m => m.tipo === 'viaje' && m.kmFinal === null)
  return (abierto as Viaje) ?? null
}
