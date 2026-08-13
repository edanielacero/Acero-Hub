export function api(path: string, opts?: RequestInit) {
  return fetch(`/api/finanzas${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

// Cache en memoria (por pestaña, se pierde en full reload) para datos de
// referencia — cuentas, categorías, tasas — que varias páginas piden por su
// cuenta en cada montaje aunque casi nunca cambien. Solo usar para GETs cuyo
// dueño (la página que los edita) no sea el que llama esto, para no mostrar
// datos obsoletos justo después de guardar un cambio.
const _cache = new Map<string, { data: unknown; time: number }>()
// Solicitudes en vuelo, separado de _cache — si Inicio, QuickAddProvider y
// ProfileProvider se montan en el mismo tick y piden el mismo path, deben
// compartir la MISMA promesa en vez de disparar 3 fetches idénticos en paralelo.
const _inFlight = new Map<string, Promise<unknown>>()
const DEFAULT_TTL = 20_000

export async function apiCached<T>(path: string, ttl = DEFAULT_TTL): Promise<T> {
  const hit = _cache.get(path)
  if (hit && Date.now() - hit.time < ttl) return hit.data as T

  const pending = _inFlight.get(path)
  if (pending) return pending as Promise<T>

  const request = (async () => {
    try {
      const res = await api(path)
      const data = await res.json()
      if (res.ok) _cache.set(path, { data, time: Date.now() })
      return data as T
    } finally {
      _inFlight.delete(path)
    }
  })()
  _inFlight.set(path, request)
  return request
}

// Para cuando una página muta datos de referencia que otra ruta cacheada (ej.
// /bootstrap) también sirve, y necesita forzar un refetch fresco después.
export function invalidateApiCache(path: string) {
  _cache.delete(path)
}
