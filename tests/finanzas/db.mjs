import { URL_, SRV, ANON } from './env.mjs'
import { eq, ok, section, summary, sweepTestUsers } from './harness.mjs'

const admin = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...init.headers },
})

let TOKEN = null
const as = (path, init = {}) => fetch(`${URL_}/rest/v1${path}`, {
  ...init,
  headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
})

const EMAIL = `fz-test-${Date.now()}@acerotest.local`
const PASSWORD = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
let USER_ID = null

async function setup() {
  // Arrastra lo que haya quedado de una corrida interrumpida.
  await sweepTestUsers(URL_, SRV)

  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  }).then(r => r.json())
  USER_ID = created.id
  if (!USER_ID) throw new Error('no se pudo crear el usuario de prueba: ' + JSON.stringify(created))

  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(r => r.json())
  TOKEN = session.access_token
  if (!TOKEN) throw new Error('no se pudo iniciar sesión: ' + JSON.stringify(session))
  console.log(`Usuario de prueba: ${EMAIL}\n`)
}

async function teardown() {
  // Borrar el usuario arrastra en cascada todas sus filas fin_*.
  await admin(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
  console.log(`\nUsuario de prueba eliminado (cascade borró sus datos).`)
}

const post = (t, body) => as(`/${t}`, { method: 'POST', body: JSON.stringify(body) })
const rows = async (t, q = '') => (await as(`/${t}?select=*${q}`)).json()

async function run() {
  section('RLS · aislamiento entre usuarios')
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_accounts?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve ninguna cuenta', anon, [])

    // El usuario real tiene 2 cuentas cargadas; el de prueba no debe verlas.
    const mine = await rows('fin_accounts')
    eq('usuario nuevo no ve cuentas de otro usuario', mine, [])
  }

  section('fin_rates · una fila por moneda')
  const rate = 1 / 6.96   // factor congelado: USD por 1 Bs
  {
    const created = await post('fin_rates', [
      { user_id: USER_ID, currency: 'BOB',  rate: 6.96 },
      { user_id: USER_ID, currency: 'USDT', rate: 1 },
      { user_id: USER_ID, currency: 'USDC', rate: 1 },
      { user_id: USER_ID, currency: 'BTC',  rate: 68000 },
    ]).then(r => r.json())
    eq('carga las cuatro tasas', created.length, 4)

    const bad = await post('fin_rates', { user_id: USER_ID, currency: 'BOB', rate: 0 })
    ok('rechaza tasa cero', bad.status >= 400, `HTTP ${bad.status}`)

    const usd = await post('fin_rates', { user_id: USER_ID, currency: 'USD', rate: 1 })
    ok('USD no admite tasa: es la referencia', usd.status >= 400, `HTTP ${usd.status}`)

    const dup = await post('fin_rates', { user_id: USER_ID, currency: 'BOB', rate: 7 })
    ok('no deja dos tasas para la misma moneda', dup.status >= 400, `HTTP ${dup.status}`)

    // El BTC necesita mucho más rango que una tasa fiat.
    const btcAlto = await as('/fin_rates?currency=eq.BTC', {
      method: 'PATCH', body: JSON.stringify({ rate: 123456.78901234 }),
    })
    ok('la tasa admite 8 decimales y valores grandes', btcAlto.status < 400, `HTTP ${btcAlto.status}`)
    await as('/fin_rates?currency=eq.BTC', { method: 'PATCH', body: JSON.stringify({ rate: 68000 }) })
  }

  section('fin_accounts')
  let airtm, efectivo, broker
  {
    airtm    = (await post('fin_accounts', { user_id: USER_ID, name: 'Airtm',    currency: 'USD', initial_balance: 1299 }).then(r => r.json()))[0]
    broker   = (await post('fin_accounts', { user_id: USER_ID, name: 'Broker',   currency: 'USD', initial_balance: 980  }).then(r => r.json()))[0]
    efectivo = (await post('fin_accounts', { user_id: USER_ID, name: 'Efectivo', currency: 'BOB', initial_balance: 0    }).then(r => r.json()))[0]
    ok('crea cuentas USD y BOB', !!airtm?.id && !!efectivo?.id)

    const bad = await post('fin_accounts', { user_id: USER_ID, name: 'Euros', currency: 'EUR' })
    ok('rechaza una moneda fuera del enum', bad.status >= 400, `HTTP ${bad.status}`)

    // Los tres activos nuevos.
    const nuevos = await post('fin_accounts', [
      { user_id: USER_ID, name: 'Tether', currency: 'USDT', initial_balance: 30 },
      { user_id: USER_ID, name: 'Circle', currency: 'USDC', initial_balance: 120 },
      { user_id: USER_ID, name: 'Bitcoin', currency: 'BTC', initial_balance: 0.01324500 },
    ]).then(r => r.json())
    eq('acepta USDT, USDC y BTC', nuevos.length, 3)

    const btcRow = nuevos.find(a => a.currency === 'BTC')
    eq('el saldo en BTC conserva los 8 decimales', Number(btcRow.initial_balance), 0.013245)

    const ajeno = await post('fin_accounts', { user_id: '00000000-0000-0000-0000-000000000001', name: 'Ajena', currency: 'USD' })
    ok('RLS impide crear una cuenta a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)
  }

  section('fin_categories')
  let comida
  {
    comida = (await post('fin_categories', { user_id: USER_ID, name: 'Comida', kind: 'gasto', emoji: '🍽️' }).then(r => r.json()))[0]
    ok('crea una categoría', !!comida?.id)

    const dup = await post('fin_categories', { user_id: USER_ID, name: 'Comida', kind: 'gasto' })
    ok('el índice único bloquea el duplicado (seed idempotente)', dup.status >= 400, `HTTP ${dup.status}`)

    const sameNameOtherKind = await post('fin_categories', { user_id: USER_ID, name: 'Otros', kind: 'gasto' })
    const sameNameOtherKind2 = await post('fin_categories', { user_id: USER_ID, name: 'Otros', kind: 'ingreso' })
    ok('mismo nombre en gasto e ingreso sí se permite',
       sameNameOtherKind.status < 400 && sameNameOtherKind2.status < 400)

    const badKind = await post('fin_categories', { user_id: USER_ID, name: 'X', kind: 'inversion' })
    ok('rechaza un kind inválido', badKind.status >= 400, `HTTP ${badKind.status}`)
  }

  section('fin_transactions · constraints de forma')
  {
    const cero = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-18', account_id: efectivo.id,
      amount: 0, currency: 'BOB', exchange_rate: rate, amount_usd: 0,
    })
    ok('rechaza monto cero', cero.status >= 400, `HTTP ${cero.status}`)

    const negativo = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-18', account_id: efectivo.id,
      amount: -10, currency: 'BOB', exchange_rate: rate, amount_usd: -1.44,
    })
    ok('rechaza monto negativo (el signo lo da el tipo)', negativo.status >= 400, `HTTP ${negativo.status}`)

    const trSinDestino = await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-18', account_id: airtm.id,
      amount: 10, currency: 'USD', exchange_rate: rate, amount_usd: 10,
    })
    ok('rechaza transferencia sin cuenta destino', trSinDestino.status >= 400, `HTTP ${trSinDestino.status}`)

    const trMisma = await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-18', account_id: airtm.id,
      to_account_id: airtm.id, amount: 10, currency: 'USD', exchange_rate: rate, amount_usd: 10,
    })
    ok('rechaza transferencia a la misma cuenta', trMisma.status >= 400, `HTTP ${trMisma.status}`)

    const trConCategoria = await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-18', account_id: airtm.id,
      to_account_id: broker.id, category_id: comida.id, amount: 10, currency: 'USD',
      exchange_rate: rate, amount_usd: 10,
    })
    ok('rechaza transferencia con categoría', trConCategoria.status >= 400, `HTTP ${trConCategoria.status}`)

    const gastoConDestino = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-18', account_id: airtm.id,
      to_account_id: broker.id, amount: 10, currency: 'USD', exchange_rate: rate, amount_usd: 10,
    })
    ok('rechaza gasto con cuenta destino', gastoConDestino.status >= 400, `HTTP ${gastoConDestino.status}`)

    const tipoInvalido = await post('fin_transactions', {
      user_id: USER_ID, type: 'inversion', date: '2026-08-18', account_id: airtm.id,
      amount: 10, currency: 'USD', exchange_rate: rate, amount_usd: 10,
    })
    ok('rechaza un tipo fuera del enum', tipoInvalido.status >= 400, `HTTP ${tipoInvalido.status}`)
  }

  section('fin_transactions · flujo real y saldos derivados')
  let gasto
  {
    gasto = (await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-18', account_id: efectivo.id,
      category_id: comida.id, amount: 35, currency: 'BOB',
      exchange_rate: 1 / 6.96, amount_usd: 5.03, description: 'Almuerzo',
    }).then(r => r.json()))[0]
    eq('gasto de 35 Bs congela 5.03 USD', Number(gasto.amount_usd), 5.03)

    await post('fin_transactions', {
      user_id: USER_ID, type: 'ingreso', date: '2026-08-18', account_id: airtm.id,
      amount: 900, currency: 'USD', exchange_rate: 1, amount_usd: 900,
    })
    await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-18', account_id: airtm.id,
      to_account_id: broker.id, amount: 100, currency: 'USD', exchange_rate: 1, amount_usd: 100,
    })
    await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-18', account_id: airtm.id,
      to_account_id: efectivo.id, amount: 50, currency: 'USD', to_amount: 348,
      exchange_rate: 1, amount_usd: 50,
    })

    const { computeBalances } = await import('./.fin/accounts.mjs')
    const accts = (await rows('fin_accounts')).map(a => ({ ...a, initial_balance: Number(a.initial_balance) }))
    const txs = (await rows('fin_transactions')).map(t => ({
      type: t.type, account_id: t.account_id, to_account_id: t.to_account_id,
      amount: Number(t.amount), to_amount: t.to_amount === null ? null : Number(t.to_amount),
    }))
    const bal = computeBalances(accts, txs)

    eq('Airtm: 1299 +900 −100 −50 = 2049', bal.get(airtm.id), 2049)
    eq('Broker: 980 +100 = 1080', bal.get(broker.id), 1080)
    eq('Efectivo: 0 −35 +348 = 313 Bs', bal.get(efectivo.id), 313)
  }

  section('precisión de montos en BTC')
  {
    const btc = (await rows('fin_accounts', '&currency=eq.BTC'))[0]
    const compra = await post('fin_transactions', {
      user_id: USER_ID, type: 'ingreso', date: '2026-08-18', account_id: btc.id,
      amount: 0.00042195, currency: 'BTC', exchange_rate: 68000, amount_usd: 28.69,
    }).then(r => r.json())
    eq('guarda 0.00042195 BTC sin truncar', Number(compra[0].amount), 0.00042195)
  }

  section('la tasa congelada no se recalcula')
  {
    await as(`/fin_rates?currency=eq.BOB`, {
      method: 'PATCH', body: JSON.stringify({ rate: 7.5 }),
    })
    const after = (await rows('fin_transactions', `&id=eq.${gasto.id}`))[0]
    eq('el gasto viejo sigue en 5.03 tras cambiar la tasa a 7.50', Number(after.amount_usd), 5.03)
    ok('y conserva su exchange_rate original', Math.abs(Number(after.exchange_rate) - 1 / 6.96) < 1e-7, `obtenido ${after.exchange_rate}`)
  }

  section('integridad referencial')
  {
    const del = await as(`/fin_accounts?id=eq.${efectivo.id}`, { method: 'DELETE' })
    ok('no deja borrar una cuenta con movimientos (on delete restrict)', del.status >= 400, `HTTP ${del.status}`)

    const arch = await as(`/fin_accounts?id=eq.${efectivo.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    ok('pero sí deja archivarla', arch.status < 400, `HTTP ${arch.status}`)
    await as(`/fin_accounts?id=eq.${efectivo.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })

    await as(`/fin_categories?id=eq.${comida.id}`, { method: 'DELETE' })
    const orphan = (await rows('fin_transactions', `&id=eq.${gasto.id}`))[0]
    eq('borrar la categoría deja el movimiento con category_id null', orphan.category_id, null)
    ok('y el movimiento sobrevive', !!orphan.id)
  }

  section('borrado y edición recalculan')
  {
    await as(`/fin_transactions?id=eq.${gasto.id}`, { method: 'DELETE' })
    const { computeBalances } = await import('./.fin/accounts.mjs')
    const accts = (await rows('fin_accounts')).map(a => ({ ...a, initial_balance: Number(a.initial_balance) }))
    const txs = (await rows('fin_transactions')).map(t => ({
      type: t.type, account_id: t.account_id, to_account_id: t.to_account_id,
      amount: Number(t.amount), to_amount: t.to_amount === null ? null : Number(t.to_amount),
    }))
    eq('sin el gasto, Efectivo vuelve a 348', computeBalances(accts, txs).get(efectivo.id), 348)
  }
}

await setup()
try {
  await run()
} finally {
  await teardown()
}
process.exit(summary() === 0 ? 0 : 1)
