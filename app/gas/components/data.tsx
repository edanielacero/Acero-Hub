'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { Auto, Movimiento, Viaje } from '@/lib/gas/types'

/**
 * Todo el estado de Gas: los autos y sus movimientos.
 *
 * El volumen es de unos pocos movimientos por día, así que se trae todo de una
 * y las cuentas se hacen en el cliente (lib/gas/calc.ts). Las mutaciones
 * devuelven la fila que insertó el servidor y se aplican sobre el estado local:
 * ninguna acción cuesta una recarga completa.
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

type Estado = 'cargando' | 'listo' | 'error'

interface Gas {
  autos: Auto[]
  movimientos: Movimiento[]
  estado: Estado
  recargar: () => Promise<void>
  cargarSaldo: (autoId: string, monto: number) => Promise<Resultado<Movimiento>>
  iniciarViaje: (autoId: string, kmInicial: number, personas: number) => Promise<Resultado<Viaje>>
  finalizarViaje: (viajeId: string, kmFinal: number) => Promise<Resultado<Viaje>>
  cancelarViaje: (viajeId: string) => Promise<Resultado<null>>
  corregirMovimiento: (id: string, cambios: CorreccionMov) => Promise<Resultado<Movimiento>>
  borrarMovimiento: (id: string) => Promise<Resultado<null>>
  corregirAuto: (id: string, cambios: { bsPorKm?: number; nombre?: string }) => Promise<Resultado<Auto>>
}

/** Lo que se puede corregir de un movimiento ya anotado. */
export type CorreccionMov = {
  monto?: number
  kmInicial?: number
  kmFinal?: number
  personas?: number
  /** `null` borra la nota; omitirla la deja como está. */
  nota?: string | null
}

const Ctx = createContext<Gas | null>(null)

/**
 * Un 401 no significa "no tenés sesión": lo más común es abrir la app después
 * de horas, con el access token vencido pero el refresh token vivo. Sin este
 * reintento, la primera apertura del día mostraría un error en vez de los
 * datos. Es la regla 3 de documentos/arquitectura/mini-apps.md.
 */
async function pedir(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 401) return res

  const { data } = await createClient().auth.refreshSession()
  if (!data.session) return res

  return fetch(url, init)
}

/** POST/PATCH/DELETE con el manejo de errores que comparten todas las mutaciones. */
async function mutar<T>(url: string, init: RequestInit, extraer: (json: Record<string, unknown>) => T): Promise<Resultado<T>> {
  let res: Response
  try {
    res = await pedir(url, init)
  } catch {
    return { ok: false, error: 'No se pudo conectar. Revisá tu internet.' }
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: typeof json.error === 'string' ? json.error : 'Algo salió mal' }
  }
  return { ok: true, valor: extraer(json) }
}

const cuerpo = (datos: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(datos),
})

export function GasProvider({ children }: { children: ReactNode }) {
  const [autos, setAutos] = useState<Auto[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [estado, setEstado] = useState<Estado>('cargando')

  const recargar = useCallback(async () => {
    try {
      const res = await pedir('/api/gas')
      if (!res.ok) { setEstado('error'); return }

      const json = await res.json()
      setAutos(json.autos ?? [])
      setMovimientos(json.movimientos ?? [])
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  /** Mete el movimiento nuevo, o reemplaza al que ya estaba con ese id. */
  const guardar = useCallback((mov: Movimiento) => {
    setMovimientos(prev => {
      const sinEse = prev.filter(m => m.id !== mov.id)
      return [mov, ...sinEse].sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn))
    })
  }, [])

  const cargarSaldo = useCallback(async (autoId: string, monto: number) => {
    const r = await mutar('/api/gas/cargas', cuerpo({ autoId, monto }), j => j.movimiento as Movimiento)
    if (r.ok) guardar(r.valor)
    return r
  }, [guardar])

  const iniciarViaje = useCallback(async (autoId: string, kmInicial: number, personas: number) => {
    const r = await mutar('/api/gas/viajes', cuerpo({ autoId, kmInicial, personas }), j => j.movimiento as Viaje)
    if (r.ok) guardar(r.valor)
    return r
  }, [guardar])

  const finalizarViaje = useCallback(async (viajeId: string, kmFinal: number) => {
    const r = await mutar(
      `/api/gas/viajes/${viajeId}`,
      { ...cuerpo({ kmFinal }), method: 'PATCH' },
      j => j.movimiento as Viaje,
    )
    if (r.ok) guardar(r.valor)
    return r
  }, [guardar])

  const cancelarViaje = useCallback(async (viajeId: string) => {
    const r = await mutar<null>(`/api/gas/viajes/${viajeId}`, { method: 'DELETE' }, () => null)
    if (r.ok) setMovimientos(prev => prev.filter(m => m.id !== viajeId))
    return r
  }, [])

  const corregirMovimiento = useCallback(async (id: string, cambios: CorreccionMov) => {
    const r = await mutar(
      `/api/gas/movimientos/${id}`,
      { ...cuerpo(cambios), method: 'PATCH' },
      j => j.movimiento as Movimiento,
    )
    if (r.ok) guardar(r.valor)
    return r
  }, [guardar])

  const borrarMovimiento = useCallback(async (id: string) => {
    const r = await mutar<null>(`/api/gas/movimientos/${id}`, { method: 'DELETE' }, () => null)
    if (r.ok) setMovimientos(prev => prev.filter(m => m.id !== id))
    return r
  }, [])

  const corregirAuto = useCallback(async (id: string, cambios: { bsPorKm?: number; nombre?: string }) => {
    const r = await mutar(
      `/api/gas/autos/${id}`,
      { ...cuerpo(cambios), method: 'PATCH' },
      j => j.auto as Auto,
    )
    if (r.ok) setAutos(prev => prev.map(a => (a.id === id ? r.valor : a)))
    return r
  }, [])

  return (
    <Ctx.Provider value={{
      autos, movimientos, estado, recargar,
      cargarSaldo, iniciarViaje, finalizarViaje, cancelarViaje,
      corregirMovimiento, borrarMovimiento, corregirAuto,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useGas(): Gas {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGas necesita <GasProvider> arriba')
  return ctx
}
