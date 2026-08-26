/**
 * Siembra una cuenta de DEMO de Finanzas con datos falsos, para recorrer la
 * app a mano sin tocar los datos reales.
 *
 *   node scripts/seed-demo-finanzas.mjs
 *
 * Es idempotente por borrado: si el usuario de demo ya existe, se elimina
 * entero (cascade se lleva sus datos) y se vuelve a crear desde cero. Así el
 * estado es siempre el mismo y la tabla de revisión siempre cuadra.
 *
 * Casi todo se escribe **por la API**, no por REST directo, para que pase por
 * las mismas validaciones que un usuario real: el piso de ahorro, el
 * justificativo del retiro, la dirección declarada, el reparto de compartidos.
 * Si algo de esto empieza a fallar, es que se rompió una regla de negocio —
 * el script sirve también como prueba de humo.
 *
 * Lo único que va por REST de servicio es lo que la API deliberadamente no
 * deja hacer: retroceder fechas de creación y dar el acceso al proyecto.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(root, '.env.local'), 'utf8')
const env = k => raw.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1].trim().replace(/^"|"$/g, '')

const URL_ = env('NEXT_PUBLIC_SUPABASE_URL')
const SRV = env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const BASE = process.env.FZ_BASE_URL ?? 'http://localhost:3000'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@acerohub.app'
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Finanzas-2026'

const srv = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: {
    apikey: SRV, Authorization: `Bearer ${SRV}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
    ...init.headers,
  },
})

let COOKIE = null
const api = (path, init = {}) => fetch(`${BASE}/api/finanzas${path}`, {
  ...init, headers: { Cookie: COOKIE, 'Content-Type': 'application/json', ...init.headers },
})

const fallos = []
async function POST(path, body) {
  const r = await api(path, { method: 'POST', body: JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (r.status >= 400) fallos.push(`POST ${path} → ${r.status} ${JSON.stringify(j)}`)
  return j
}
async function PATCH(path, body) {
  const r = await api(path, { method: 'PATCH', body: JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (r.status >= 400) fallos.push(`PATCH ${path} → ${r.status} ${JSON.stringify(j)}`)
  return j
}

// ── fechas relativas a hoy, para que la demo no envejezca ──────────────────
const hoy = new Date()
const iso = d => d.toISOString().slice(0, 10)
const diasAtras = n => { const d = new Date(hoy); d.setDate(d.getDate() - n); return iso(d) }
const mesesAtras = n => { const d = new Date(hoy); d.setMonth(d.getMonth() - n); return d }
const HOY = iso(hoy)
const MES_PASADO = `${iso(mesesAtras(1)).slice(0, 7)}-01`
const enMesPasado = dia => `${MES_PASADO.slice(0, 7)}-${String(dia).padStart(2, '0')}`

async function borrarSiExiste() {
  const lista = await srv(`/auth/v1/admin/users?page=1&per_page=200`).then(r => r.json())
  const previo = (lista.users ?? []).find(u => u.email === DEMO_EMAIL)
  if (previo) {
    await srv(`/auth/v1/admin/users/${previo.id}`, { method: 'DELETE' })
    console.log('· usuario de demo anterior eliminado')
  }
}

async function crearUsuario() {
  const u = await srv('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
      user_metadata: { name: 'Demo Finanzas' },
    }),
  }).then(r => r.json())
  if (!u.id) throw new Error('no se pudo crear el usuario: ' + JSON.stringify(u))

  // El trigger `handle_new_user` ya creó el profile; el nombre se completa acá
  // por si el metadata no llegó.
  await srv(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'Demo Finanzas' }),
  })

  // Acceso al proyecto: sin esta fila el Hub no muestra la mini-app.
  const [proyecto] = await srv('/rest/v1/projects?slug=eq.finanzas&select=id').then(r => r.json())
  if (!proyecto) throw new Error('no existe el proyecto finanzas en la tabla projects')
  await srv('/rest/v1/project_access', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, project_id: proyecto.id }),
  })

  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  }).then(r => r.json())
  COOKIE = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`
  return u.id
}

async function sembrar(userId) {
  // Categorías y tasas iniciales — el mismo botón que hay en Ajustes.
  await POST('/seed', {})
  const cats = (await api('/categories').then(r => r.json())).categories ?? []
  // 'Otros' existe en gasto y en ingreso: el kind no es opcional.
  const cat = (nombre, kind = 'gasto') => cats.find(c => c.name === nombre && c.kind === kind)?.id ?? null

  // ── Cuentas ──────────────────────────────────────────────────────────────
  // Una en Bs, una en USDT, una de inversión (para ver que no aparece en los
  // pickers de gasto) y una que va a terminar con plata apartada.
  const efectivo = (await POST('/accounts', {
    name: 'Efectivo', currency: 'BOB', initial_balance: 3200, initial_balance_date: diasAtras(90),
  })).account
  const banco = (await POST('/accounts', {
    name: 'Banco Unión', currency: 'BOB', initial_balance: 9200, initial_balance_date: diasAtras(90),
  })).account
  const binance = (await POST('/accounts', {
    name: 'Binance', currency: 'USDT', initial_balance: 180, initial_balance_date: diasAtras(90),
  })).account
  const inversion = (await POST('/accounts', {
    name: 'Cripto largo plazo', currency: 'USD', initial_balance: 2100,
    initial_balance_date: diasAtras(90), is_investment: true,
  })).account

  // ── Personas (para los compartidos y las deudas) ─────────────────────────
  const persona = async name => (await POST('/people', { name })).person
  const ana = await persona('Ana')
  const bruno = await persona('Bruno')

  // ── Ahorros ──────────────────────────────────────────────────────────────
  // Uno con monto fijo y meta, uno por porcentaje, uno en Bs (para ver la
  // bandera y el filtro por moneda) y el cajón de sastre sin reparto propio.
  const emergencias = (await POST('/savings-goals', {
    name: 'Ahorro para emergencias', currency: 'USDT',
    allocation_type: 'fixed', allocation_value: 60, target_amount: 600,
  })).goal
  const viaje = (await POST('/savings-goals', {
    name: 'Ahorro para el viaje', currency: 'USDT',
    allocation_type: 'percent', allocation_value: 25, target_amount: 900,
    target_date: iso(new Date(hoy.getFullYear() + 1, 1, 1)),
  })).goal
  const auto = (await POST('/savings-goals', {
    name: 'Ahorro para el auto', currency: 'BOB',
    allocation_type: 'fixed', allocation_value: 700, target_amount: 21000,
  })).goal
  const patrimonio = (await POST('/savings-goals', {
    name: 'Patrimonio', currency: 'USDT', is_catchall: true,
  })).goal

  // Nacen hoy; se retroceden para que el cierre del mes pasado los tenga en
  // cuenta (un ahorro creado después del mes que se cierra no participa).
  await srv(`/rest/v1/fin_savings_goals?user_id=eq.${userId}`, {
    method: 'PATCH', body: JSON.stringify({ created_at: `${MES_PASADO}T00:00:00Z` }),
  })

  // ── Movimientos del mes pasado: sueldo, gastos y aportes ─────────────────
  const tx = body => POST('/transactions', body)

  await tx({ type: 'ingreso', date: enMesPasado(5), account_id: banco.id, amount: 6300, description: 'Sueldo', category_id: cat('Sueldo', 'ingreso') })
  await tx({ type: 'gasto', date: enMesPasado(6), account_id: banco.id, amount: 2100, description: 'Alquiler', category_id: cat('Vivienda') })
  await tx({ type: 'gasto', date: enMesPasado(9), account_id: efectivo.id, amount: 380, description: 'Feria', category_id: cat('Comida') })
  await tx({ type: 'gasto', date: enMesPasado(14), account_id: banco.id, amount: 540, description: 'Supermercado', category_id: cat('Comida') })
  await tx({ type: 'gasto', date: enMesPasado(18), account_id: efectivo.id, amount: 210, description: 'Taxis', category_id: cat('Transporte') })

  // ── Este mes ─────────────────────────────────────────────────────────────
  await tx({ type: 'ingreso', date: diasAtras(20), account_id: banco.id, amount: 6300, description: 'Sueldo', category_id: cat('Sueldo', 'ingreso') })
  await tx({ type: 'gasto', date: diasAtras(19), account_id: banco.id, amount: 2100, description: 'Alquiler', category_id: cat('Vivienda') })
  await tx({ type: 'gasto', date: diasAtras(15), account_id: efectivo.id, amount: 295, description: 'Feria del sábado', category_id: cat('Comida') })
  await tx({ type: 'gasto', date: diasAtras(12), account_id: banco.id, amount: 160, description: 'Farmacia', category_id: cat('Salud') })
  await tx({ type: 'gasto', date: diasAtras(8), account_id: efectivo.id, amount: 120, description: 'Café con Ana', category_id: cat('Ocio') })
  await tx({ type: 'gasto', date: diasAtras(4), account_id: banco.id, amount: 430, description: 'Ropa', category_id: cat('Personal') })

  // ── Aportes ──────────────────────────────────────────────────────────────
  // Desde la Ronda 8 la plata entra a un ahorro por dos caminos: un fijo de
  // ahorro registrado, o el reparto del cierre de mes. No desde Movimientos.
  // Acá se usa el primero: se crea el fijo, se registra, y listo.
  const aportar = async ({ goalId, fromId, toId, amount, currency, date, name }) => {
    const fijo = (await POST('/recurring', {
      name, amount, currency, savings_goal_id: goalId, to_account_id: toId,
      starts_on: date, day_of_month: Number(date.slice(8, 10)), icon: 'pig-money',
    }))?.recurring
    if (!fijo) return null
    const reg = await POST(`/recurring/${fijo.id}/register`, {
      account_id: fromId, to_account_id: toId, date,
    })
    return reg?.transaction ?? null
  }

  await aportar({
    goalId: emergencias.id, fromId: banco.id, toId: binance.id,
    amount: 1400, currency: 'BOB', date: diasAtras(18), name: 'Aporte a emergencias',
  })
  await aportar({
    goalId: viaje.id, fromId: banco.id, toId: binance.id,
    amount: 1050, currency: 'BOB', date: diasAtras(17), name: 'Aporte al viaje',
  })
  await aportar({
    goalId: auto.id, fromId: banco.id, toId: efectivo.id,
    amount: 700, currency: 'BOB', date: diasAtras(10), name: 'Aporte al auto',
  })

  // Un retiro CON motivo, para ver cómo se ve en el historial. Este sí vive en
  // Movimientos: romper un ahorro pasa en el momento, no por plan.
  await tx({
    type: 'gasto', date: diasAtras(3), account_id: binance.id, amount: 45,
    savings_goal_id: viaje.id, savings_reason: 'cambio_planes',
    description: 'Adelanto de pasajes', category_id: cat('Ocio'),
  })

  // Y un traslado: el ahorro del auto pasa de Efectivo a Banco Unión. No es
  // ingreso ni gasto — el saldo del ahorro queda igual, solo cambia de cuenta.
  await POST(`/savings-goals/${auto.id}/move`, {
    from_account_id: efectivo.id, to_account_id: banco.id, amount: 300,
    date: diasAtras(2), description: 'Lo paso al banco',
  })

  // ── Fijos ────────────────────────────────────────────────────────────────
  const fijo = body => POST('/recurring', body)

  await fijo({
    name: 'Alquiler', amount: 2100, currency: 'BOB', category_id: cat('Vivienda'),
    account_id: banco.id, day_of_month: 5, starts_on: diasAtras(120), icon: 'home',
  })
  // Compartido: la fila "ver las personas con su monto" de la tabla.
  await fijo({
    name: 'Spotify Familiar', amount: 45, currency: 'BOB', category_id: cat('Suscripciones'),
    account_id: banco.id, day_of_month: 12, starts_on: diasAtras(120), icon: 'music',
    splits: [{ person_id: ana.id, amount: null }, { person_id: bruno.id, amount: null }],
  })
  await fijo({
    name: 'Internet', amount: 350, currency: 'BOB', category_id: cat('Servicios'),
    account_id: banco.id, day_of_month: 20, starts_on: diasAtras(120), icon: 'wifi',
  })
  // Fijo de AHORRO: genera una transferencia tageada, no un gasto.
  await fijo({
    name: 'Ahorro mensual del auto', amount: 700, currency: 'BOB',
    savings_goal_id: auto.id, to_account_id: banco.id,
    day_of_month: 25, starts_on: diasAtras(120), icon: 'pig-money',
  })

  // ── Deudas con cuotas ────────────────────────────────────────────────────
  // Un plan no se crea de la nada: se arma sobre una deuda existente, que
  // queda partida en cuotas iguales (§ Sprint 4).
  const deuda = await POST('/debts', {
    person_id: ana.id, concept: 'Préstamo a Ana', amount: 1200, currency: 'BOB',
    incurred_on: diasAtras(65),
  })
  const deudaId = deuda?.debt?.id
  if (deudaId) {
    await POST('/debt-plans', {
      debt_id: deudaId, installments: 4, frequency: 'mensual',
      starts_on: diasAtras(60), interest_rate: 0, mode: 'iguales',
    })
    // `/debts` no devuelve una lista plana: viene agrupada por persona.
    const resumen = await api('/debts').then(r => r.json())
    const cuotas = (resumen.por_persona ?? [])
      .flatMap(g => g.debts ?? [])
      .filter(d => d.plan_id)
      .sort((a, b) => (a.incurred_on ?? '').localeCompare(b.incurred_on ?? ''))
    // Dos cobradas → la fila del check de la tabla; dos pendientes.
    for (const [i, c] of cuotas.slice(0, 2).entries()) {
      await POST('/debts/settle', {
        split_ids: [c.id], account_id: efectivo.id, amount: c.amount,
        date: diasAtras(30 - i * 5),
      })
    }
  }

  // ── Pasanaku ─────────────────────────────────────────────────────────────
  const pas = await POST('/pasanaku', {
    name: 'Pasanaku de la oficina', account_id: efectivo.id, currency: 'BOB',
    contribution_amount: 300, total_slots: 6, my_slot: 4, start_date: diasAtras(60),
  })
  if (pas?.pasanaku?.id) {
    await POST(`/pasanaku/${pas.pasanaku.id}/aporte`, { account_id: efectivo.id, amount: 300, date: diasAtras(55) })
    await POST(`/pasanaku/${pas.pasanaku.id}/aporte`, { account_id: efectivo.id, amount: 300, date: diasAtras(25) })
  }

  // ── Presupuesto ──────────────────────────────────────────────────────────
  // Cada línea es un POST propio con las categorías que agrupa.
  for (const [nombre, monto] of [['Comida', 1400], ['Transporte', 500], ['Ocio', 400], ['Personal', 600]]) {
    const id = cat(nombre)
    if (id) await POST('/budgets', { category_ids: [id], name: nombre, currency: 'BOB', amount: monto })
  }

  return { efectivo, banco, binance, inversion, emergencias, viaje, auto, patrimonio }
}

const previoExiste = process.argv.includes('--keep')
if (!previoExiste) await borrarSiExiste()
const userId = await crearUsuario()
console.log(`· usuario creado: ${DEMO_EMAIL}`)
const creado = await sembrar(userId)

const cuentas = (await api('/accounts').then(r => r.json())).accounts ?? []
const metas = (await api('/savings-goals').then(r => r.json())).goals ?? []

console.log('\n── Cuentas ──')
for (const a of cuentas) {
  console.log(`  ${a.name.padEnd(20)} ${String(a.balance).padStart(10)} ${a.currency}` +
              (a.savings_balance > 0 ? `   · ${a.savings_balance} apartados` : ''))
}
console.log('\n── Ahorros ──')
for (const g of metas) {
  console.log(`  ${g.name.padEnd(26)} ${String(g.balance_usd).padStart(8)} USD` +
              (g.is_catchall ? '  (cajón de sastre)' : ''))
}

if (fallos.length > 0) {
  console.log(`\n⚠️  ${fallos.length} llamada(s) fallaron:`)
  for (const f of fallos) console.log('   ' + f)
} else {
  console.log('\n✅ Todo se sembró por la API sin un solo rechazo.')
}

console.log(`\nEntrá con:\n  ${DEMO_EMAIL}\n  ${DEMO_PASSWORD}\n`)
