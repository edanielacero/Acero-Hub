import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireInterno } from '../_shared/internal-auth.ts'
import { enviarPush, type Suscripcion } from '../_shared/push.ts'
import {
  avisoDeAnotar, avisosDeAhorro, avisosDeDeudas, avisosDeFijos, avisosDePresupuesto,
  tocaRecordatorio, type Notif, type NotifKind,
} from '../_shared/finanzas/notifications.ts'
import {
  loadAccounts, loadBudgets, loadRecurring, loadSavingsGoals, loadShared,
} from '../_shared/finanzas/load.ts'
import { readQuotes } from '../_shared/finanzas/quotes.ts'
import { monthRange } from '../_shared/finanzas/transactions.ts'

/**
 * Evalúa y manda las notificaciones de Finanzas.
 *
 * Spec: documentos/finanzas/sprint_9_notificaciones.md
 *
 * La invoca `pg_cron` cada 15 minutos. Vercel Hobby permite un cron por día y
 * ya está ocupado, así que el scheduler vive en Postgres — igual que en
 * Acrosoft CRM, pero con la infraestructura del Hub.
 *
 * IDEMPOTENTE POR DISEÑO. Vuelve a evaluar todo desde cero en cada corrida y
 * descarta lo que ya está en `fin_notifications`. Es lo único que evita que un
 * fijo vencido avise 96 veces por día, y lo que permite subir o bajar la
 * frecuencia del cron sin tocar nada más.
 *
 * No reescribe la lógica de dominio: importa la misma que usa la app, copiada
 * a Deno por `scripts/build-edge-shared.mjs` y verificada por la suite `unit`.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface Prefs {
  user_id: string
  fijos: boolean
  presupuesto: boolean
  ahorro: boolean
  deudas: boolean
  recordar_anotar: boolean
  recordar_mediodia: string
  recordar_noche: string
  timezone: string
}

/** Un aviso listo para mandar, ya con el perfil del que nació. */
interface Pendiente extends Notif {
  profileId: string | null
  profileName: string | null
}

Deno.serve(async (req) => {
  const rechazo = requireInterno(req)
  if (rechazo) return rechazo

  const inicio = Date.now()
  const resumen = {
    usuarios: 0, evaluados: 0, nuevos: 0, enviados: 0, muertas: 0,
    // Los usuarios cuya evaluación falló. Va en la respuesta y no solo al
    // log: el cron no mira los logs, y un fallo silencioso acá significa
    // notificaciones que nunca llegan sin que nada lo diga.
    fallaron: [] as { userId: string; error: string }[],
  }

  try {

  // Solo los usuarios con al menos un dispositivo suscrito. Evaluar a alguien
  // que no puede recibir nada sería trabajo tirado.
  const { data: subsRows } = await supabase
    .from('fin_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')

  const porUsuario = new Map<string, Suscripcion[]>()
  for (const s of subsRows ?? []) {
    const lista = porUsuario.get(s.user_id) ?? []
    lista.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })
    porUsuario.set(s.user_id, lista)
  }

  for (const [userId, subs] of porUsuario) {
    resumen.usuarios++

    // Cada usuario en su propio try: sin esto, un solo perfil con datos que
    // hacen fallar un cálculo tumbaba la corrida entera y NADIE recibía nada.
    // Es exactamente lo que pasó con el bug de `loadBudgets`, pero el alcance
    // era peor de lo necesario: bastaba un usuario roto para callar a todos.
    try {
    const prefs = await leerPrefs(userId)
    const pendientes = await evaluarUsuario(userId, prefs)
    resumen.evaluados += pendientes.length

    // Lo que ya se mandó alguna vez no se vuelve a mandar.
    const nuevos = await filtrarYaEnviados(userId, pendientes)
    resumen.nuevos += nuevos.length

    for (const n of nuevos) {
      const r = await enviarPush(supabase, subs, {
        title: n.title,
        // El nombre del perfil va al final, después de un ·: casi siempre vas a
        // tener uno solo activo, pero está cuando hace falta.
        body: n.profileName ? `${n.body} · ${n.profileName}` : n.body,
        url: n.profileId ? conPerfil(n.url, n.profileId) : n.url,
      })
      resumen.enviados += r.ok
      resumen.muertas += r.muertas

      // Se registra aunque el envío haya fallado: si el problema es del
      // servicio de push, reintentar en 15 minutos mandaría el mismo aviso otra
      // vez. Un aviso perdido es mejor que uno repetido en bucle.
      await supabase.from('fin_notifications').insert({
        user_id: userId,
        profile_id: n.profileId,
        kind: n.kind,
        dedupe_key: n.dedupeKey,
        title: n.title,
        body: n.body,
        url: n.url,
      })
    }

    // Cuándo fue la última vez que este dispositivo recibió algo de verdad. Es
    // el dato que dice si un teléfono sigue escuchando o quedó mudo sin que su
    // suscripción llegara a devolver 410.
    if (resumen.enviados > 0) {
      await supabase
        .from('fin_push_subscriptions')
        .update({ last_ok_at: new Date().toISOString() })
        .in('id', subs.map(x => x.id))
    }
    } catch (err) {
      console.error(`usuario ${userId}:`, err)
      resumen.fallaron.push({ userId, error: String((err as Error)?.message ?? err) })
    }
  }

  return new Response(JSON.stringify({ ...resumen, ms: Date.now() - inicio }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
  } catch (err) {
    // Un 500 crudo en un job programado es invisible: nadie lo mira. Devolver el
    // detalle deja el problema a la vista de quien invoque la función a mano.
    console.error('finanzas-notificaciones:', err)
    return new Response(JSON.stringify({
      error: String((err as Error)?.message ?? err),
      stack: String((err as Error)?.stack ?? '').split('\n').slice(0, 6),
      parcial: resumen,
    }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

/* ─── Evaluación ───────────────────────────────────────────────────────────── */

async function evaluarUsuario(userId: string, prefs: Prefs): Promise<Pendiente[]> {
  const out: Pendiente[] = []

  // 1 · Lo que nace de un perfil.
  const { data: perfiles } = await supabase
    .from('fin_profiles')
    .select('id, name, notify, archived')
    .eq('user_id', userId)

  const quotes = await readQuotes(supabase)

  for (const p of perfiles ?? []) {
    // Los dos niveles se combinan con Y: el tipo tiene que estar encendido para
    // el usuario, Y el perfil tiene que notificar.
    if (!p.notify || p.archived) continue

    // Y cada perfil en el suyo: que la empresa tenga un dato raro no debería
    // dejarte sin los avisos de tu perfil personal.
    try {

    const scope = { userId, profileId: p.id }
    const hoy = hoyEnZona(prefs.timezone)

    const avisos: Notif[] = []
    let rec: Awaited<ReturnType<typeof loadRecurring>> | null = null

    if (prefs.fijos || prefs.presupuesto || prefs.ahorro) {
      const cuentas = await loadAccounts(supabase, scope, quotes)

      // Los fijos se cargan si los pide el usuario O si hacen falta para el
      // presupuesto: `loadBudgets` toma `precomputed` como todo-o-nada — si
      // recibe el objeto, da por hecho que trae `rates` Y `recurring`, y saltea
      // cargarlos. Pasarle solo `rates` lo hacía reventar con "Cannot read
      // properties of null (reading 'recurring')" en cuanto el perfil tenía
      // aunque sea una línea de presupuesto.
      rec = (prefs.fijos || prefs.presupuesto)
        ? await loadRecurring(supabase, scope, hoy)
        : null

      if (prefs.fijos && rec) {
        avisos.push(...avisosDeFijos(rec.recurring, hoy, cuentas.rates))
      }
      if (prefs.presupuesto && rec) {
        const b = await loadBudgets(supabase, scope, hoy, { rates: cuentas.rates, recurring: rec })
        avisos.push(...avisosDePresupuesto(b, hoy.slice(0, 7)))
      }
      if (prefs.ahorro) {
        const s = await loadSavingsGoals(supabase, scope, hoy, { rates: cuentas.rates })
        avisos.push(...avisosDeAhorro(s.goals, s.pending_period, s.pending_surplus_usd))
      }
    }

    if (prefs.deudas) {
      const sh = await loadShared(supabase, scope, monthRange(new Date(`${hoy}T12:00:00`)))
      avisos.push(...avisosDeDeudas(sh.por_persona))
    }

    for (const a of avisos) {
      out.push({
        ...a,
        profileId: p.id,
        profileName: p.name,
        // La clave lleva el perfil: el mismo fijo en dos perfiles son dos
        // avisos distintos, no uno repetido.
        dedupeKey: `${p.id}:${a.dedupeKey}`,
      })
    }
    } catch (err) {
      console.error(`perfil ${p.name}:`, err)
    }
  }

  // 2 · El recordatorio de anotar, que no sale de ningún perfil.
  if (prefs.recordar_anotar) {
    const { fecha, hora } = ahoraEnZona(prefs.timezone)
    for (const [momento, config] of [
      ['mediodia', prefs.recordar_mediodia],
      ['noche', prefs.recordar_noche],
    ] as const) {
      if (!tocaRecordatorio(hora, config)) continue
      out.push({ ...avisoDeAnotar(fecha, momento), profileId: null, profileName: null })
    }
  }

  return out
}

/* ─── Anti-repetición ──────────────────────────────────────────────────────── */

async function filtrarYaEnviados(userId: string, avisos: Pendiente[]): Promise<Pendiente[]> {
  if (avisos.length === 0) return []

  const claves = avisos.map(a => a.dedupeKey)
  const { data: ya } = await supabase
    .from('fin_notifications')
    .select('dedupe_key')
    .eq('user_id', userId)
    .in('dedupe_key', claves)

  const vistas = new Set((ya ?? []).map(r => r.dedupe_key))
  return avisos.filter(a => !vistas.has(a.dedupeKey))
}

/* ─── Auxiliares ───────────────────────────────────────────────────────────── */

async function leerPrefs(userId: string): Promise<Prefs> {
  const { data } = await supabase
    .from('fin_notif_prefs').select('*').eq('user_id', userId).maybeSingle()

  // Sin fila todavía: los defaults de la tabla. Alguien que activó el push y no
  // entró a Ajustes quiere que le avisen de todo.
  return (data ?? {
    user_id: userId,
    fijos: true, presupuesto: true, ahorro: true, deudas: true, recordar_anotar: true,
    recordar_mediodia: '14:00', recordar_noche: '21:00', timezone: 'America/La_Paz',
  }) as Prefs
}

/**
 * La fecha y la hora del USUARIO, no las del servidor.
 *
 * El job corre en UTC. Sin convertir, el recordatorio de las 21:00 llegaría a
 * las 17:00 en Bolivia, y un fijo que vence hoy se leería como vencido ayer.
 * Es el mismo problema que los Sprints 6 y 7 resolvieron pasando `today` desde
 * el cliente — acá no hay cliente, así que la zona viene de las preferencias.
 */
function ahoraEnZona(tz: string): { fecha: string; hora: string } {
  const ahora = new Date()
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ahora)
  return { fecha, hora }
}

function hoyEnZona(tz: string): string {
  return ahoraEnZona(tz).fecha
}

/** Que tocar el aviso abra la app EN el perfil del que salió. */
function conPerfil(url: string, profileId: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}profile=${profileId}`
}
