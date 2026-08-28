// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import { round2, toUsd } from './money.ts'
import type {
  BudgetsPayload, PersonDebt, RateMap, RecurringWithState, SavingsGoalWithBalance,
} from './types.ts'

/**
 * Qué merece un aviso, y con qué texto.
 *
 * Spec: documentos/finanzas/sprint_9_notificaciones.md §4
 *
 * TODO ACÁ ES PURO: recibe lo que la app ya calculó y devuelve avisos. No toca
 * la red ni la base. Vive en `lib/finanzas/` y no dentro de la Edge Function
 * por dos razones:
 *
 *  1. Se prueba con la suite `unit`, sin levantar nada.
 *  2. La Edge Function importa este mismo archivo a través del puente
 *     (`scripts/build-edge-shared.mjs`), así que la notificación decide con la
 *     misma lógica que muestra la app — no con una copia que puede divergir.
 *
 * EL `dedupeKey` ES LO MÁS IMPORTANTE DE CADA AVISO. El job corre cada 15
 * minutos y vuelve a evaluar todo desde cero; lo único que evita que el mismo
 * fijo vencido avise 96 veces por día es que su clave ya esté en
 * `fin_notifications`. Si una clave es demasiado genérica, el aviso no vuelve
 * nunca; si es demasiado específica, vuelve todo el tiempo.
 */

export type NotifKind = 'fijos' | 'presupuesto' | 'ahorro' | 'deudas' | 'recordar_anotar'

export interface Notif {
  kind: NotifKind
  /** La identidad del HECHO, no del aviso. Ver el comentario de arriba. */
  dedupeKey: string
  title: string
  body: string
  /** Adónde lleva el toque. El perfil se le agrega después, en el job. */
  url: string
}

/**
 * Los umbrales.
 *
 * Fijos a propósito: la Ronda 1 eligió "encender/apagar por tipo" y nada más.
 * Están todos acá para que convertirlos en configurables sea cambiar de dónde
 * se leen, no salir a buscarlos por el archivo.
 */
export const UMBRALES = {
  /** Días de anticipación con los que se avisa un fijo o una cuota. */
  diasAntesDeVencer: 2,
  /** Porcentaje del presupuesto que dispara el primer aviso. */
  pctAviso: 90,
  /** Días que tiene que llevar abierta una deuda para que avise. */
  diasDeudaVieja: 30,
} as const

/* ─── Formato ──────────────────────────────────────────────────────────────
   El monto va adelante y sin adornos. Un aviso de plata que grita se apaga
   rápido, así que nada de signos de admiración ni "¡Atención!". */

function usd(n: number): string {
  return `$${round2(Math.abs(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dias(n: number): string {
  return n === 1 ? '1 día' : `${n} días`
}

/* ─── 1 · Fijos y cuotas ───────────────────────────────────────────────────
   `statusOf` ya resolvió si está vencido; acá solo se decide si eso merece
   avisar y con qué texto. */

export function avisosDeFijos(
  fijos: RecurringWithState[],
  hoyISO: string,
  // Un fijo guarda su monto en SU moneda; el aviso lo muestra en USD, igual que
  // el resto de la app. Las tasas llegan resueltas desde `loadAccounts`.
  rates: RateMap,
): Notif[] {
  const out: Notif[] = []

  for (const f of fijos) {
    if (f.status === 'pausado' || f.status === 'registrado') continue

    // El período va en la clave porque un fijo vence todos los meses: sin él,
    // el aviso de septiembre no saldría nunca porque el de agosto ya está.
    const periodo = f.due.slice(0, 7)

    if (f.status === 'vencido') {
      out.push({
        kind: 'fijos',
        dedupeKey: `fijo:${f.id}:${periodo}:vencido`,
        title: `${f.name} venció`,
        body: `${usd(toUsd(f.amount, f.currency, rates))} · vencía el ${Number(f.due.slice(8, 10))}`,
        url: '/finanzas/fijos',
      })
      continue
    }

    const faltan = diasEntre(hoyISO, f.due)
    if (faltan >= 0 && faltan <= UMBRALES.diasAntesDeVencer) {
      out.push({
        kind: 'fijos',
        dedupeKey: `fijo:${f.id}:${periodo}:porvencer`,
        title: faltan === 0 ? `${f.name} vence hoy` : `${f.name} vence en ${dias(faltan)}`,
        body: usd(toUsd(f.amount, f.currency, rates)),
        url: '/finanzas/fijos',
      })
    }
  }

  return out
}

/* ─── 2 · Presupuesto ─────────────────────────────────────────────────────── */

export function avisosDePresupuesto(budgets: BudgetsPayload, periodo: string): Notif[] {
  const out: Notif[] = []

  for (const l of budgets.categories) {
    if (l.amount_usd == null || l.amount_usd <= 0) continue

    const nombre = l.name ?? l.category_names.join(', ')
    const tope = l.amount_usd + l.extended_usd + l.carried_usd
    if (tope <= 0) continue
    const pct = (l.spent_usd / tope) * 100

    // Dos avisos distintos con dos claves distintas: pasar del 90% y pasarse
    // del todo son dos cosas que uno quiere saber, y la segunda no debería
    // callarse porque ya avisamos la primera.
    if (pct >= 100) {
      out.push({
        kind: 'presupuesto',
        dedupeKey: `presu:${l.line_id}:${periodo}:100`,
        title: `Te pasaste en ${nombre}`,
        body: `${usd(l.spent_usd - tope)} por encima de ${usd(tope)}`,
        url: '/finanzas/presupuesto',
      })
    } else if (pct >= UMBRALES.pctAviso) {
      out.push({
        kind: 'presupuesto',
        dedupeKey: `presu:${l.line_id}:${periodo}:${UMBRALES.pctAviso}`,
        title: `${nombre} al ${Math.floor(pct)}%`,
        body: `Te quedan ${usd(tope - l.spent_usd)} de ${usd(tope)}`,
        url: '/finanzas/presupuesto',
      })
    }
  }

  for (const c of budgets.pending_closures) {
    out.push({
      kind: 'presupuesto',
      dedupeKey: `cierre:${c.period}`,
      title: `${mesLargo(c.period)} quedó sin cerrar`,
      body: 'Decidí qué hacer con lo que sobró',
      url: '/finanzas/presupuesto',
    })
  }

  return out
}

/* ─── 3 · Ahorro ──────────────────────────────────────────────────────────── */

export function avisosDeAhorro(
  ahorros: SavingsGoalWithBalance[],
  pendingPeriod: string | null,
  pendingSurplusUsd: number,
): Notif[] {
  const out: Notif[] = []

  // Solo si de verdad sobró algo: avisar "te sobraron $0 sin repartir" es ruido.
  if (pendingPeriod && pendingSurplusUsd > 0) {
    out.push({
      kind: 'ahorro',
      dedupeKey: `sobrante:${pendingPeriod}`,
      title: `Te sobraron ${usd(pendingSurplusUsd)} en ${mesLargo(pendingPeriod)}`,
      body: 'Sin repartir entre tus ahorros',
      url: '/finanzas/ahorro',
    })
  }

  for (const g of ahorros) {
    if (!g.goal_reached || g.archived) continue
    out.push({
      kind: 'ahorro',
      dedupeKey: `meta:${g.id}`,   // una meta se cumple una vez, no por período
      title: `${g.name} llegó a su meta`,
      body: usd(g.balance_usd),
      url: '/finanzas/ahorro',
    })
  }

  return out
}

/* ─── 4 · Deudas por cobrar ───────────────────────────────────────────────── */

export function avisosDeDeudas(porPersona: PersonDebt[]): Notif[] {
  const out: Notif[] = []

  for (const p of porPersona) {
    if (p.oldest_days == null || p.oldest_days < UMBRALES.diasDeudaVieja) continue
    if (p.open_usd <= 0) continue

    // La clave lleva el umbral y no los días exactos: con `oldest_days` adentro
    // la clave cambiaría cada día y avisaría todos los días de la misma deuda.
    out.push({
      kind: 'deudas',
      dedupeKey: `deuda:${p.person.id}:${UMBRALES.diasDeudaVieja}d`,
      title: `${p.person.name} te debe hace ${dias(p.oldest_days)}`,
      body: usd(p.open_usd),
      url: '/finanzas/deudas',
    })
  }

  return out
}

/* ─── 5 · Recordar anotar ─────────────────────────────────────────────────── */

export type Momento = 'mediodia' | 'noche'

/**
 * ¿Toca mandar el recordatorio ahora?
 *
 * Llega **siempre** a la hora fijada, se haya anotado o no (decisión de la
 * Ronda 2). El costo aceptado: a veces te recuerda algo que ya hiciste. A
 * cambio es predecible y no depende de una consulta más.
 *
 * La ventana existe porque el job corre cada 15 minutos y nunca cae exactamente
 * en la hora configurada. Se mira que la hora local esté dentro de los minutos
 * siguientes al horario; la clave con la fecha impide que se mande dos veces si
 * dos corridas caen dentro de la misma ventana.
 */
export function tocaRecordatorio(
  horaLocal: string,      // 'HH:MM' en la zona del usuario
  configurada: string,    // 'HH:MM'
  ventanaMin = 15,
): boolean {
  const min = (h: string) => {
    const [hh, mm] = h.slice(0, 5).split(':').map(Number)
    return hh * 60 + mm
  }

  // El módulo de 1440 es lo que hace que la ventana cruce la medianoche.
  //
  // Con una resta simple, un recordatorio puesto a las 23:50 no se disparaba
  // NUNCA: la corrida de las 23:45 daba −5 y la de las 00:00 daba −1430,
  // porque el reloj volvía a cero. Cualquier hora entre 23:46 y 23:59 quedaba
  // en un agujero silencioso.
  const d = (min(horaLocal) - min(configurada) + 1440) % 1440
  return d < ventanaMin
}

export function avisoDeAnotar(fechaLocal: string, momento: Momento): Notif {
  return {
    kind: 'recordar_anotar',
    dedupeKey: `anotar:${fechaLocal}:${momento}`,
    title: '¿Gastaste algo hoy?',
    body: 'Anotalo antes de que se te olvide',
    url: '/finanzas?quickadd=1',
  }
}

/* ─── Auxiliares ──────────────────────────────────────────────────────────── */

/** Días de `desde` a `hasta`. Negativo si `hasta` ya pasó. */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.UTC(+desdeISO.slice(0, 4), +desdeISO.slice(5, 7) - 1, +desdeISO.slice(8, 10))
  const b = Date.UTC(+hastaISO.slice(0, 4), +hastaISO.slice(5, 7) - 1, +hastaISO.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** `'2026-08'` o `'2026-08-01'` → `'Agosto'`. */
export function mesLargo(periodo: string): string {
  const m = Number(periodo.slice(5, 7))
  const nombre = MESES[m - 1] ?? periodo
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}
