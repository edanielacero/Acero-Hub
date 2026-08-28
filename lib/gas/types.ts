/** El modelo de Gas. Ver supabase/migrations/20260828010000_gas_autos_y_movimientos.sql */

export const COLORES = ['rojo', 'plomo'] as const
export type ColorAuto = (typeof COLORES)[number]

export interface Auto {
  id: string
  nombre: string
  color: ColorAuto
  /** Lo que cuesta en promedio recorrer un kilómetro con este auto. */
  bsPorKm: number
  orden: number
}

interface Base {
  id: string
  autoId: string
  /** ISO. En un viaje, el momento de subirse. */
  ocurridoEn: string
  /**
   * El para qué del movimiento, opcional. Hoy la interfaz solo la ofrece en
   * los viajes; la columna es de la tabla entera.
   */
  nota: string | null
}

export interface Carga extends Base {
  tipo: 'carga'
  /** Bs que entraron al saldo. Siempre positivo. */
  monto: number
}

export interface Viaje extends Base {
  tipo: 'viaje'
  kmInicial: number
  /** `null` mientras el viaje está en curso. */
  kmFinal: number | null
  /** Cuántos van en el auto, **incluido el conductor**. */
  personas: number
  /** Congelado al iniciar: corregir el promedio del auto no reescribe el pasado. */
  bsPorKm: number
  terminadoEn: string | null
}

export type Movimiento = Carga | Viaje

/** Un auto con todo lo que la tarjeta necesita pintar, ya calculado. */
export interface AutoConEstado {
  auto: Auto
  saldo: number
  kmDisponibles: number
  /** El viaje abierto de este auto, si hay uno. */
  enCurso: Viaje | null
}
