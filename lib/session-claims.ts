/**
 * Los claims de la sesión leídos desde la cookie, en el cliente, sin red.
 *
 * Salió de lib/finanzas/snapshot.ts, donde nació para saber de quién era el
 * snapshot antes del primer pintado. Ahora también lo usa el gate de acceso, así
 * que vive acá: la sesión es del Hub, no de una mini-app.
 *
 * ⚠️ ESTO NO ES UNA FRONTERA DE SEGURIDAD. Lee el JWT sin verificar su firma,
 * así que cualquiera puede fabricar una cookie y pasar el gate. Sirve para
 * decidir QUÉ PINTAR, nada más. Los datos los siguen protegiendo requireUser()
 * —que sí verifica la firma— y las policies de RLS en cada ruta de /api.
 */

export interface SessionClaims {
  sub: string
  role: string | null
  /** Nombre completo cargado en el perfil, si lo hay. */
  name: string | null
  /** Slugs de las mini-apps permitidas, firmados en el token. */
  projects: string[]
}

function b64ToText(b64: string): string {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, '='))
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** `sb-<ref>-auth-token`, y sus trozos `.0`, `.1`… cuando no entra en una cookie. */
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.(\d+))?$/

/**
 * Decodifica los claims de un access token que ya se tiene en la mano.
 *
 * Existe aparte de `readSessionClaims()` para el caso de haber pedido un token
 * nuevo con `refreshSession()`: ahí los claims que importan son los del token
 * recién llegado, y esperar a que aparezcan en `document.cookie` sería confiar
 * en el orden interno con que auth-js persiste la sesión.
 *
 * ⚠️ No verifica la firma, igual que `readSessionClaims()`. Mismo alcance:
 * decidir qué pintar.
 */
export function parseSessionClaims(accessToken: string): SessionClaims | null {
  try {
    const payload = JSON.parse(b64ToText(accessToken.split('.')[1]))
    if (typeof payload?.sub !== 'string') return null

    const meta = payload.app_metadata ?? {}
    return {
      sub: payload.sub,
      role: typeof meta.role === 'string' ? meta.role : null,
      name: typeof meta.name === 'string' ? meta.name : null,
      projects: Array.isArray(meta.projects) ? meta.projects : [],
    }
  } catch {
    return null
  }
}

/**
 * Tiene que ser síncrono: si hubiera que esperar a `getSession()`, tanto el
 * snapshot como el gate llegarían después del primer frame y no habrían servido
 * de nada.
 *
 * La cookie se busca por forma y no por nombre exacto para no depender de tener
 * la URL del proyecto disponible en el bundle del navegador.
 *
 * No mira `exp` a propósito: un token vencido pero renovable trae los mismos
 * claims que el que va a llegar, y <SessionKeeper/> ya lo está refrescando de
 * fondo. Rechazar acá por vencido mandaría a /login a quien solo abrió la app
 * después de una hora — exactamente el caso que este cambio vino a arreglar.
 * Si el refresh falla de verdad, el SIGNED_OUT del keeper es el que echa.
 */
export function readSessionClaims(): SessionClaims | null {
  try {
    let entera = ''
    const trozos: { i: number; v: string }[] = []

    for (const cookie of document.cookie.split('; ')) {
      const corte = cookie.indexOf('=')
      if (corte < 0) continue

      const match = AUTH_COOKIE.exec(cookie.slice(0, corte))
      if (!match) continue

      const valor = decodeURIComponent(cookie.slice(corte + 1))
      if (match[1] === undefined) entera = valor
      else trozos.push({ i: Number(match[1]), v: valor })
    }

    const raw = entera || trozos.sort((a, b) => a.i - b.i).map(t => t.v).join('')
    if (!raw) return null

    const json = raw.startsWith('base64-') ? b64ToText(raw.slice(7)) : raw
    const token = JSON.parse(json)?.access_token
    if (typeof token !== 'string') return null

    return parseSessionClaims(token)
  } catch {
    return null
  }
}
