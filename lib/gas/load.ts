import type { SupabaseClient } from '@supabase/supabase-js'
import type { Auto, ColorAuto, Movimiento } from './types'

export const AUTO_COLS = 'id, nombre, color, bs_por_km, orden'
export const MOV_COLS =
  'id, auto_id, tipo, ocurrido_en, monto, km_inicial, km_final, personas, bs_por_km, terminado_en, nota'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any

export function mapAuto(row: Row): Auto {
  return {
    id: row.id,
    nombre: row.nombre,
    color: row.color as ColorAuto,
    bsPorKm: Number(row.bs_por_km),
    orden: Number(row.orden),
  }
}

export function mapMovimiento(row: Row): Movimiento {
  if (row.tipo === 'carga') {
    return {
      tipo: 'carga',
      id: row.id,
      autoId: row.auto_id,
      ocurridoEn: row.ocurrido_en,
      nota: row.nota ?? null,
      monto: Number(row.monto),
    }
  }
  return {
    tipo: 'viaje',
    id: row.id,
    autoId: row.auto_id,
    ocurridoEn: row.ocurrido_en,
    nota: row.nota ?? null,
    kmInicial: Number(row.km_inicial),
    kmFinal: row.km_final === null ? null : Number(row.km_final),
    personas: Number(row.personas),
    bsPorKm: Number(row.bs_por_km),
    terminadoEn: row.terminado_en,
  }
}

/**
 * Los dos autos con los que arranca la mini-app.
 *
 * Los promedios son los que dio el usuario el 28/08/2026. Viven en la base y no
 * en el código para que corregirlos después no cueste un deploy — esto es solo
 * el punto de partida.
 */
const AUTOS_INICIALES = [
  { nombre: 'JAC J4',       color: 'rojo',  bs_por_km: 0.7, orden: 0 },
  { nombre: 'Grand Vitara', color: 'plomo', bs_por_km: 0.9, orden: 1 },
]

/**
 * Los autos del usuario, creando los dos iniciales la primera vez que abre la
 * mini-app.
 *
 * El alta es idempotente por el `unique (user_id, color)`: si dos pestañas
 * abren Gas a la vez, la segunda no duplica nada. Se hace acá y no con un seed
 * en la migración porque los demás usuarios del Hub no tienen por qué recibir
 * autos que nunca pidieron.
 */
export async function cargarAutos(supabase: SupabaseClient, userId: string): Promise<Auto[]> {
  const { data } = await supabase.from('gas_autos').select(AUTO_COLS).order('orden')

  if (data && data.length >= AUTOS_INICIALES.length) return data.map(mapAuto)

  await supabase
    .from('gas_autos')
    .upsert(
      AUTOS_INICIALES.map(a => ({ ...a, user_id: userId })),
      { onConflict: 'user_id,color', ignoreDuplicates: true },
    )

  const { data: recien } = await supabase.from('gas_autos').select(AUTO_COLS).order('orden')
  return (recien ?? []).map(mapAuto)
}

/** Todos los movimientos del usuario. El volumen es de unos pocos por día. */
export async function cargarMovimientos(supabase: SupabaseClient): Promise<Movimiento[]> {
  const { data } = await supabase
    .from('gas_movimientos')
    .select(MOV_COLS)
    .order('ocurrido_en', { ascending: false })

  return (data ?? []).map(mapMovimiento)
}
