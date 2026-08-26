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

  section('fin_accounts.is_investment (Feature 11)')
  let inversion
  {
    eq('sin mandar is_investment, nace en false', airtm.is_investment, false)

    inversion = (await post('fin_accounts', {
      user_id: USER_ID, name: 'IBKR', currency: 'USD', initial_balance: 500, is_investment: true,
    }).then(r => r.json()))[0]
    eq('se puede crear ya marcada como inversión', inversion?.is_investment, true)

    const off = (await as(`/fin_accounts?id=eq.${inversion.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_investment: false }),
    }).then(r => r.json()))[0]
    eq('y desmarcarla con un PATCH', off.is_investment, false)

    await as(`/fin_accounts?id=eq.${inversion.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_investment: true }),
    })
  }

  section('fin_categories')
  let comida
  {
    comida = (await post('fin_categories', { user_id: USER_ID, name: 'Comida', kind: 'gasto', icon: 'comida' }).then(r => r.json()))[0]
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


  /* ════════════════════════════════════════════════════════════════════════
     SPRINT 2 · Compartidos y reembolsos
     ════════════════════════════════════════════════════════════════════════ */

  section('SPRINT 2 · flow_type')
  {
    // El backfill de la migración: las transferencias ya existentes tienen que
    // haber quedado marcadas como movimiento financiero.
    const transferencias = await rows('fin_transactions', '&type=eq.transferencia')
    ok('el backfill marcó las transferencias viejas como movimiento',
       transferencias.length > 0 && transferencias.every(t => t.flow_type === 'movimiento'),
       JSON.stringify(transferencias.map(t => t.flow_type)))

    const gastoDefault = await rows('fin_transactions', `&id=eq.${gasto.id}`)
    eq('un gasto nace en consumo por default', gastoDefault[0].flow_type, 'consumo')

    // Que una transferencia sea movimiento no es una decisión de quien escribe:
    // el trigger la corrige en vez de rechazar el insert con un error de
    // constraint ilegible.
    const trConsumo = (await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', flow_type: 'consumo', date: '2026-08-18',
      account_id: airtm.id, to_account_id: broker.id, amount: 5, currency: 'USD',
      exchange_rate: 1, amount_usd: 5,
    }).then(r => r.json()))[0]
    eq('el trigger corrige una transferencia marcada como consumo', trConsumo.flow_type, 'movimiento')

    await as(`/fin_transactions?id=eq.${trConsumo.id}`, {
      method: 'PATCH', body: JSON.stringify({ flow_type: 'consumo' }),
    })
    const trasUpdate = (await rows('fin_transactions', `&id=eq.${trConsumo.id}`))[0]
    eq('y también la corrige en un update', trasUpdate.flow_type, 'movimiento')
    await as(`/fin_transactions?id=eq.${trConsumo.id}`, { method: 'DELETE' })

    const reembolsoConCategoria = await post('fin_transactions', {
      user_id: USER_ID, type: 'ingreso', flow_type: 'movimiento', date: '2026-08-18',
      account_id: airtm.id, category_id: comida.id, amount: 3, currency: 'USD',
      exchange_rate: 1, amount_usd: 3,
    })
    ok('un reembolso no puede llevar categoría', reembolsoConCategoria.status >= 400,
       `HTTP ${reembolsoConCategoria.status}`)

    const flowRaro = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', flow_type: 'inversion', date: '2026-08-18',
      account_id: airtm.id, amount: 5, currency: 'USD', exchange_rate: 1, amount_usd: 5,
    })
    ok('rechaza un flow_type fuera del enum', flowRaro.status >= 400, `HTTP ${flowRaro.status}`)
  }

  section('SPRINT 2 · fin_people')
  let ana, juan
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_people?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve personas', anon, [])

    ana = (await post('fin_people', { user_id: USER_ID, name: 'Ana' }).then(r => r.json()))[0]
    juan = (await post('fin_people', { user_id: USER_ID, name: 'Juan' }).then(r => r.json()))[0]
    ok('crea personas', !!ana?.id && !!juan?.id)

    const dup = await post('fin_people', { user_id: USER_ID, name: 'ana' })
    ok('el índice único bloquea "ana" contra "Ana"', dup.status >= 400, `HTTP ${dup.status}`)

    // El índice es parcial (where not archived): archivar libera el nombre.
    const temp = (await post('fin_people', { user_id: USER_ID, name: 'Temporal' }).then(r => r.json()))[0]
    await as(`/fin_people?id=eq.${temp.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    const reusa = await post('fin_people', { user_id: USER_ID, name: 'Temporal' })
    ok('archivar libera el nombre para volver a usarlo', reusa.status < 400, `HTTP ${reusa.status}`)

    const ajena = await post('fin_people', { user_id: '00000000-0000-0000-0000-000000000001', name: 'Ajena' })
    ok('RLS impide crear una persona a nombre de otro', ajena.status >= 400, `HTTP ${ajena.status}`)
  }

  section('SPRINT 2 · fin_debts')
  let splitAna, splitJuan
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_debts?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve repartos', anon, [])

    // `principal_usd` es NOT NULL desde § finanzas_ganancia_al_cobrar — sin
    // margen que probar acá, va igual a `amount_usd` en todas.
    splitAna = (await post('fin_debts', {
      user_id: USER_ID, transaction_id: gasto.id, person_id: ana.id,
      amount: 11.66, currency: 'BOB', amount_usd: 1.68, principal_usd: 1.68,
    }).then(r => r.json()))[0]
    splitJuan = (await post('fin_debts', {
      user_id: USER_ID, transaction_id: gasto.id, person_id: juan.id,
      amount: 11.66, currency: 'BOB', amount_usd: 1.68, principal_usd: 1.68,
    }).then(r => r.json()))[0]
    ok('crea repartos', !!splitAna?.id && !!splitJuan?.id)

    const dup = await post('fin_debts', {
      user_id: USER_ID, transaction_id: gasto.id, person_id: ana.id,
      amount: 5, currency: 'BOB', amount_usd: 0.72, principal_usd: 0.72,
    })
    ok('unique (transaction_id, person_id) bloquea a la misma persona dos veces',
       dup.status >= 400, `HTTP ${dup.status}`)

    const cero = await post('fin_debts', {
      user_id: USER_ID, transaction_id: gasto.id, person_id: juan.id,
      amount: 0, currency: 'BOB', amount_usd: 0, principal_usd: 0,
    })
    ok('rechaza una parte en cero', cero.status >= 400, `HTTP ${cero.status}`)

    const monedaMala = await post('fin_debts', {
      user_id: USER_ID, transaction_id: gasto.id, person_id: juan.id,
      amount: 5, currency: 'EUR', amount_usd: 5, principal_usd: 5,
    })
    ok('rechaza una moneda fuera del enum', monedaMala.status >= 400, `HTTP ${monedaMala.status}`)

    // Precisión de 8 decimales, igual que los montos.
    const btcAcc = (await rows('fin_accounts', '&currency=eq.BTC'))[0]
    const txBtc = (await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-18', account_id: btcAcc.id,
      amount: 0.00042195, currency: 'BTC', exchange_rate: 68000, amount_usd: 28.69,
    }).then(r => r.json()))[0]
    const splitBtc = (await post('fin_debts', {
      user_id: USER_ID, transaction_id: txBtc.id, person_id: ana.id,
      amount: 0.00014065, currency: 'BTC', amount_usd: 9.56, principal_usd: 9.56,
    }).then(r => r.json()))[0]
    eq('un reparto en BTC conserva los 8 decimales', Number(splitBtc.amount), 0.00014065)
    await as(`/fin_debts?id=eq.${splitBtc.id}`, { method: 'DELETE' })
    await as(`/fin_transactions?id=eq.${txBtc.id}`, { method: 'DELETE' })
  }

  section('SPRINT 2 · estados y claves foráneas')
  {
    const cobrado = (await post('fin_transactions', {
      user_id: USER_ID, type: 'ingreso', flow_type: 'movimiento', date: '2026-08-18',
      account_id: airtm.id, amount: 1.68, currency: 'USD', exchange_rate: 1, amount_usd: 1.68,
      description: 'Cobro a Ana',
    }).then(r => r.json()))[0]
    ok('un reembolso sin categoría sí se acepta', !!cobrado?.id)

    const ambos = await as(`/fin_debts?id=eq.${splitAna.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settled_tx_id: cobrado.id, waived_at: '2026-08-18' }),
    })
    ok('fin_split_settle_shape: no puede estar cobrado Y perdonado',
       ambos.status >= 400, `HTTP ${ambos.status}`)

    await as(`/fin_debts?id=eq.${splitAna.id}`, {
      method: 'PATCH', body: JSON.stringify({ settled_tx_id: cobrado.id }),
    })

    // on delete restrict: el gasto padre no se puede borrar mientras tenga
    // repartos, aunque la validación del server falle.
    const borrarPadre = await as(`/fin_transactions?id=eq.${gasto.id}`, { method: 'DELETE' })
    ok('on delete restrict impide borrar el gasto con reparto',
       borrarPadre.status >= 400, `HTTP ${borrarPadre.status}`)

    const borrarPersona = await as(`/fin_people?id=eq.${ana.id}`, { method: 'DELETE' })
    ok('on delete restrict impide borrar una persona con historial',
       borrarPersona.status >= 400, `HTTP ${borrarPersona.status}`)

    // on delete set null: borrar el cobro reabre la deuda, no deja huérfanos.
    await as(`/fin_transactions?id=eq.${cobrado.id}`, { method: 'DELETE' })
    const reabierto = (await rows('fin_debts', `&id=eq.${splitAna.id}`))[0]
    eq('borrar el cobro devuelve el reparto a pendiente', reabierto.settled_tx_id, null)
    ok('y el reparto sigue existiendo', !!reabierto.id)
  }

  section('SPRINT 2 · RLS de escritura sobre fin_people y fin_debts')
  {
    const noSession = { apikey: ANON, 'Content-Type': 'application/json' }

    const insertAnon = await fetch(`${URL_}/rest/v1/fin_people`, {
      method: 'POST', headers: noSession, body: JSON.stringify({ user_id: USER_ID, name: 'Intruso' }),
    })
    ok('sin sesión no puede insertar una persona', insertAnon.status >= 400, `HTTP ${insertAnon.status}`)

    const updateAnon = await fetch(`${URL_}/rest/v1/fin_people?id=eq.${ana.id}`, {
      method: 'PATCH', headers: noSession, body: JSON.stringify({ name: 'Hackeada' }),
    })
    const anaIntacta = (await rows('fin_people', `&id=eq.${ana.id}`))[0]
    ok('sin sesión no puede modificar una persona', anaIntacta.name === 'Ana', `HTTP ${updateAnon.status}`)

    await fetch(`${URL_}/rest/v1/fin_debts?id=eq.${splitJuan.id}`, { method: 'DELETE', headers: noSession })
    const sigue = await rows('fin_debts', `&id=eq.${splitJuan.id}`)
    eq('sin sesión no puede borrar un reparto', sigue.length, 1)
  }

  section('SPRINT 2 · limpieza del reparto antes del borrado en cascada')
  {
    await as(`/fin_debts?transaction_id=eq.${gasto.id}`, { method: 'DELETE' })
    const quedan = await rows('fin_debts', `&transaction_id=eq.${gasto.id}`)
    eq('sin repartos colgando', quedan.length, 0)
  }


  section('SPRINT 3 · fin_recurring')
  let fijo
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_recurring?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve fijos', anon, [])

    // Sin category_id: `comida` ya se borró en la sección de integridad
    // referencial y la FK lo rechazaría.
    fijo = (await post('fin_recurring', {
      user_id: USER_ID, name: 'Spotify', icon: 'suscripciones', amount: 11.99,
      account_id: airtm.id, frequency: 'mensual', day_of_month: 5,
    }).then(r => r.json()))[0]
    ok('crea una plantilla', !!fijo?.id)
    eq('mensual nace sin mes', fijo.month_of_year, null)

    const cero = await post('fin_recurring', {
      user_id: USER_ID, name: 'X', amount: 0, account_id: airtm.id,
    })
    ok('rechaza monto cero', cero.status >= 400, `HTTP ${cero.status}`)

    const dia = await post('fin_recurring', {
      user_id: USER_ID, name: 'X', amount: 5, account_id: airtm.id, day_of_month: 45,
    })
    ok('rechaza un día fuera de 1..31', dia.status >= 400, `HTTP ${dia.status}`)

    const anualSinMes = await post('fin_recurring', {
      user_id: USER_ID, name: 'Dominio', amount: 15, account_id: airtm.id, frequency: 'anual',
    })
    ok('un anual sin mes se rechaza', anualSinMes.status >= 400, `HTTP ${anualSinMes.status}`)

    const mensualConMes = await post('fin_recurring', {
      user_id: USER_ID, name: 'Raro', amount: 15, account_id: airtm.id,
      frequency: 'mensual', month_of_year: 3,
    })
    ok('un mensual CON mes también', mensualConMes.status >= 400, `HTTP ${mensualConMes.status}`)

    const freq = await post('fin_recurring', {
      user_id: USER_ID, name: 'X', amount: 5, account_id: airtm.id, frequency: 'semanal',
    })
    ok('rechaza una frecuencia fuera del enum', freq.status >= 400, `HTTP ${freq.status}`)

    const ajeno = await post('fin_recurring', {
      user_id: '00000000-0000-0000-0000-000000000001', name: 'Ajeno', amount: 5, account_id: airtm.id,
    })
    ok('RLS impide crear un fijo a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)
  }

  section('SPRINT 3 · fin_recurring_splits')
  {
    const parejo = (await post('fin_recurring_splits', {
      user_id: USER_ID, recurring_id: fijo.id, person_id: ana.id, amount: null,
    }).then(r => r.json()))[0]
    eq('una parte pareja se guarda sin monto', parejo.amount, null)

    const fijoMonto = (await post('fin_recurring_splits', {
      user_id: USER_ID, recurring_id: fijo.id, person_id: juan.id, amount: 4.5,
    }).then(r => r.json()))[0]
    eq('y una con monto lo conserva', Number(fijoMonto.amount), 4.5)

    const dup = await post('fin_recurring_splits', {
      user_id: USER_ID, recurring_id: fijo.id, person_id: ana.id, amount: 2,
    })
    ok('la misma persona dos veces en la plantilla se rechaza', dup.status >= 400, `HTTP ${dup.status}`)

    const cero = await post('fin_recurring_splits', {
      user_id: USER_ID, recurring_id: fijo.id, person_id: juan.id, amount: 0,
    })
    ok('un monto en cero se rechaza (null sí, cero no)', cero.status >= 400, `HTTP ${cero.status}`)

    const borrarPersona = await as(`/fin_people?id=eq.${ana.id}`, { method: 'DELETE' })
    ok('on delete restrict protege a la persona de la plantilla',
       borrarPersona.status >= 400, `HTTP ${borrarPersona.status}`)
  }

  section('SPRINT 3 · el vínculo con los movimientos')
  {
    const tx = (await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-05', account_id: airtm.id,
      amount: 11.99, currency: 'USD', exchange_rate: 1, amount_usd: 11.99,
      description: 'Spotify', recurring_id: fijo.id,
    }).then(r => r.json()))[0]
    eq('un movimiento puede apuntar a su plantilla', tx.recurring_id, fijo.id)

    // Borrar la plantilla NO borra la historia: los movimientos quedan y solo
    // pierden el vínculo. Su reparto por defecto sí se va (era configuración).
    await as(`/fin_recurring?id=eq.${fijo.id}`, { method: 'DELETE' })

    const sobrevive = (await rows('fin_transactions', `&id=eq.${tx.id}`))[0]
    ok('el gasto sobrevive a la plantilla', !!sobrevive?.id)
    eq('pero pierde el vínculo', sobrevive.recurring_id, null)

    const repartos = await rows('fin_recurring_splits', `&recurring_id=eq.${fijo.id}`)
    eq('el reparto por defecto sí se va en cascada', repartos.length, 0)

    await as(`/fin_transactions?id=eq.${tx.id}`, { method: 'DELETE' })
  }

  section('SPRINT 3 · RLS de escritura sobre fin_recurring')
  {
    const noSession = { apikey: ANON, 'Content-Type': 'application/json' }
    const otro = (await post('fin_recurring', {
      user_id: USER_ID, name: 'Netflix', amount: 9, account_id: airtm.id,
    }).then(r => r.json()))[0]

    const ins = await fetch(`${URL_}/rest/v1/fin_recurring`, {
      method: 'POST', headers: noSession,
      body: JSON.stringify({ user_id: USER_ID, name: 'Intruso', amount: 1, account_id: airtm.id }),
    })
    ok('sin sesión no puede insertar un fijo', ins.status >= 400, `HTTP ${ins.status}`)

    await fetch(`${URL_}/rest/v1/fin_recurring?id=eq.${otro.id}`, {
      method: 'PATCH', headers: noSession, body: JSON.stringify({ name: 'Hackeado' }),
    })
    eq('ni modificarlo', (await rows('fin_recurring', `&id=eq.${otro.id}`))[0].name, 'Netflix')

    await fetch(`${URL_}/rest/v1/fin_recurring?id=eq.${otro.id}`, { method: 'DELETE', headers: noSession })
    eq('ni borrarlo', (await rows('fin_recurring', `&id=eq.${otro.id}`)).length, 1)

    await as(`/fin_recurring?id=eq.${otro.id}`, { method: 'DELETE' })
  }

  section('SPRINT 4 · fin_debt_plans')
  let plan
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_debt_plans?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve planes', anon, [])

    plan = (await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'Deuda de Ana',
      principal: 957, currency: 'USD', installments: 10,
      frequency: 'mensual', starts_on: '2026-09-05',
    }).then(r => r.json()))[0]
    ok('crea un plan sin interés (interest_rate queda null)', !!plan?.id && plan.interest_rate === null)

    const capitalCero = await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'X', principal: 0,
      currency: 'USD', installments: 1, starts_on: '2026-09-05',
    })
    ok('rechaza capital en cero', capitalCero.status >= 400, `HTTP ${capitalCero.status}`)

    const sinCuotas = await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'X', principal: 100,
      currency: 'USD', installments: 0, starts_on: '2026-09-05',
    })
    ok('rechaza cero cuotas', sinCuotas.status >= 400, `HTTP ${sinCuotas.status}`)

    const interesNegativo = await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'X', principal: 100,
      currency: 'USD', installments: 1, starts_on: '2026-09-05', interest_rate: -5,
    })
    ok('rechaza interés negativo', interesNegativo.status >= 400, `HTTP ${interesNegativo.status}`)

    const monedaMala = await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'X', principal: 100,
      currency: 'EUR', installments: 1, starts_on: '2026-09-05',
    })
    ok('rechaza moneda fuera del enum', monedaMala.status >= 400, `HTTP ${monedaMala.status}`)

    const frecuenciaMala = await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'X', principal: 100,
      currency: 'USD', installments: 1, starts_on: '2026-09-05', frequency: 'diaria',
    })
    ok('rechaza frecuencia fuera del enum', frecuenciaMala.status >= 400, `HTTP ${frecuenciaMala.status}`)

    const borrarPersona = await as(`/fin_people?id=eq.${ana.id}`, { method: 'DELETE' })
    ok('on delete restrict protege a la persona con un plan', borrarPersona.status >= 400, `HTTP ${borrarPersona.status}`)
  }

  section('SPRINT 4 · fin_debts como cuota de un plan')
  let cuota1, cuota2
  {
    cuota1 = (await post('fin_debts', {
      user_id: USER_ID, transaction_id: null, person_id: ana.id,
      amount: 100, currency: 'USD', amount_usd: 100, principal_usd: 100, concept: 'Deuda de Ana · cuota 1/10',
      incurred_on: '2026-09-05', plan_id: plan.id, plan_installment_no: 1,
    }).then(r => r.json()))[0]
    ok('crea una cuota enlazada al plan', !!cuota1?.id && cuota1.plan_id === plan.id)

    cuota2 = (await post('fin_debts', {
      user_id: USER_ID, transaction_id: null, person_id: ana.id,
      amount: 100, currency: 'USD', amount_usd: 100, principal_usd: 100, concept: 'Deuda de Ana · cuota 2/10',
      incurred_on: '2026-10-05', plan_id: plan.id, plan_installment_no: 2,
    }).then(r => r.json()))[0]
    ok('y una segunda', !!cuota2?.id)

    const numeroCero = await post('fin_debts', {
      user_id: USER_ID, transaction_id: null, person_id: ana.id,
      amount: 50, currency: 'USD', amount_usd: 50, principal_usd: 50, concept: 'X',
      incurred_on: '2026-09-05', plan_id: plan.id, plan_installment_no: 0,
    })
    ok('fin_debt_plan_shape rechaza un número de cuota en cero',
       numeroCero.status >= 400, `HTTP ${numeroCero.status}`)

    // Cobrar y condonar son los endpoints de Deudas SIN NINGÚN CAMBIO: una
    // cuota es una fila de fin_debts como cualquier otra.
    await as(`/fin_debts?id=eq.${cuota1.id}`, { method: 'PATCH', body: JSON.stringify({ waived_at: '2026-09-06' }) })
    const perdonada = (await rows('fin_debts', `&id=eq.${cuota1.id}`))[0]
    eq('una cuota se condona igual que cualquier deuda', perdonada.waived_at, '2026-09-06')

    // Borrar el plan: on delete SET NULL en plan_id, y el fix de la migración
    // 20260819050000 permite que plan_installment_no quede colgando sin que
    // el propio SET NULL viole el constraint.
    await as(`/fin_debt_plans?id=eq.${plan.id}`, { method: 'DELETE' })
    const huerfana = (await rows('fin_debts', `&id=eq.${cuota2.id}`))[0]
    eq('borrar el plan libera plan_id de sus cuotas', huerfana.plan_id, null)
    eq('la cuota (historia real) sigue existiendo', huerfana.id, cuota2.id)
    eq('el número de cuota queda colgando sin romper nada', Number(huerfana.plan_installment_no), 2)

    await as(`/fin_debts?id=eq.${cuota1.id}`, { method: 'DELETE' })
    await as(`/fin_debts?id=eq.${cuota2.id}`, { method: 'DELETE' })
  }

  section('SPRINT 4 · RLS de escritura sobre fin_debt_plans')
  {
    const noSession = { apikey: ANON, 'Content-Type': 'application/json' }
    const otroPlan = (await post('fin_debt_plans', {
      user_id: USER_ID, person_id: ana.id, concept: 'Otro plan', principal: 50,
      currency: 'USD', installments: 1, starts_on: '2026-09-05',
    }).then(r => r.json()))[0]

    const ins = await fetch(`${URL_}/rest/v1/fin_debt_plans`, {
      method: 'POST', headers: noSession,
      body: JSON.stringify({ user_id: USER_ID, person_id: ana.id, concept: 'Intruso', principal: 10, currency: 'USD', installments: 1, starts_on: '2026-09-05' }),
    })
    ok('sin sesión no puede insertar un plan', ins.status >= 400, `HTTP ${ins.status}`)

    await fetch(`${URL_}/rest/v1/fin_debt_plans?id=eq.${otroPlan.id}`, {
      method: 'PATCH', headers: noSession, body: JSON.stringify({ concept: 'Hackeado' }),
    })
    eq('ni modificarlo', (await rows('fin_debt_plans', `&id=eq.${otroPlan.id}`))[0].concept, 'Otro plan')

    await fetch(`${URL_}/rest/v1/fin_debt_plans?id=eq.${otroPlan.id}`, { method: 'DELETE', headers: noSession })
    eq('ni borrarlo', (await rows('fin_debt_plans', `&id=eq.${otroPlan.id}`)).length, 1)

    await as(`/fin_debt_plans?id=eq.${otroPlan.id}`, { method: 'DELETE' })
  }

  section('SPRINT 5 · fin_pasanaku')
  let pasanaku
  {
    const anon = await fetch(`${URL_}/rest/v1/fin_pasanaku?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve pasanaku', anon, [])

    // Sin account_id a propósito: la cuenta se elige al aportar/recibir, no
    // al crear — revisión del 2026-08-21, mismo patrón que fin_recurring
    // (20260820000000_finanzas_fijos_moneda_cuenta_opcional.sql).
    pasanaku = (await post('fin_pasanaku', {
      user_id: USER_ID, name: 'Oficina', currency: 'USD',
      contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
    }).then(r => r.json()))[0]
    ok('crea un pasanaku sin cuenta', !!pasanaku?.id)
    eq('account_id nace null', pasanaku.account_id, null)
    eq('nace sin archivar', pasanaku.archived, false)

    const conCuenta = (await post('fin_pasanaku', {
      user_id: USER_ID, name: 'Con cuenta desde el alta', account_id: airtm.id, currency: 'USD',
      contribution_amount: 50, total_slots: 4, my_slot: 1, start_date: '2026-08-05',
    }).then(r => r.json()))[0]
    ok('pero también se puede pasar una si se quiere', !!conCuenta?.id)
    eq('y queda guardada', conCuenta.account_id, airtm.id)
    await as(`/fin_pasanaku?id=eq.${conCuenta.id}`, { method: 'DELETE' })

    // Sin moneda explícita, la base defaulta a 'USD' — mismo criterio que
    // fin_recurring.currency. Que la moneda sea obligatoria de verdad es una
    // regla de la API (validatePasanaku, cubierta en unit.mjs y api.mjs), no
    // de la base: el default existe para que un insert sin ese campo no
    // rompa nunca a nivel de constraint.
    const sinMoneda = (await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', contribution_amount: 100, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
    }).then(r => r.json()))[0]
    eq('sin moneda explícita cae al default USD', sinMoneda.currency, 'USD')
    await as(`/fin_pasanaku?id=eq.${sinMoneda.id}`, { method: 'DELETE' })

    const monedaInvalida = await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', currency: 'EUR',
      contribution_amount: 100, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
    })
    ok('rechaza una moneda fuera del enum', monedaInvalida.status >= 400, `HTTP ${monedaInvalida.status}`)

    const unPuesto = await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', currency: 'USD',
      contribution_amount: 100, total_slots: 1, my_slot: 1, start_date: '2026-08-05',
    })
    ok('rechaza una ronda de un solo puesto', unPuesto.status >= 400, `HTTP ${unPuesto.status}`)

    const puestoCero = await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', currency: 'USD',
      contribution_amount: 100, total_slots: 8, my_slot: 0, start_date: '2026-08-05',
    })
    ok('rechaza puesto en cero', puestoCero.status >= 400, `HTTP ${puestoCero.status}`)

    const puestoFueraDeRango = await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', currency: 'USD',
      contribution_amount: 100, total_slots: 8, my_slot: 9, start_date: '2026-08-05',
    })
    ok('rechaza un puesto mayor que el total (fin_pasanaku_slot_shape)',
       puestoFueraDeRango.status >= 400, `HTTP ${puestoFueraDeRango.status}`)

    const aporteCero = await post('fin_pasanaku', {
      user_id: USER_ID, name: 'X', currency: 'USD',
      contribution_amount: 0, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
    })
    ok('rechaza aporte en cero', aporteCero.status >= 400, `HTTP ${aporteCero.status}`)

    const ajeno = await post('fin_pasanaku', {
      user_id: '00000000-0000-0000-0000-000000000001', name: 'Ajeno', currency: 'USD',
      contribution_amount: 100, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
    })
    ok('RLS impide crear un pasanaku a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)
  }

  section('SPRINT 5 · el vínculo con los movimientos')
  {
    const tx = (await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', flow_type: 'movimiento', date: '2026-08-05',
      account_id: airtm.id, amount: 300, currency: 'USD', exchange_rate: 1, amount_usd: 300,
      description: 'Oficina', pasanaku_id: pasanaku.id,
    }).then(r => r.json()))[0]
    eq('un aporte puede apuntar a su pasanaku', tx.pasanaku_id, pasanaku.id)

    // Borrar el pasanaku NO borra la historia de lo aportado: el movimiento
    // queda, solo pierde el vínculo — mismo trato que un fijo (Sprint 3).
    await as(`/fin_pasanaku?id=eq.${pasanaku.id}`, { method: 'DELETE' })

    const sobrevive = (await rows('fin_transactions', `&id=eq.${tx.id}`))[0]
    ok('el aporte sobrevive al pasanaku', !!sobrevive?.id)
    eq('pero pierde el vínculo', sobrevive.pasanaku_id, null)

    await as(`/fin_transactions?id=eq.${tx.id}`, { method: 'DELETE' })
  }

  section('SPRINT 5 · RLS de escritura sobre fin_pasanaku')
  {
    const noSession = { apikey: ANON, 'Content-Type': 'application/json' }
    const otro = (await post('fin_pasanaku', {
      user_id: USER_ID, name: 'Barrio', currency: 'USD',
      contribution_amount: 200, total_slots: 6, my_slot: 2, start_date: '2026-08-05',
    }).then(r => r.json()))[0]

    const ins = await fetch(`${URL_}/rest/v1/fin_pasanaku`, {
      method: 'POST', headers: noSession,
      body: JSON.stringify({
        user_id: USER_ID, name: 'Intruso', currency: 'USD',
        contribution_amount: 1, total_slots: 2, my_slot: 1, start_date: '2026-08-05',
      }),
    })
    ok('sin sesión no puede insertar un pasanaku', ins.status >= 400, `HTTP ${ins.status}`)

    await fetch(`${URL_}/rest/v1/fin_pasanaku?id=eq.${otro.id}`, {
      method: 'PATCH', headers: noSession, body: JSON.stringify({ name: 'Hackeado' }),
    })
    eq('ni modificarlo', (await rows('fin_pasanaku', `&id=eq.${otro.id}`))[0].name, 'Barrio')

    await fetch(`${URL_}/rest/v1/fin_pasanaku?id=eq.${otro.id}`, { method: 'DELETE', headers: noSession })
    eq('ni borrarlo', (await rows('fin_pasanaku', `&id=eq.${otro.id}`)).length, 1)

    await as(`/fin_pasanaku?id=eq.${otro.id}`, { method: 'DELETE' })
  }

  section('SPRINT 5 (revisión) · fin_pasanaku_historico — aportes de antes de la app')
  {
    const p = (await post('fin_pasanaku', {
      user_id: USER_ID, name: 'Con historia', currency: 'BOB',
      contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-05-05',
    }).then(r => r.json()))[0]

    const anon = await fetch(`${URL_}/rest/v1/fin_pasanaku_historico?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve históricos', anon, [])

    const h1 = (await post('fin_pasanaku_historico', {
      user_id: USER_ID, pasanaku_id: p.id, date: '2026-05-05', amount: 300,
    }).then(r => r.json()))[0]
    ok('crea un histórico', !!h1?.id)

    const montoCero = await post('fin_pasanaku_historico', {
      user_id: USER_ID, pasanaku_id: p.id, date: '2026-06-05', amount: 0,
    })
    ok('rechaza monto en cero', montoCero.status >= 400, `HTTP ${montoCero.status}`)

    const ajeno = await post('fin_pasanaku_historico', {
      user_id: '00000000-0000-0000-0000-000000000001', pasanaku_id: p.id, date: '2026-05-05', amount: 100,
    })
    ok('RLS impide crear un histórico a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)

    const noSession2 = { apikey: ANON, 'Content-Type': 'application/json' }
    await fetch(`${URL_}/rest/v1/fin_pasanaku_historico?id=eq.${h1.id}`, { method: 'DELETE', headers: noSession2 })
    eq('sin sesión no puede borrar un histórico', (await rows('fin_pasanaku_historico', `&id=eq.${h1.id}`)).length, 1)

    // A diferencia de fin_transactions.pasanaku_id (on delete set null), acá
    // sí es cascade: un histórico no tiene sentido sin su pasanaku.
    await as(`/fin_pasanaku?id=eq.${p.id}`, { method: 'DELETE' })
    eq('borrar el pasanaku se lleva su histórico (on delete cascade)',
       (await rows('fin_pasanaku_historico', `&id=eq.${h1.id}`)).length, 0)
  }

  section('SPRINT 6 · fin_budget_lines, fin_budget_periods, fin_budget_extensions, fin_budget_closures')
  let budgetCategory, budgetLine, budgetPeriod
  {
    const anonLines = await fetch(`${URL_}/rest/v1/fin_budget_lines?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve líneas de presupuesto', anonLines, [])

    budgetCategory = (await post('fin_categories', { user_id: USER_ID, name: 'Salidas', kind: 'gasto', icon: 'ocio' }).then(r => r.json()))[0]
    ok('crea la categoría para el presupuesto', !!budgetCategory?.id)

    // Una línea ya no lleva su categoría en una columna propia — la
    // categoría vive en `fin_budget_line_categories`, la tabla puente que
    // permite varias por línea (§ rediseño multi-categoría).
    budgetLine = (await post('fin_budget_lines', {
      user_id: USER_ID, retroactive: true, created_on: '2026-08-01',
    }).then(r => r.json()))[0]
    ok('crea una línea de presupuesto', !!budgetLine?.id)
    eq('sin nombre, default null (alias opcional)', budgetLine.name, null)
    eq('sin moneda de entrada, default USD', budgetLine.input_currency, 'USD')

    const link1 = await post('fin_budget_line_categories', { user_id: USER_ID, line_id: budgetLine.id, category_id: budgetCategory.id })
    ok('liga la categoría a la línea', link1.status < 300, `HTTP ${link1.status}`)

    const otraLinea = (await post('fin_budget_lines', { user_id: USER_ID, retroactive: true }).then(r => r.json()))[0]
    const dupCategory = await post('fin_budget_line_categories', { user_id: USER_ID, line_id: otraLinea.id, category_id: budgetCategory.id })
    ok('no deja la misma categoría en dos líneas a la vez', dupCategory.status >= 400, `HTTP ${dupCategory.status}`)
    await as(`/fin_budget_lines?id=eq.${otraLinea.id}`, { method: 'DELETE' })

    const otraCategoria = (await post('fin_categories', { user_id: USER_ID, name: 'Otra', kind: 'gasto', icon: 'ocio' }).then(r => r.json()))[0]
    const monedaInvalida = await post('fin_budget_lines', { user_id: USER_ID, retroactive: true, input_currency: 'EUR' })
    ok('rechaza una moneda de entrada fuera del set soportado', monedaInvalida.status >= 400, `HTTP ${monedaInvalida.status}`)

    // Una línea puede cubrir varias categorías — se suma la segunda a la
    // misma línea que ya tenía `budgetCategory`.
    const link2 = await post('fin_budget_line_categories', { user_id: USER_ID, line_id: budgetLine.id, category_id: otraCategoria.id })
    ok('la misma línea admite una segunda categoría', link2.status < 300, `HTTP ${link2.status}`)
    eq('la línea queda con las dos categorías',
       (await rows('fin_budget_line_categories', `&line_id=eq.${budgetLine.id}`)).length, 2)

    // Borrar UNA de las dos no se lleva la línea: todavía le queda la otra.
    await as(`/fin_categories?id=eq.${otraCategoria.id}`, { method: 'DELETE' })
    eq('con una categoría borrada, la línea sigue viva — le queda la otra',
       (await rows('fin_budget_lines', `&id=eq.${budgetLine.id}`)).length, 1)
    eq('y le queda solo la categoría que no se borró',
       (await rows('fin_budget_line_categories', `&line_id=eq.${budgetLine.id}`)).length, 1)

    budgetPeriod = (await post('fin_budget_periods', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-08-01',
      amount: 80, amount_usd: 80, exchange_rate: 1,
    }).then(r => r.json()))[0]
    ok('crea el monto de agosto', !!budgetPeriod?.id)
    eq('guarda el monto nativo tal cual', Number(budgetPeriod.amount), 80)

    // El monto nativo y la tasa son obligatorios: sin ellos el número que el
    // usuario escribió tendría que reconstruirse, que es justo lo que se
    // dejó de hacer.
    const sinNativo = await post('fin_budget_periods', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-10-01', amount_usd: 50,
    })
    ok('sin monto nativo → rechazado', sinNativo.status >= 400, `HTTP ${sinNativo.status}`)

    const dupPeriod = await post('fin_budget_periods', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-08-01', amount: 90, amount_usd: 90, exchange_rate: 1,
    })
    ok('no deja dos filas para el mismo (línea, período)', dupPeriod.status >= 400, `HTTP ${dupPeriod.status}`)

    const zeroAmount = await post('fin_budget_periods', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-09-01', amount: 0, amount_usd: 0, exchange_rate: 1,
    })
    ok('rechaza monto en cero', zeroAmount.status >= 400, `HTTP ${zeroAmount.status}`)

    const badRate = await post('fin_budget_periods', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-09-01', amount: 10, amount_usd: 10, exchange_rate: 0,
    })
    ok('rechaza una tasa en cero', badRate.status >= 400, `HTTP ${badRate.status}`)

    const extension = (await post('fin_budget_extensions', {
      user_id: USER_ID, period_id: budgetPeriod.id, amount: 15, amount_usd: 15, exchange_rate: 1,
    }).then(r => r.json()))[0]
    ok('crea una ampliación', !!extension?.id)

    const zeroExtension = await post('fin_budget_extensions', {
      user_id: USER_ID, period_id: budgetPeriod.id, amount: 0, amount_usd: 0, exchange_rate: 1,
    })
    ok('rechaza una ampliación en cero', zeroExtension.status >= 400, `HTTP ${zeroExtension.status}`)

    // Un cierre en rojo es tan válido como uno en verde: sin CHECK > 0 — ni
    // en el USD ni en el nativo.
    const closure = (await post('fin_budget_closures', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-07-01', carried: false,
      amount: -12.5, amount_usd: -12.5, exchange_rate: 1,
    }).then(r => r.json()))[0]
    ok('un cierre con disponible negativo es válido', !!closure?.id)
    eq('y su monto nativo también puede ser negativo', Number(closure.amount), -12.5)

    const dupClosure = await post('fin_budget_closures', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-07-01', carried: true,
      amount: 5, amount_usd: 5, exchange_rate: 1,
    })
    ok('el mismo mes no se cierra dos veces', dupClosure.status >= 400, `HTTP ${dupClosure.status}`)

    const otroMes = await post('fin_budget_closures', {
      user_id: USER_ID, line_id: budgetLine.id, period: '2026-06-01', carried: true,
      amount: 8, amount_usd: 8, exchange_rate: 1,
    })
    ok('otro mes sí se puede cerrar', otroMes.status < 400, `HTTP ${otroMes.status}`)

    await as(`/fin_budget_periods?id=eq.${budgetPeriod.id}`, { method: 'DELETE' })
    eq('borrar el período se lleva sus ampliaciones (cascade)',
       (await rows('fin_budget_extensions', `&period_id=eq.${budgetPeriod.id}`)).length, 0)

    // `budgetCategory` es la ÚLTIMA categoría que le queda a la línea — al
    // borrarla, el trigger `fin_budget_line_categories_cleanup` se lleva la
    // línea entera por quedar sin ninguna.
    await as(`/fin_categories?id=eq.${budgetCategory.id}`, { method: 'DELETE' })
    eq('sin categorías, el trigger se lleva la línea de presupuesto',
       (await rows('fin_budget_lines', `&id=eq.${budgetLine.id}`)).length, 0)
    eq('y con ella, sus cierres (cascade sobre line_id)',
       (await rows('fin_budget_closures', `&line_id=eq.${budgetLine.id}`)).length, 0)
  }

  section('SPRINT 7 (rev. 26/8) · ninguna cuenta es "de ahorro"')
  {
    // La columna se eliminó: cualquier cuenta puede alojar ahorros, y lo que
    // vuelve la plata un ahorro es la etiqueta del movimiento.
    const conFlag = await post('fin_accounts', {
      user_id: USER_ID, name: 'Con flag viejo', currency: 'USD', is_savings: true,
    })
    ok('mandar is_savings ya no existe como columna', conFlag.status >= 400, `HTTP ${conFlag.status}`)
  }

  section('SPRINT 7 · fin_savings_goals')
  let ahorroFijo, ahorroPct
  {
    const anonGoals = await fetch(`${URL_}/rest/v1/fin_savings_goals?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve ningún ahorro', anonGoals, [])

    ahorroFijo = (await post('fin_savings_goals', {
      user_id: USER_ID, name: 'Emergencia', input_currency: 'USD',
      allocation_type: 'fixed', allocation_value: 50,
    }).then(r => r.json()))[0]
    ok('crea un ahorro de monto fijo', !!ahorroFijo?.id)

    ahorroPct = (await post('fin_savings_goals', {
      user_id: USER_ID, name: 'Viaje', input_currency: 'BOB',
      allocation_type: 'percent', allocation_value: 30, target_amount: 5000,
    }).then(r => r.json()))[0]
    ok('crea un ahorro porcentual con meta', !!ahorroPct?.id)

    const monedaInvalida = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'Euros', input_currency: 'EUR', allocation_type: 'fixed', allocation_value: 10,
    })
    ok('rechaza una moneda fuera del enum', monedaInvalida.status >= 400, `HTTP ${monedaInvalida.status}`)

    const tipoInvalido = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'X', input_currency: 'USD', allocation_type: 'mitad', allocation_value: 10,
    })
    ok('rechaza un allocation_type fuera del enum', tipoInvalido.status >= 400, `HTTP ${tipoInvalido.status}`)

    const valorCero = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'X', input_currency: 'USD', allocation_type: 'fixed', allocation_value: 0,
    })
    ok('rechaza un reparto en cero', valorCero.status >= 400, `HTTP ${valorCero.status}`)

    const pctSobre100 = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'X', input_currency: 'USD', allocation_type: 'percent', allocation_value: 150,
    })
    ok('un porcentaje no puede superar 100', pctSobre100.status >= 400, `HTTP ${pctSobre100.status}`)

    const fijoSobre100 = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'X', input_currency: 'USD', allocation_type: 'fixed', allocation_value: 500,
    })
    ok('un monto fijo SÍ puede superar 100 (no es un porcentaje)', fijoSobre100.status < 400, `HTTP ${fijoSobre100.status}`)
    if (fijoSobre100.status < 400) {
      const [row] = await fijoSobre100.json()
      await as(`/fin_savings_goals?id=eq.${row.id}`, { method: 'DELETE' })
    }

    const metaCero = await post('fin_savings_goals', {
      user_id: USER_ID, name: 'X', input_currency: 'USD', allocation_type: 'fixed', allocation_value: 10, target_amount: 0,
    })
    ok('rechaza una meta en cero', metaCero.status >= 400, `HTTP ${metaCero.status}`)

    const ajeno = await post('fin_savings_goals', {
      user_id: '00000000-0000-0000-0000-000000000001', name: 'Ajeno', input_currency: 'USD',
      allocation_type: 'fixed', allocation_value: 10,
    })
    ok('RLS impide crear un ahorro a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)

    // Cajón de sastre: como mucho uno activo por usuario (índice único parcial).
    eq('nace sin ser el cajón de sastre', ahorroFijo.is_catchall, false)
    const primerCajon = await as(`/fin_savings_goals?id=eq.${ahorroFijo.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_catchall: true }),
    })
    ok('se puede marcar uno como cajón de sastre', primerCajon.status < 400, `HTTP ${primerCajon.status}`)

    const segundoCajon = await as(`/fin_savings_goals?id=eq.${ahorroPct.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_catchall: true }),
    })
    ok('pero no dos a la vez: el índice único lo rechaza', segundoCajon.status >= 400, `HTTP ${segundoCajon.status}`)

    // Archivar el cajón libera el lugar — mismo criterio que fin_budget_lines.
    await as(`/fin_savings_goals?id=eq.${ahorroFijo.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    const trasArchivar = await as(`/fin_savings_goals?id=eq.${ahorroPct.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_catchall: true }),
    })
    ok('con el anterior archivado, otro puede tomar el lugar', trasArchivar.status < 400, `HTTP ${trasArchivar.status}`)
    await as(`/fin_savings_goals?id=eq.${ahorroPct.id}`, { method: 'PATCH', body: JSON.stringify({ is_catchall: false }) })
    await as(`/fin_savings_goals?id=eq.${ahorroFijo.id}`, {
      method: 'PATCH', body: JSON.stringify({ archived: false, is_catchall: false }),
    })

    // 8 decimales para un ahorro en BTC — mismo criterio de precisión que
    // cuentas y transacciones (Sprint 1 §3.4).
    const ahorroBtc = (await post('fin_savings_goals', {
      user_id: USER_ID, name: 'Cripto', input_currency: 'BTC', allocation_type: 'fixed', allocation_value: 0.00042195,
    }).then(r => r.json()))[0]
    eq('el reparto en BTC conserva los 8 decimales', Number(ahorroBtc.allocation_value), 0.00042195)
    await as(`/fin_savings_goals?id=eq.${ahorroBtc.id}`, { method: 'DELETE' })
  }

  section('SPRINT 7 · fin_transactions.savings_goal_id / savings_flow / savings_reason')
  let cuentaOrigen, cuentaDestino, aporteTx
  {
    cuentaOrigen = (await post('fin_accounts', {
      user_id: USER_ID, name: 'Cuenta origen ahorro', currency: 'USD', initial_balance: 500,
    }).then(r => r.json()))[0]
    cuentaDestino = (await post('fin_accounts', {
      user_id: USER_ID, name: 'Cuenta destino ahorro', currency: 'USD', initial_balance: 0,
    }).then(r => r.json()))[0]

    aporteTx = (await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-24',
      account_id: cuentaOrigen.id, to_account_id: cuentaDestino.id,
      amount: 50, currency: 'USD', exchange_rate: 1, amount_usd: 50,
      flow_type: 'movimiento', savings_goal_id: ahorroFijo.id, savings_flow: 'aporte',
    }).then(r => r.json()))[0]
    ok('crea una transferencia tageada con un ahorro', !!aporteTx?.id)
    eq('savings_reason queda null en un aporte', aporteTx.savings_reason, null)

    // La dirección se declara, no se deduce (revisión 26/8): una fila tageada
    // sin `savings_flow` no se puede leer sin adivinar, así que no existe.
    const sinDireccion = await post('fin_transactions', {
      user_id: USER_ID, type: 'transferencia', date: '2026-08-24',
      account_id: cuentaOrigen.id, to_account_id: cuentaDestino.id,
      amount: 10, currency: 'USD', exchange_rate: 1, amount_usd: 10,
      flow_type: 'movimiento', savings_goal_id: ahorroFijo.id,
    })
    ok('un movimiento tageado sin savings_flow no entra', sinDireccion.status >= 400, `HTTP ${sinDireccion.status}`)

    const direccionInvalida = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-24',
      account_id: cuentaOrigen.id, amount: 10, currency: 'USD', exchange_rate: 1, amount_usd: 10,
      flow_type: 'consumo', savings_goal_id: ahorroFijo.id, savings_flow: 'ahorrito',
    })
    ok('rechaza un savings_flow fuera del enum', direccionInvalida.status >= 400, `HTTP ${direccionInvalida.status}`)

    // Y al revés: dirección sin etiqueta tampoco significa nada.
    const direccionHuerfana = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-24',
      account_id: cuentaOrigen.id, amount: 10, currency: 'USD', exchange_rate: 1, amount_usd: 10,
      flow_type: 'consumo', savings_flow: 'retiro',
    })
    ok('savings_flow sin savings_goal_id no entra', direccionHuerfana.status >= 400, `HTTP ${direccionHuerfana.status}`)

    const razonInvalida = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-24',
      account_id: cuentaOrigen.id, amount: 10, currency: 'USD', exchange_rate: 1, amount_usd: 10,
      flow_type: 'consumo', savings_goal_id: ahorroFijo.id, savings_flow: 'retiro', savings_reason: 'porque sí',
    })
    ok('rechaza un savings_reason fuera del enum', razonInvalida.status >= 400, `HTTP ${razonInvalida.status}`)

    const retiro = (await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-24',
      account_id: cuentaOrigen.id, amount: 10, currency: 'USD', exchange_rate: 1, amount_usd: 10,
      flow_type: 'consumo', savings_goal_id: ahorroFijo.id, savings_flow: 'retiro', savings_reason: 'emergencia',
    }).then(r => r.json()))[0]
    ok('acepta un retiro con motivo válido', !!retiro?.id)

    const fantasma = await post('fin_transactions', {
      user_id: USER_ID, type: 'gasto', date: '2026-08-24',
      account_id: cuentaOrigen.id, amount: 5, currency: 'USD', exchange_rate: 1, amount_usd: 5,
      flow_type: 'consumo', savings_goal_id: '00000000-0000-0000-0000-000000000099',
      savings_flow: 'retiro', savings_reason: 'otro',
    })
    ok('la FK rechaza un savings_goal_id que no existe', fantasma.status >= 400, `HTTP ${fantasma.status}`)

    // Borrar el ahorro no borra sus movimientos: savings_goal_id cae a null
    // (on delete set null), mismo criterio que recurring_id/pasanaku_id.
    //
    // BUG (26/8): con el constraint de forma puesto, la fila resultante
    // (goal null, flow 'retiro') violaba el CHECK y el DELETE moría con el
    // mensaje crudo de Postgres — cualquier ahorro que hubiera recibido un
    // aporte quedaba imborrable. Un trigger limpia dirección y motivo antes
    // de que la FK suelte la etiqueta (20260826030000).
    const borrado = await as(`/fin_savings_goals?id=eq.${ahorroFijo.id}`, { method: 'DELETE' })
    ok('se puede borrar un ahorro que YA tiene movimientos', borrado.status < 400, `HTTP ${borrado.status}`)
    const [aporteTrasborrado] = await rows('fin_transactions', `&id=eq.${aporteTx.id}`)
    eq('savings_goal_id cae a null cuando se borra el ahorro', aporteTrasborrado.savings_goal_id, null)
    eq('y la dirección se limpia con él', aporteTrasborrado.savings_flow, null)
    const [retiroTrasborrado] = await rows('fin_transactions', `&id=eq.${retiro.id}`)
    eq('y el motivo del retiro también', retiroTrasborrado.savings_reason, null)
  }

  section('SPRINT 7 · fin_savings_closures')
  {
    const anonClosures = await fetch(`${URL_}/rest/v1/fin_savings_closures?select=*`, { headers: { apikey: ANON } }).then(r => r.json())
    eq('sin sesión no ve ningún cierre', anonClosures, [])

    const julio = (await post('fin_savings_closures', {
      user_id: USER_ID, period: '2026-07-01', surplus_usd: 245.60,
    }).then(r => r.json()))[0]
    ok('crea el cierre de julio', !!julio?.id)

    const negativo = await post('fin_savings_closures', {
      user_id: USER_ID, period: '2026-06-01', surplus_usd: -32.40,
    })
    ok('un mes en rojo también se puede cerrar (surplus_usd negativo)', negativo.status < 400, `HTTP ${negativo.status}`)

    const dupe = await post('fin_savings_closures', {
      user_id: USER_ID, period: '2026-07-01', surplus_usd: 100,
    })
    ok('el mismo período no se cierra dos veces', dupe.status >= 400, `HTTP ${dupe.status}`)

    const ajeno = await post('fin_savings_closures', {
      user_id: '00000000-0000-0000-0000-000000000001', period: '2026-05-01', surplus_usd: 10,
    })
    ok('RLS impide crear un cierre a nombre de otro', ajeno.status >= 400, `HTTP ${ajeno.status}`)
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
