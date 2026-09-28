'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { Campana, CampanaConEstado } from '@/lib/ads-analizador/types'
import type { DetalleCampana } from '@/lib/ads-analizador/load'
import { necesitaSincronizar } from '@/lib/ads-analizador/sync-al-abrir'

/**
 * El estado de Ads Analizador: la lista de campañas con su semáforo.
 *
 * El detalle de una campaña (historial día por día) se pide aparte, desde su
 * pantalla, con `useDetalle`: el home no lo necesita y traerlo para todas
 * sería pagar por datos que no se miran.
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }
type Estado = 'cargando' | 'listo' | 'error'

/**
 * Un 401 casi siempre es un access token vencido con el refresh vivo (abrir la
 * app después de horas). Se refresca y se reintenta una vez — regla 3 de
 * documentos/arquitectura/mini-apps.md.
 */
export async function pedir(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 401) return res
  const { data } = await createClient().auth.refreshSession()
  if (!data.session) return res
  return fetch(url, init)
}

export async function mutar<T>(
  url: string, init: RequestInit, extraer: (json: Record<string, unknown>) => T,
): Promise<Resultado<T>> {
  let res: Response
  try {
    res = await pedir(url, init)
  } catch {
    return { ok: false, error: 'No se pudo conectar. Revisa tu internet.' }
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: typeof json.error === 'string' ? json.error : 'Algo salió mal' }
  return { ok: true, valor: extraer(json) }
}

export const json = (method: string, datos?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: datos === undefined ? undefined : JSON.stringify(datos),
})

export interface NuevaCampana {
  metaCampaignId: string
  metaAdAccountId: string
  nombre: string
  moneda: string
  tipoConversion: string
  precioVenta: number
  margenVenta: number
}

export type EdicionCampana = Partial<{
  nombre: string
  precioVenta: number
  margenVenta: number
  roasObjetivo: number | null
  activo: boolean
}>

export interface ResultadoSync {
  procesadas: number
  omitidas: { motivo: string; campanas: string[] }[]
  resultados: { campaign_id: string; nombre?: string; ok: boolean; error?: string; dias_sincronizados?: number }[]
}

interface Ads {
  campanas: CampanaConEstado[]
  estado: Estado
  hoy: string | null
  recargar: () => Promise<void>
  crear: (datos: NuevaCampana) => Promise<Resultado<Campana>>
  editar: (id: string, cambios: EdicionCampana) => Promise<Resultado<Campana>>
  borrar: (id: string) => Promise<Resultado<null>>
  sincronizar: () => Promise<Resultado<ResultadoSync>>
  /** Hay un sync en curso, automático o del botón. */
  sincronizando: boolean
  /** Resultado del último sync (automático o manual), para el aviso del home. */
  ultimoResultado: Resultado<ResultadoSync> | null
  /** Sube cada vez que termina un sync: el dashboard se refresca con él. */
  version: number
}

const Ctx = createContext<Ads | null>(null)

export function AdsProvider({ children }: { children: ReactNode }) {
  const [campanas, setCampanas] = useState<CampanaConEstado[]>([])
  const [estado, setEstado] = useState<Estado>('cargando')
  const [hoy, setHoy] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState<Resultado<ResultadoSync> | null>(null)
  const [version, setVersion] = useState(0)
  const enCurso = useRef(false)
  const autoHecho = useRef(false)

  const recargar = useCallback(async (): Promise<CampanaConEstado[] | null> => {
    try {
      const res = await pedir('/api/ads-analizador/campaigns')
      if (!res.ok) { setEstado('error'); return null }
      const j = await res.json()
      setCampanas(j.campaigns ?? [])
      setHoy(j.hoy ?? null)
      setEstado('listo')
      return j.campaigns ?? []
    } catch {
      setEstado('error')
      return null
    }
  }, [])

  const sincronizar = useCallback(async (): Promise<Resultado<ResultadoSync>> => {
    // Un solo sync a la vez: el automático y el botón no se pisan.
    if (enCurso.current) return { ok: false, error: 'Ya se está sincronizando.' }
    enCurso.current = true
    setSincronizando(true)
    const r = await mutar('/api/ads-analizador/sync', json('POST'), j => j as unknown as ResultadoSync)
    await recargar()
    enCurso.current = false
    setSincronizando(false)
    setUltimoResultado(r)
    setVersion(v => v + 1)
    return r
  }, [recargar])

  // Al abrir: cargar lo guardado y, si está viejo, sincronizar una vez.
  useEffect(() => {
    void (async () => {
      const lista = await recargar()
      if (!lista || autoHecho.current) return
      autoHecho.current = true
      if (necesitaSincronizar(lista)) void sincronizar()
    })()
  }, [recargar, sincronizar])

  // Crear y editar cambian el semáforo, que se calcula en el servidor: se
  // recarga la lista en vez de recalcular acá y arriesgar dos verdades.
  const crear = useCallback(async (datos: NuevaCampana) => {
    const r = await mutar('/api/ads-analizador/campaigns', json('POST', datos), j => j.campana as Campana)
    if (r.ok) await recargar()
    return r
  }, [recargar])

  const editar = useCallback(async (id: string, cambios: EdicionCampana) => {
    const r = await mutar(`/api/ads-analizador/campaigns/${id}`, json('PATCH', cambios), j => j.campana as Campana)
    if (r.ok) await recargar()
    return r
  }, [recargar])

  const borrar = useCallback(async (id: string) => {
    const r = await mutar<null>(`/api/ads-analizador/campaigns/${id}`, { method: 'DELETE' }, () => null)
    if (r.ok) setCampanas(prev => prev.filter(c => c.campana.id !== id))
    return r
  }, [])

  const recargarLista = useCallback(async () => { await recargar() }, [recargar])

  return (
    <Ctx.Provider value={{
      campanas, estado, hoy, recargar: recargarLista, crear, editar, borrar,
      sincronizar, sincronizando, ultimoResultado, version,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAds(): Ads {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAds necesita <AdsProvider> arriba')
  return ctx
}

/**
 * El historial completo de una campaña, para su dashboard. Cuando termina un
 * sync se vuelve a pedir en silencio, sin volver al esqueleto de carga.
 */
export function useDetalle(id: string | null) {
  const { version } = useAds()
  const [detalle, setDetalle] = useState<DetalleCampana | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'no_existe'>('cargando')

  const recargar = useCallback(async () => {
    if (!id) { setEstado('no_existe'); return }
    try {
      const res = await pedir(`/api/ads-analizador/campaigns/${id}`)
      if (res.status === 404) { setEstado('no_existe'); return }
      if (!res.ok) { setEstado('error'); return }
      setDetalle(await res.json())
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }, [id])

  useEffect(() => { setEstado('cargando'); void recargar() }, [recargar])

  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    void recargar()
  }, [version, recargar])

  return { detalle, estado, recargar }
}
