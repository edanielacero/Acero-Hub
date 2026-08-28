/**
 * Entrada y salida de números en Gas.
 *
 * Vive acá y no en lib/finanzas aunque aquella tenga un `parseDecimalInput`
 * parecido: son dos mini-apps independientes y Gas necesita bastante menos
 * (dos monedas no, BTC tampoco, negativos tampoco). Acoplarlas sería atar el
 * teclado de Gas a los cambios de una app que no tiene nada que ver.
 */

/**
 * Normaliza lo que se tipea en un campo numérico.
 *
 * Acepta **coma y punto** como separador decimal. El usuario está en Bolivia y
 * el teclado decimal de iOS le muestra la coma del locale: si la coma se
 * descartara, escribir "0,70" daría "070" → 70 Bs/km. Un error de 100× que no
 * avisa.
 */
export function parseNumeroInput(raw: string, decimales = 2): string {
  // La coma pasa a punto ANTES de filtrar, para no perderla.
  const limpio = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')

  // Solo el primer separador cuenta; el resto se ignora.
  const [entero, ...resto] = limpio.split('.')
  const cuerpo = resto.length > 0 ? `${entero}.${resto.join('').slice(0, decimales)}` : entero

  // Se DEVUELVE con coma, que es lo que el usuario espera ver. El campo de
  // "Iniciar viaje" mostraba `12120.2` justo encima de un texto que decía
  // `12.120,2 km`: el mismo número escrito de dos formas, con un renglón de
  // distancia. Adentro se sigue trabajando con punto (ver `numeroDeInput`).
  return cuerpo.replace('.', ',')
}

/** El string de un campo convertido a número, o NaN si está vacío. */
export function numeroDeInput(raw: string): number {
  const limpio = raw.trim().replace(',', '.')
  return limpio === '' ? NaN : Number(limpio)
}

/**
 * Un número guardado, en la forma en que se escribe en un campo.
 *
 * Para precargar: el odómetro del viaje anterior, el promedio del auto que se
 * va a corregir. `String(12120.2)` daría `"12120.2"`, con punto.
 */
export function paraInput(n: number): string {
  return String(n).replace('.', ',')
}

const BS = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `Bs 1.234,50`. Negativo con el signo adelante: `-Bs 12,00`. */
export function fmtBs(n: number): string {
  const signo = n < 0 ? '-' : ''
  return `${signo}Bs ${BS.format(Math.abs(n))}`
}

const KM = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

export function fmtKm(n: number): string {
  return `${KM.format(n)} km`
}

/** El odómetro, sin decimales de más: `123.456,7`. */
export function fmtOdometro(n: number): string {
  return KM.format(n)
}

const ZONA = 'America/La_Paz'

/** `mié 28 ago · 14:32`, en hora de Bolivia y no en la del servidor. */
export function fmtFechaHora(iso: string): string {
  const d = new Date(iso)
  const fecha = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short',
  }).format(d)
  const hora = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return `${fecha} · ${hora}`
}

/** Solo la hora, para el encabezado del viaje en curso. */
export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/**
 * El mes al que pertenece un movimiento, como `YYYY-MM`, **en hora de Bolivia**.
 *
 * Se arma con `formatToParts` y no cortando el ISO: un viaje de las 21:00 del
 * 31 de agosto en La Paz es 1 de septiembre en UTC, y el filtro por mes lo
 * habría mandado al mes equivocado.
 */
export function mesDe(iso: string): string {
  const partes = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(iso))

  const año = partes.find(p => p.type === 'year')?.value ?? ''
  const mes = partes.find(p => p.type === 'month')?.value ?? ''
  // El relleno a mano no es paranoia: con `month: '2-digit'` el locale es-BO
  // igual devuelve "8", y entonces "2026-8" ordena DESPUÉS de "2026-11" al
  // comparar como texto — los chips del filtro saldrían en desorden.
  return `${año}-${mes.padStart(2, '0')}`
}

/** `2026-08` → `ago 2026`. */
export function fmtMes(mes: string): string {
  const [año, m] = mes.split('-')
  const nombre = new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', month: 'short' })
    .format(new Date(Date.UTC(Number(año), Number(m) - 1, 1)))
    .replace('.', '')
  return `${nombre} ${año}`
}
