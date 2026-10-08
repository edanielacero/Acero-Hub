/**
 * Validación de lo que entra por la API. Pura: se prueba en la suite `unit`.
 *
 * Devuelve el objeto listo para la base (snake_case) o un mensaje de error en
 * español para mostrar tal cual.
 */
import { MODOS_CORTE, MONEDAS, TIPOS_CAMBIO, TIPOS_CONVERSION } from './types'

type Ok<T> = { ok: true; valor: T }
type Err = { ok: false; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */

const positivo = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Los IDs de campaña de Meta son solo dígitos. */
export function normalizarCampaignId(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return /^\d{6,25}$/.test(s) ? s : null
}

/** Acepta `act_123` o `123` (lo que muestra Ads Manager) y devuelve `act_123`. */
export function normalizarAdAccount(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/^act_/i, '')
  return /^\d{5,25}$/.test(s) ? `act_${s}` : null
}

export interface CampanaInsert {
  meta_campaign_id: string
  meta_ad_account_id: string
  nombre: string
  moneda: string
  tipo_conversion: string
  precio_venta: number
  margen_venta: number
}

export function validarAlta(body: any): Ok<CampanaInsert> | Err {
  const meta_campaign_id = normalizarCampaignId(body?.metaCampaignId)
  if (!meta_campaign_id) return { ok: false, error: 'El ID de campaña de Meta tiene que ser solo números.' }

  const meta_ad_account_id = normalizarAdAccount(body?.metaAdAccountId)
  if (!meta_ad_account_id) return { ok: false, error: 'La cuenta publicitaria tiene que ser act_ seguido de números.' }

  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return { ok: false, error: 'La campaña necesita un nombre.' }
  if (nombre.length > 120) return { ok: false, error: 'El nombre es demasiado largo.' }

  if (!MONEDAS.includes(body?.moneda)) return { ok: false, error: 'La moneda tiene que ser USD o BOB.' }
  if (!TIPOS_CONVERSION.includes(body?.tipoConversion)) {
    return { ok: false, error: 'Elige cómo se cierra la venta: compras web, WhatsApp o llamadas.' }
  }

  const precio_venta = positivo(body?.precioVenta)
  if (precio_venta == null) return { ok: false, error: 'El precio de venta tiene que ser mayor a cero.' }
  const margen_venta = positivo(body?.margenVenta)
  if (margen_venta == null) return { ok: false, error: 'El margen tiene que ser mayor a cero.' }
  if (margen_venta > precio_venta) return { ok: false, error: 'El margen no puede ser mayor que el precio.' }

  return {
    ok: true,
    valor: {
      meta_campaign_id, meta_ad_account_id, nombre,
      moneda: body.moneda, tipo_conversion: body.tipoConversion,
      precio_venta, margen_venta,
    },
  }
}

export interface CampanaUpdate {
  nombre?: string
  precio_venta?: number
  margen_venta?: number
  roas_objetivo?: number | null
  cpa_esperado?: number | null
  modo_corte?: string
  show_estimado?: number | null
  close_estimado?: number | null
  capacidad_chats_dia?: number | null
  activo?: boolean
}

/** Una tasa (asistencia, cierre) como fracción 0–1. Acepta "60", "60%" o "0,6". */
export function tasa(raw: unknown): number | null {
  const s = String(raw ?? '').trim().replace('%', '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  const f = n > 1 ? n / 100 : n
  return f > 0 && f <= 1 ? Math.round(f * 1000) / 1000 : null
}

/**
 * Solo pisa lo que venga. `roasObjetivo: null` vuelve al automático.
 * El chequeo margen ≤ precio necesita los valores actuales, por eso los recibe.
 */
export function validarEdicion(body: any, actual: { precioVenta: number; margenVenta: number }): Ok<CampanaUpdate> | Err {
  const cambios: CampanaUpdate = {}

  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre).trim()
    if (!nombre) return { ok: false, error: 'La campaña necesita un nombre.' }
    cambios.nombre = nombre
  }
  if (body?.precioVenta !== undefined) {
    const v = positivo(body.precioVenta)
    if (v == null) return { ok: false, error: 'El precio de venta tiene que ser mayor a cero.' }
    cambios.precio_venta = v
  }
  if (body?.margenVenta !== undefined) {
    const v = positivo(body.margenVenta)
    if (v == null) return { ok: false, error: 'El margen tiene que ser mayor a cero.' }
    cambios.margen_venta = v
  }
  if (body?.roasObjetivo !== undefined) {
    if (body.roasObjetivo === null || body.roasObjetivo === '') {
      cambios.roas_objetivo = null
    } else {
      const v = positivo(body.roasObjetivo)
      if (v == null || v >= 1000) return { ok: false, error: 'El ROAS objetivo tiene que ser un número mayor a cero.' }
      cambios.roas_objetivo = v
    }
  }
  if (body?.cpaEsperado !== undefined) {
    if (body.cpaEsperado === null || body.cpaEsperado === '') cambios.cpa_esperado = null
    else {
      const v = positivo(body.cpaEsperado)
      if (v == null) return { ok: false, error: 'El costo esperado por conversión tiene que ser mayor a cero.' }
      cambios.cpa_esperado = v
    }
  }
  if (body?.modoCorte !== undefined) {
    if (!MODOS_CORTE.includes(body.modoCorte)) return { ok: false, error: 'El modo de corte es conservador o estándar.' }
    cambios.modo_corte = body.modoCorte
  }
  for (const [campo, columna, nombre] of [['showEstimado', 'show_estimado', 'asistencia'], ['closeEstimado', 'close_estimado', 'cierre']] as const) {
    if (body?.[campo] === undefined) continue
    if (body[campo] === null || body[campo] === '') { cambios[columna] = null; continue }
    const v = tasa(body[campo])
    if (v == null) return { ok: false, error: `La tasa de ${nombre} tiene que ser un porcentaje entre 1 y 100.` }
    cambios[columna] = v
  }
  if (body?.capacidadChatsDia !== undefined) {
    if (body.capacidadChatsDia === null || body.capacidadChatsDia === '') cambios.capacidad_chats_dia = null
    else {
      const v = Number(body.capacidadChatsDia)
      if (!Number.isInteger(v) || v <= 0 || v > 100000) return { ok: false, error: 'La capacidad tiene que ser un número entero de chats por día.' }
      cambios.capacidad_chats_dia = v
    }
  }
  if (body?.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { ok: false, error: 'Valor de "activo" inválido.' }
    cambios.activo = body.activo
  }

  const precio = cambios.precio_venta ?? actual.precioVenta
  const margen = cambios.margen_venta ?? actual.margenVenta
  if (margen > precio) return { ok: false, error: 'El margen no puede ser mayor que el precio.' }

  if (Object.keys(cambios).length === 0) return { ok: false, error: 'Nada que actualizar.' }
  return { ok: true, valor: cambios }
}

/** YYYY-MM-DD válido y no en el futuro respecto de `hoy`. */
export function validarFecha(raw: unknown, hoy: string): string | null {
  const s = String(raw ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null
  return s <= hoy ? s : null
}

/**
 * Una carga o corrección de un día.
 *
 * - WhatsApp (`requiereCantidad`): la cantidad es obligatoria, es la venta.
 * - Compras: cantidad y neto son opcionales por separado, pero tiene que venir
 *   al menos uno. `null` en uno de los dos lo deja en automático.
 *
 * El neto acepta coma decimal ("123,45"): el usuario está en Bolivia.
 */
export function validarVenta(body: any, hoy: string, requiereCantidad = true):
  Ok<{ fecha: string; cantidad: number | null; neto: number | null; nota: string | null }> | Err {
  const fecha = validarFecha(body?.fecha, hoy)
  if (!fecha) return { ok: false, error: 'Fecha inválida (no puede ser futura).' }

  let cantidad: number | null = null
  if (body?.cantidad != null && body.cantidad !== '') {
    cantidad = Number(body.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 100000) {
      return { ok: false, error: 'La cantidad tiene que ser un número entero, cero o más.' }
    }
  } else if (requiereCantidad) {
    return { ok: false, error: 'La cantidad tiene que ser un número entero, cero o más.' }
  }

  let neto: number | null = null
  if (!requiereCantidad && body?.neto != null && body.neto !== '') {
    const n = typeof body.neto === 'string' ? Number(body.neto.replace(/\s/g, '').replace(',', '.')) : Number(body.neto)
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false, error: 'El neto tiene que ser un monto, cero o más.' }
    neto = Math.round(n * 100) / 100
  }

  if (cantidad == null && neto == null) return { ok: false, error: 'Carga las ventas o el neto recibido.' }

  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null
  return { ok: true, valor: { fecha, cantidad, neto, nota } }
}

/**
 * `fecha` opcional (YYYY-MM-DD, no futura): el cambio se registra desde la fila
 * de ese día en la tabla. Sin fecha, o con la de hoy, es "ahora".
 */
export function validarCambio(body: any, hoy: string):
  Ok<{ tipo: string; detalle: string | null; fecha: string | null; presupuesto: number | null }> | Err {
  if (!TIPOS_CAMBIO.includes(body?.tipo)) return { ok: false, error: 'Elige qué tipo de cambio hiciste.' }
  const detalle = typeof body?.detalle === 'string' && body.detalle.trim() ? body.detalle.trim().slice(0, 500) : null
  let fecha: string | null = null
  if (body?.fecha != null && body.fecha !== '') {
    fecha = validarFecha(body.fecha, hoy)
    if (!fecha) return { ok: false, error: 'La fecha del cambio no es válida (no puede ser futura).' }
  }
  // El presupuesto diario después del cambio (opcional): para la reserva, la
  // pérdida máxima y el paso de escalado (§4.5).
  let presupuesto: number | null = null
  if (body?.presupuesto != null && body.presupuesto !== '') {
    presupuesto = positivo(body.presupuesto)
    if (presupuesto == null) return { ok: false, error: 'El presupuesto tiene que ser un monto mayor a cero.' }
  }
  return { ok: true, valor: { tipo: body.tipo, detalle, fecha, presupuesto } }
}

/**
 * Las llamadas de un día (High Ticket). Coherencia: no puede haber más
 * asistidas que agendadas ni más cerradas que asistidas.
 */
export function validarLlamadas(body: any, hoy: string):
  Ok<{ fecha: string; agendadas: number; calificadas: number | null; asistidas: number; cerradas: number; nota: string | null }> | Err {
  const fecha = validarFecha(body?.fecha, hoy)
  if (!fecha) return { ok: false, error: 'Fecha inválida (no puede ser futura).' }
  const entero = (v: unknown) => {
    const n = Number(v ?? 0)
    return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null
  }
  const agendadas = entero(body?.agendadas)
  const asistidas = entero(body?.asistidas)
  const cerradas = entero(body?.cerradas)
  if (agendadas == null || asistidas == null || cerradas == null) return { ok: false, error: 'Las llamadas tienen que ser números enteros, cero o más.' }
  let calificadas: number | null = null
  if (body?.calificadas != null && body.calificadas !== '') {
    calificadas = entero(body.calificadas)
    if (calificadas == null) return { ok: false, error: 'Las llamadas calificadas tienen que ser un número entero.' }
    if (calificadas > agendadas) return { ok: false, error: 'No puede haber más calificadas que agendadas.' }
  }
  if (asistidas > agendadas) return { ok: false, error: 'No puede haber más asistidas que agendadas.' }
  if (cerradas > asistidas) return { ok: false, error: 'No puede haber más cerradas que asistidas.' }
  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null
  return { ok: true, valor: { fecha, agendadas, calificadas, asistidas, cerradas, nota } }
}

// ── Ciclos guardados ────────────────────────────────────────────────────────

const ESTADOS_CICLO = ['abierto', 'cerrado', 'cortado', 'interrumpido'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Una foto de ciclo pesa ~1 KB; esto solo frena basura. */
const MAX_SNAPSHOT = 20_000

export interface CicloUpsert {
  inicio: string
  fin: string | null
  dias_ciclo: number | null
  estado: (typeof ESTADOS_CICLO)[number]
  snapshot: Record<string, unknown> | null
  revisar: boolean
}

/**
 * Lo que el dashboard calculó con `planificarCiclos` y manda a guardar: ciclos
 * a crear o actualizar (por inicio) y los que borrar (por id).
 */
export function validarCiclos(body: any, hoy: string): Ok<{ escribir: CicloUpsert[]; borrar: string[] }> | Err {
  const escribirRaw = body?.escribir ?? []
  const borrarRaw = body?.borrar ?? []
  if (!Array.isArray(escribirRaw) || !Array.isArray(borrarRaw)) return { ok: false, error: 'Formato inválido' }
  if (escribirRaw.length + borrarRaw.length === 0) return { ok: false, error: 'Nada que guardar' }
  if (escribirRaw.length > 60 || borrarRaw.length > 60) return { ok: false, error: 'Demasiados ciclos' }

  const escribir: CicloUpsert[] = []
  for (const o of escribirRaw) {
    const inicio = validarFecha(o?.inicio, hoy)
    if (!inicio) return { ok: false, error: 'Fecha de inicio inválida' }
    const fin = o?.fin == null ? null : validarFecha(o.fin, hoy)
    if (o?.fin != null && (!fin || fin < inicio)) return { ok: false, error: 'Fecha de fin inválida' }
    if (!ESTADOS_CICLO.includes(o?.estado)) return { ok: false, error: 'Estado de ciclo inválido' }
    if ((o.estado === 'abierto') !== (fin == null)) return { ok: false, error: 'Un ciclo abierto no tiene fin y uno cerrado sí' }
    const dias = o?.diasCiclo == null ? null : Number(o.diasCiclo)
    if (dias != null && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) return { ok: false, error: 'Duración inválida' }
    const snap = o?.snapshot ?? null
    if (snap != null && (typeof snap !== 'object' || Array.isArray(snap) || JSON.stringify(snap).length > MAX_SNAPSHOT)) {
      return { ok: false, error: 'Foto del ciclo inválida' }
    }
    if (o.estado !== 'abierto' && snap == null) return { ok: false, error: 'Un ciclo cerrado necesita su foto' }
    escribir.push({ inicio, fin, dias_ciclo: dias, estado: o.estado, snapshot: snap, revisar: o?.revisar === true })
  }
  const borrar: string[] = []
  for (const id of borrarRaw) {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'Id de ciclo inválido' }
    borrar.push(id)
  }
  return { ok: true, valor: { escribir, borrar } }
}

