import { URL_, SRV, ANON } from './env.mjs'
import { eq, ok, section, summary } from './harness.mjs'

const BASE = process.env.FZ_BASE_URL ?? 'http://localhost:3001'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

const adminFetch = (p, i = {}) => fetch(`${URL_}${p}`, {
  ...i, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...i.headers },
})

const EMAIL = `fz-api-${Date.now()}@acerotest.local`
const PASSWORD = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
let USER_ID = null, COOKIE = null

async function setup() {
  const u = await adminFetch('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  }).then(r => r.json())
  USER_ID = u.id
  if (!USER_ID) throw new Error('sin usuario: ' + JSON.stringify(u))

  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(r => r.json())

  // Formato de cookie de @supabase/ssr: base64- + base64(JSON de la sesión).
  const payload = Buffer.from(JSON.stringify(session)).toString('base64')
  COOKIE = `sb-${REF}-auth-token=base64-${payload}`
  console.log(`Usuario de API: ${EMAIL}\n`)
}

const api = (path, init = {}) => fetch(`${BASE}/api/finanzas${path}`, {
  ...init, headers: { Cookie: COOKIE, 'Content-Type': 'application/json', ...init.headers },
})
const json = async r => { try { return await r.json() } catch { return null } }

async function run() {
  section('autenticación')
  {
    const anon = await fetch(`${BASE}/api/finanzas/accounts`)
    eq('sin cookie devuelve 401', anon.status, 401)

    const auth = await api('/accounts')
    eq('con sesión devuelve 200', auth.status, 200)
    if (auth.status !== 200) throw new Error('la cookie de sesión no funcionó; corto acá')
  }

  section('GET /accounts · usuario nuevo')
  {
    const d = await json(await api('/accounts'))
    eq('arranca sin cuentas', d.accounts, [])
    eq('patrimonio en cero', d.total_usd, 0)
    eq('la tasa por defecto llega en la respuesta', d.usd_bob_rate, 6.96)
    ok('y también cuándo se editó por última vez', typeof d.usd_bob_rate_updated_at === 'string',
       `obtenido: ${d.usd_bob_rate_updated_at}`)
  }

  section('POST /seed · idempotencia')
  {
    const a = await json(await api('/seed', { method: 'POST' }))
    eq('siembra 14 categorías', a.creadas, 14)
    const b = await json(await api('/seed', { method: 'POST' }))
    eq('la segunda corrida no crea nada', b.creadas, 0)
    eq('y el total sigue en 14', b.total, 14)

    const cats = await json(await api('/categories'))
    eq('10 de gasto', cats.categories.filter(c => c.kind === 'gasto').length, 10)
    eq('4 de ingreso', cats.categories.filter(c => c.kind === 'ingreso').length, 4)
  }

  section('POST /accounts · validación')
  {
    eq('sin nombre → 400', (await api('/accounts', { method: 'POST', body: JSON.stringify({ currency: 'USD' }) })).status, 400)
    eq('nombre en blanco → 400', (await api('/accounts', { method: 'POST', body: JSON.stringify({ name: '   ', currency: 'USD' }) })).status, 400)
    eq('moneda inválida → 400', (await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'EUR' }) })).status, 400)
  }

  let airtm, efectivo, broker
  section('flujo completo')
  {
    airtm    = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Airtm',    currency: 'USD', initial_balance: 1299 }) }))).account
    broker   = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Broker',   currency: 'USD', initial_balance: 980  }) }))).account
    efectivo = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Efectivo', currency: 'BOB', initial_balance: 0    }) }))).account
    ok('crea las 3 cuentas', !!airtm && !!broker && !!efectivo)

    const d = await json(await api('/accounts'))
    eq('patrimonio = 2279', d.total_usd, 2279)

    const cats = await json(await api('/categories'))
    const comida = cats.categories.find(c => c.name === 'Comida')

    const gasto = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: efectivo.id, category_id: comida.id, amount: 35, description: 'Almuerzo' }),
    }))).transaction
    eq('la moneda la pone el server desde la cuenta', gasto.currency, 'BOB')
    eq('congela amount_usd = 5.03', Number(gasto.amount_usd), 5.03)
    eq('congela exchange_rate = 6.96', Number(gasto.exchange_rate), 6.96)

    const afterGasto = await json(await api('/accounts'))
    eq('Efectivo bajó 35 Bs', afterGasto.accounts.find(a => a.id === efectivo.id).balance, -35)

    // El cliente NO puede forzar la moneda: se lee siempre de la cuenta.
    const spoof = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: 10, currency: 'BOB' }),
    }))).transaction
    eq('ignora la moneda que manda el cliente', spoof.currency, 'USD')
    await api(`/transactions/${spoof.id}`, { method: 'DELETE' })

    section('POST /transactions · validación')
    const bad = async (body, label, want = 400) =>
      eq(label, (await api('/transactions', { method: 'POST', body: JSON.stringify(body) })).status, want)

    await bad({ type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: 0 }, 'monto cero → 400')
    await bad({ type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: -5 }, 'monto negativo → 400')
    await bad({ type: 'gasto', date: '18/08/2026', account_id: airtm.id, amount: 5 }, 'fecha mal formada → 400')
    await bad({ type: 'inversion', date: '2026-08-18', account_id: airtm.id, amount: 5 }, 'tipo fuera del enum → 400')
    await bad({ type: 'gasto', date: '2026-08-18', account_id: '00000000-0000-0000-0000-000000000009', amount: 5 }, 'cuenta ajena/inexistente → 400')
    await bad({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, amount: 5 }, 'transferencia sin destino → 400')
    await bad({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: airtm.id, amount: 5 }, 'transferencia a sí misma → 400')
    await bad({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: efectivo.id, amount: 50 }, 'cross-currency sin to_amount → 400')

    section('transferencias')
    // La propiedad se mide alrededor de la transferencia, no contra un número
    // fijo: cualquier movimiento previo cambia la base y la aserción mentiría.
    const antes = (await json(await api('/accounts'))).total_usd
    await api('/transactions', { method: 'POST', body: JSON.stringify({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: broker.id, amount: 100 }) })
    const t1 = await json(await api('/accounts'))
    eq('USD→USD no mueve el patrimonio', t1.total_usd, antes)
    eq('Airtm = 1199', t1.accounts.find(a => a.id === airtm.id).balance, 1199)
    eq('Broker = 1080', t1.accounts.find(a => a.id === broker.id).balance, 1080)

    const antesCross = (await json(await api('/accounts'))).total_usd
    await api('/transactions', { method: 'POST', body: JSON.stringify({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: efectivo.id, amount: 50, to_amount: 348 }) })
    const t2 = await json(await api('/accounts'))
    // 50 USD salen y llegan 348 Bs = 50 USD a 6.96, así que tampoco cambia.
    eq('cross-currency a la tasa exacta tampoco mueve el patrimonio', t2.total_usd, antesCross)
    eq('cross-currency: Airtm = 1149', t2.accounts.find(a => a.id === airtm.id).balance, 1149)
    eq('cross-currency: Efectivo = 313 Bs', t2.accounts.find(a => a.id === efectivo.id).balance, 313)

    section('PATCH /settings · la tasa no reescribe la historia')
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ usd_bob_rate: 7.5 }) })
    const viejo = (await json(await api(`/transactions?from=2026-08-18&to=2026-08-18`))).transactions.find(t => t.id === gasto.id)
    eq('el gasto viejo sigue en 5.03', Number(viejo.amount_usd), 5.03)

    const nuevo = (await json(await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: efectivo.id, amount: 35 }),
    }))).transaction
    eq('el gasto nuevo usa 7.50 → 4.67', Number(nuevo.amount_usd), 4.67)
    eq('tasa inválida → 400', (await api('/settings', { method: 'PATCH', body: JSON.stringify({ usd_bob_rate: 0 }) })).status, 400)

    // REGRESIÓN: Ajustes mostraba como "última edición" el momento en que se
    // cargó la página, porque el endpoint nunca devolvía la fecha real.
    const tras = await json(await api('/accounts'))
    ok('editar la tasa mueve la fecha de última edición',
       new Date(tras.usd_bob_rate_updated_at).getTime() > Date.now() - 60000,
       `obtenido: ${tras.usd_bob_rate_updated_at}`)
    await api('/settings', { method: 'PATCH', body: JSON.stringify({ usd_bob_rate: 6.96 }) })
    await api(`/transactions/${nuevo.id}`, { method: 'DELETE' })

    section('PATCH /transactions · recongelado selectivo')
    const soloDesc = (await json(await api(`/transactions/${gasto.id}`, {
      method: 'PATCH', body: JSON.stringify({ description: 'Almuerzo con Luis' }),
    }))).transaction
    eq('editar solo la descripción NO toca la tasa', Number(soloDesc.exchange_rate), 6.96)
    eq('ni el amount_usd', Number(soloDesc.amount_usd), 5.03)

    const cambiaMonto = (await json(await api(`/transactions/${gasto.id}`, {
      method: 'PATCH', body: JSON.stringify({ amount: 70 }),
    }))).transaction
    eq('cambiar el monto sí recalcula', Number(cambiaMonto.amount_usd), 10.06)

    const bal = await json(await api('/accounts'))
    eq('el saldo refleja 70, no 35+70', bal.accounts.find(a => a.id === efectivo.id).balance, 278)

    await api(`/transactions/${gasto.id}`, { method: 'PATCH', body: JSON.stringify({ amount: 35 }) })

    section('DELETE /accounts · 409 con movimientos')
    const del = await api(`/accounts/${efectivo.id}`, { method: 'DELETE' })
    eq('no deja borrar una cuenta con movimientos', del.status, 409)
    ok('y el mensaje sugiere archivar', (await json(del)).error.toLowerCase().includes('archiva'))

    eq('cambiar la moneda de una cuenta con movimientos → 409',
       (await api(`/accounts/${efectivo.id}`, { method: 'PATCH', body: JSON.stringify({ currency: 'USD' }) })).status, 409)

    const vacia = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Vacía', currency: 'USD' }) }))).account
    eq('una cuenta sin movimientos sí se borra', (await api(`/accounts/${vacia.id}`, { method: 'DELETE' })).status, 200)

    section('categorías')
    eq('nombre duplicado en el mismo tipo → 409',
       (await api('/categories', { method: 'POST', body: JSON.stringify({ name: 'Comida', kind: 'gasto' }) })).status, 409)
    eq('kind inválido → 400',
       (await api('/categories', { method: 'POST', body: JSON.stringify({ name: 'Cripto', kind: 'inversion' }) })).status, 400)

    section('GET /transactions · filtros y totales')
    const todos = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
    eq('el total de gasto suma solo gastos', todos.total_gasto_usd, 5.03)
    eq('las transferencias no entran en los totales', todos.total_ingreso_usd, 0)
    eq('filtra por tipo', (await json(await api('/transactions?type=transferencia'))).transactions.length, 2)
    eq('filtra por cuenta incluyendo destino de transferencia',
       (await json(await api(`/transactions?account_id=${broker.id}`))).transactions.length, 1)
    eq('un mes sin datos vuelve vacío',
       (await json(await api('/transactions?from=2026-01-01&to=2026-01-31'))).transactions.length, 0)

    section('DELETE /transactions')
    await api(`/transactions/${gasto.id}`, { method: 'DELETE' })
    const final = await json(await api('/accounts'))
    eq('borrar el gasto devuelve Efectivo a 348', final.accounts.find(a => a.id === efectivo.id).balance, 348)
    eq('borrar algo inexistente no rompe',
       (await api('/transactions/00000000-0000-0000-0000-000000000009', { method: 'DELETE' })).status, 200)
  }
}

await setup()
try { await run() } finally {
  await adminFetch(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
  console.log('\nUsuario de API eliminado (cascade borró sus datos).')
}
process.exit(summary() === 0 ? 0 : 1)
