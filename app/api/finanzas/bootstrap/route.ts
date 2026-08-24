import { requireUser, createAdminClient } from '@/lib/supabase-server'
import { NextResponse, after } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { readQuotes, refreshQuotes, quotesAreStale, QUOTE_PAIRS } from '@/lib/finanzas/quotes'
import { loadAccounts, loadAvailableMonths, loadBudgets, loadCategories, loadDebtPlans, loadPasanaku, loadPeople, loadRecurring, loadSavingsGoals, loadShared, loadTransactions } from '@/lib/finanzas/load'
import { monthRange, todayISO } from '@/lib/finanzas/transactions'

/**
 * Todo lo que la mini-app necesita para pintar la Home, en un solo viaje.
 *
 * Antes eran seis: cuatro del provider (cuentas, categorías, personas,
 * compartidos) más dos de la pantalla (el mes y los últimos movimientos). Seis
 * invocaciones, seis verificaciones de JWT y seis arranques en frío para una
 * sola apertura de la app.
 *
 * `from`/`to` los manda el cliente: el mes tiene que ser el suyo, no el del
 * servidor, que en Vercel corre en UTC.
 */
export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(request.url)
  const fallback = monthRange()
  const range = {
    from: url.searchParams.get('from') || fallback.from,
    to: url.searchParams.get('to') || fallback.to,
  }
  const recentLimit = Math.min(num(url.searchParams.get('recent'), 5), 50)
  // El tope del mes lo fija el cliente: la respuesta se guarda bajo la clave de
  // caché que incluye ese `limit`, así que servir otro dejaría el caché mintiendo.
  const monthLimit = Math.min(num(url.searchParams.get('limit'), 500), 500)

  // Refrescar cotizaciones son tres llamadas a APIs externas con 4s de timeout
  // cada una. Ponerlas en el camino crítico significaba que la primera apertura
  // del día esperaba a dolarapi antes de ver su patrimonio. Con una cotización
  // de hasta media hora de antigüedad el patrimonio no cambia en la práctica,
  // así que se sirve con lo que hay y el refresco se manda después de responder.
  //
  // La excepción es no tener ninguna: ahí sí hay que esperar, porque sin
  // cotización las tasas caen a los valores por defecto y el número sería falso.
  let quotes = await readQuotes(supabase)
  const vacias = QUOTE_PAIRS.every(p => !quotes[p])

  if (vacias) {
    quotes = await refreshQuotes(createAdminClient())
  } else if (quotesAreStale(quotes)) {
    after(async () => {
      try { await refreshQuotes(createAdminClient()) } catch {}
    })
  }

  // `today` lo manda el cliente por la misma razón que el rango: el día del
  // usuario, no el del servidor, que en Vercel corre en UTC. De él depende si
  // un fijo está vencido o todavía no.
  const today = url.searchParams.get('today') || todayISO()

  // `accounts` ya resuelve las tasas (`ensureRates`) y `recurring` es lo que
  // `loadBudgets` necesita para "comprometido" — se piden primero para
  // pasárselos hechos, en vez de que cada uno los vuelva a pedir por su
  // cuenta un segundo después en el mismo viaje.
  const [accounts, recurring] = await Promise.all([
    loadAccounts(supabase, userId, quotes),
    loadRecurring(supabase, userId, today),
  ])

  const [categories, people, shared, plans, pasanaku, budgets, savings, months, month, recent] = await Promise.all([
    loadCategories(supabase, userId),
    loadPeople(supabase, userId),
    loadShared(supabase, userId, range),
    loadDebtPlans(supabase, userId),
    loadPasanaku(supabase, userId),
    // El quick-add necesita esto para poder bloquear un gasto que se pasa del
    // presupuesto en CUALQUIER pantalla, no solo en /presupuesto — por eso va
    // acá desde el día uno y no se difiere (Decisiones Técnicas §2.1).
    loadBudgets(supabase, userId, today, { rates: accounts.rates, recurring }),
    // Mismo motivo que budgets: el quick-add necesita la lista de ahorros
    // para el picker de "a qué ahorro corresponde" en cualquier pantalla.
    loadSavingsGoals(supabase, userId, today, { rates: accounts.rates }),
    loadAvailableMonths(supabase, userId),
    loadTransactions(supabase, userId, { from: range.from, to: range.to, limit: monthLimit }),
    loadTransactions(supabase, userId, { limit: recentLimit }),
  ])

  return NextResponse.json({
    // Le sirve al cliente para no reusar el snapshot cacheado de otra sesión.
    uid: userId,
    ...accounts,
    categories,
    people,
    shared,
    recurring,
    plans,
    pasanaku,
    budgets,
    savings,
    months,
    // Las dos consultas que la Home ya iba a hacer igual. El cliente las guarda
    // en su caché bajo la misma clave con la que después las busca.
    tx: { month: month.data, recent: recent.data },
  })
}
