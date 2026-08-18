import { URL_, SRV, ANON } from './env.mjs'
import { eq, ok, section, summary, sweepTestUsers } from './harness.mjs'

const BASE = process.env.FZ_BASE_URL ?? 'http://localhost:3001'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

const adminFetch = (p, i = {}) => fetch(`${URL_}${p}`, {
  ...i, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...i.headers },
})

const EMAIL = `fz-api-${Date.now()}@acerotest.local`
const PASSWORD = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
let USER_ID = null, COOKIE = null

async function setup() {
  // Arrastra lo que haya quedado de una corrida interrumpida.
  await sweepTestUsers(URL_, SRV)

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
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100

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
    ok('las 5 tasas llegan resueltas', ['BOB','USDT','USDC','BTC'].every(c => d.rates[c] > 0), JSON.stringify(d.rates))
    ok('el Bs viene del mercado, no del default 6.96', d.rates.BOB !== 6.96, `obtenido ${d.rates.BOB}`)
    ok('y cada una con su fecha de última edición',
       Array.isArray(d.rate_list) && d.rate_list.every(r => typeof r.updated_at === 'string'),
       JSON.stringify(d.rate_list))
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
    // Las tasas ahora salen del mercado y se mueven solas. Un suite de pruebas
    // no puede depender de la cotización del día: se fijan a manual con valores
    // conocidos para que todas las cifras de abajo sean deterministas.
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BTC', rate: 68000 }) })
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'USDT', rate: 1 }) })
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'USDC', rate: 1 }) })
    const fijadas = await json(await api('/rates'))
    eq('las tasas quedaron fijadas para la prueba',
       ['BOB','BTC','USDT','USDC'].map(c => fijadas.rates[c]), [6.96, 68000, 1, 1])

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
    ok('congela el factor USD-por-Bs, no la tasa invertida',
       Math.abs(Number(gasto.exchange_rate) - 1 / 6.96) < 1e-7, `obtenido ${gasto.exchange_rate}`)

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

    section('TASAS AUTOMÁTICAS')
    {
      // El flujo de arriba las dejó fijadas a mano; esta sección prueba
      // justamente el comportamiento automático, así que las reengancha.
      for (const c of ['BOB', 'USDT', 'USDC', 'BTC']) {
        await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: c, auto: true }) })
      }
      const r = await json(await api('/rates'))
      ok('devuelve las cotizaciones de mercado', r.quotes && Object.keys(r.quotes).length > 0, JSON.stringify(r.quotes))
      ok('las 5 tasas arrancan en automático', r.list.every(x => x.auto === true), JSON.stringify(r.list))
      ok('cada una declara de dónde salió', r.list.every(x => typeof x.source === 'string' && x.source !== ''))

      const bob = r.list.find(x => x.currency === 'BOB')
      eq('el Bs arranca siguiendo la cotización oficial', bob.quote_pair, 'BOB_USD')
      ok('y su valor coincide con esa cotización',
         Math.abs(bob.rate - r.quotes.BOB_USD.rate) < 1e-8, `${bob.rate} vs ${r.quotes.BOB_USD.rate}`)

      const btc = r.list.find(x => x.currency === 'BTC')
      ok('el BTC toma su precio del mercado, no del default 68000',
         Math.abs(btc.rate - r.quotes.BTC_USD.rate) < 1e-8 && btc.rate !== 68000, `obtenido ${btc.rate}`)

      // Cambiar el Bs al paralelo.
      const alParalelo = await json(await api('/rates', {
        method: 'PATCH', body: JSON.stringify({ currency: 'BOB', quote_pair: 'BOB_USDT' }),
      }))
      const bobP = alParalelo.list.find(x => x.currency === 'BOB')
      eq('se puede cambiar el Bs al paralelo', bobP.quote_pair, 'BOB_USDT')
      ok('y toma el valor del paralelo',
         Math.abs(bobP.rate - alParalelo.quotes.BOB_USDT.rate) < 1e-8)
      await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', quote_pair: 'BOB_USD' }) })

      eq('una moneda no puede seguir una cotización ajena → 400',
         (await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BTC', quote_pair: 'BOB_USDT' }) })).status, 400)
      eq('par inexistente → 400',
         (await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', quote_pair: 'XXX' }) })).status, 400)

      // Fijar a mano corta el seguimiento del mercado.
      const manual = await json(await api('/rates', {
        method: 'PATCH', body: JSON.stringify({ currency: 'BTC', rate: 50000 }),
      }))
      const btcM = manual.list.find(x => x.currency === 'BTC')
      eq('escribir una tasa la pasa a manual sola', btcM.auto, false)
      eq('y usa el valor escrito', btcM.rate, 50000)
      eq('marcándola como manual', btcM.source, 'manual')

      const vuelta = await json(await api('/rates', {
        method: 'PATCH', body: JSON.stringify({ currency: 'BTC', auto: true }),
      }))
      const btcA = vuelta.list.find(x => x.currency === 'BTC')
      eq('volver a auto la reengancha al mercado', btcA.auto, true)
      ok('y descarta el valor manual', btcA.rate !== 50000, `obtenido ${btcA.rate}`)

      // Se vuelven a fijar: lo que sigue depende de cifras deterministas.
      // USDT y USDC incluidos — en el mercado real cotizan a 0.9994, no a 1.
      await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BTC', rate: 68000 }) })
      await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })
      await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'USDT', rate: 1 }) })
      await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'USDC', rate: 1 }) })
    }

    section('POST /rates/refresh')
    {
      const r = await json(await api('/rates/refresh', { method: 'POST' }))
      ok('el usuario logueado puede refrescar a mano', r.ok === true, JSON.stringify(r))
      ok('y trae los 5 pares', r.traidas === 5, `traidas: ${r.traidas}`)

      const sinSesion = await fetch(`${BASE}/api/finanzas/rates/refresh`, { method: 'POST' })
      eq('sin sesión ni secret → 401', sinSesion.status, 401)

      const secretMalo = await fetch(`${BASE}/api/finanzas/rates/refresh`, {
        method: 'POST', headers: { Authorization: 'Bearer no-es-el-secret' },
      })
      eq('con un secret incorrecto → 401', secretMalo.status, 401)
    }

    section('PATCH /rates · la tasa no reescribe la historia')
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 7.5 }) })
    const viejo = (await json(await api(`/transactions?from=2026-08-18&to=2026-08-18`))).transactions.find(t => t.id === gasto.id)
    eq('el gasto viejo sigue en 5.03', Number(viejo.amount_usd), 5.03)

    const nuevo = (await json(await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: efectivo.id, amount: 35 }),
    }))).transaction
    eq('el gasto nuevo usa 7.50 → 4.67', Number(nuevo.amount_usd), 4.67)
    eq('tasa cero → 400', (await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 0 }) })).status, 400)
    eq('tasa para USD → 400 (es la referencia)', (await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'USD', rate: 1 }) })).status, 400)
    eq('moneda inexistente → 400', (await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'EUR', rate: 1 }) })).status, 400)

    // REGRESIÓN: Ajustes mostraba como "última edición" el momento en que se
    // cargó la página, porque el endpoint nunca devolvía la fecha real.
    const tras = await json(await api('/accounts'))
    const filaBob = tras.rate_list.find(r => r.currency === 'BOB')
    ok('editar la tasa mueve la fecha de última edición',
       new Date(filaBob.updated_at).getTime() > Date.now() - 60000,
       `obtenido: ${filaBob.updated_at}`)
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })
    await api(`/transactions/${nuevo.id}`, { method: 'DELETE' })

    section('PATCH /transactions · recongelado selectivo')
    const factorAntes = Number(gasto.exchange_rate)
    const soloDesc = (await json(await api(`/transactions/${gasto.id}`, {
      method: 'PATCH', body: JSON.stringify({ description: 'Almuerzo con Luis' }),
    }))).transaction
    eq('editar solo la descripción NO toca la tasa', Number(soloDesc.exchange_rate), factorAntes)
    eq('ni el amount_usd', Number(soloDesc.amount_usd), 5.03)

    const cambiaMonto = (await json(await api(`/transactions/${gasto.id}`, {
      method: 'PATCH', body: JSON.stringify({ amount: 70 }),
    }))).transaction
    eq('cambiar el monto sí recalcula', Number(cambiaMonto.amount_usd), 10.06)

    const bal = await json(await api('/accounts'))
    eq('el saldo refleja 70, no 35+70', bal.accounts.find(a => a.id === efectivo.id).balance, 278)

    await api(`/transactions/${gasto.id}`, { method: 'PATCH', body: JSON.stringify({ amount: 35 }) })

    section('ACTIVOS NUEVOS vía API')
    const usdt = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tether',  currency: 'USDT', initial_balance: 30 }) }))).account
    const btc  = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Bitcoin', currency: 'BTC',  initial_balance: 0.0132 }) }))).account
    ok('crea cuentas en USDT y BTC', !!usdt && !!btc)
    eq('el saldo en BTC no se trunca a 2 decimales', btc.initial_balance, 0.0132)

    const btcTx = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'ingreso', date: '2026-08-18', account_id: btc.id, amount: 0.00042195 }),
    }))).transaction
    eq('acepta un monto de 8 decimales en BTC', Number(btcTx.amount), 0.00042195)
    eq('y lo valúa al precio del BTC', Number(btcTx.amount_usd), 28.69)

    const conBtc = await json(await api('/accounts'))
    eq('el saldo en BTC suma bien', conBtc.accounts.find(a => a.id === btc.id).balance, 0.01362195)
    eq('y su equivalente en USD usa el precio de hoy', conBtc.accounts.find(a => a.id === btc.id).balance_usd, 926.29)
    eq('USDT a la tasa fijada de 1.00', conBtc.accounts.find(a => a.id === usdt.id).balance_usd, 30)

    // El caso que justificó hacer las stablecoins monedas propias.
    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: usdt.id, amount: 50, to_amount: 48.75 }),
    })
    const conComision = await json(await api('/accounts'))
    eq('la conversión con comisión deja 78.75 USDT', conComision.accounts.find(a => a.id === usdt.id).balance, 78.75)

    section('DELETE /accounts · 409 con movimientos')
    const del = await api(`/accounts/${efectivo.id}`, { method: 'DELETE' })
    eq('no deja borrar una cuenta con movimientos', del.status, 409)
    ok('y el mensaje sugiere archivar', (await json(del)).error.toLowerCase().includes('archiva'))

    eq('cambiar la moneda de una cuenta con movimientos → 409',
       (await api(`/accounts/${efectivo.id}`, { method: 'PATCH', body: JSON.stringify({ currency: 'USD' }) })).status, 409)

    const vacia = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Vacía', currency: 'USD' }) }))).account
    eq('una cuenta sin movimientos sí se borra', (await api(`/accounts/${vacia.id}`, { method: 'DELETE' })).status, 200)

    section('PATCH /accounts/reorder')
    {
      const antes = (await json(await api('/accounts'))).accounts.map(a => a.id)
      ok('hay al menos 3 cuentas para reordenar', antes.length >= 3, `${antes.length}`)

      // Mover la última al principio.
      const nuevo = [antes[antes.length - 1], ...antes.slice(0, -1)]
      const res = await api('/accounts/reorder', { method: 'PATCH', body: JSON.stringify({ ids: nuevo }) })
      eq('reordena y responde 200', res.status, 200)

      const despues = (await json(await api('/accounts'))).accounts
      eq('el orden devuelto respeta el pedido', despues.map(a => a.id), nuevo)
      eq('sort_order queda 0..n sin huecos', despues.map(a => a.sort_order), nuevo.map((_, i) => i))

      // Volver al orden original para no alterar lo que sigue.
      await api('/accounts/reorder', { method: 'PATCH', body: JSON.stringify({ ids: antes }) })
      eq('se puede volver atrás', (await json(await api('/accounts'))).accounts.map(a => a.id), antes)

      eq('sin lista → 400', (await api('/accounts/reorder', { method: 'PATCH', body: JSON.stringify({}) })).status, 400)
      eq('lista vacía → 400', (await api('/accounts/reorder', { method: 'PATCH', body: JSON.stringify({ ids: [] }) })).status, 400)
      eq('con una cuenta ajena → 400',
         (await api('/accounts/reorder', { method: 'PATCH', body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000009'] }) })).status, 400)
    }

    section('PATCH /categories · emoji')
    {
      const cats = (await json(await api('/categories'))).categories
      const comidaCat = cats.find(c => c.name === 'Comida')
      eq('la semilla trae emoji', comidaCat.emoji, '🍽️')

      const cambiado = (await json(await api(`/categories/${comidaCat.id}`, {
        method: 'PATCH', body: JSON.stringify({ emoji: '🥘' }),
      }))).category
      eq('se puede cambiar el emoji de una categoría existente', cambiado.emoji, '🥘')
      eq('sin tocar el nombre', cambiado.name, 'Comida')

      const vaciado = (await json(await api(`/categories/${comidaCat.id}`, {
        method: 'PATCH', body: JSON.stringify({ emoji: null }),
      }))).category
      eq('y se puede dejar sin emoji', vaciado.emoji, null)
      await api(`/categories/${comidaCat.id}`, { method: 'PATCH', body: JSON.stringify({ emoji: '🍽️' }) })
    }

    section('categorías')
    eq('nombre duplicado en el mismo tipo → 409',
       (await api('/categories', { method: 'POST', body: JSON.stringify({ name: 'Comida', kind: 'gasto' }) })).status, 409)
    eq('kind inválido → 400',
       (await api('/categories', { method: 'POST', body: JSON.stringify({ name: 'Cripto', kind: 'inversion' }) })).status, 400)

    section('GET /transactions · filtros y totales')
    const todos = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
    eq('el total de gasto suma solo gastos', todos.total_gasto_usd, 5.03)
    // Se registraron 3 transferencias por 50+100+50 USD y un solo ingreso, el
    // de BTC por 28.69. Que el total de ingresos sea exactamente ese es la
    // prueba de que las transferencias no se cuelan en los totales.
    eq('el total de ingresos excluye las transferencias', todos.total_ingreso_usd, 28.69)
    const transferencias = (await json(await api('/transactions?type=transferencia'))).transactions
    eq('filtra por tipo', transferencias.length, 3)
    ok('y ninguna transferencia aporta a gasto ni a ingreso',
       transferencias.every(x => x.type === 'transferencia'))
    eq('filtra por cuenta incluyendo destino de transferencia',
       (await json(await api(`/transactions?account_id=${broker.id}`))).transactions.length, 1)
    eq('un mes sin datos vuelve vacío',
       (await json(await api('/transactions?from=2026-01-01&to=2026-01-31'))).transactions.length, 0)


    /* ══════════════════════════════════════════════════════════════════════
       SPRINT 2 · Compartidos y reembolsos
       ══════════════════════════════════════════════════════════════════════ */

    section('SPRINT 2 · POST /people')
    let ana, juan
    {
      const r = await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Ana', emoji: '🌿' }) })
      eq('crea una persona', r.status, 201)
      ana = (await json(r)).person

      // Idempotencia: es lo que sostiene el "crear al vuelo" del quick-add.
      const dup = await api('/people', { method: 'POST', body: JSON.stringify({ name: 'ana' }) })
      const dupBody = await json(dup)
      eq('el mismo nombre no crea otra: devuelve 200', dup.status, 200)
      eq('y es exactamente la misma persona', dupBody.person.id, ana.id)
      eq('marcada como no creada', dupBody.created, false)

      eq('sin nombre → 400', (await api('/people', { method: 'POST', body: JSON.stringify({}) })).status, 400)
      eq('nombre en blanco → 400', (await api('/people', { method: 'POST', body: JSON.stringify({ name: '  ' }) })).status, 400)

      juan = (await json(await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Juan' }) }))).person
      const lista = await json(await api('/people'))
      eq('la lista trae las dos', lista.people.length, 2)
      eq('y nadie debe nada todavía', lista.people.every(p => p.open_usd === 0), true)
    }

    section('SPRINT 2 · gasto compartido')
    let spotify
    {
      // Contra el saldo del momento, no contra un número fijo: las secciones
      // anteriores ya movieron Airtm y hardcodear acá haría fallar esta prueba
      // cada vez que alguien agregue un movimiento más arriba.
      const saldoAntes = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance

      const r = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-05', account_id: airtm.id, amount: 11.99,
        description: 'Spotify',
        splits: [{ person_id: ana.id, amount: 3 }, { person_id: juan.id, amount: 3 },
                 { person_name: 'Carlos', amount: 3 }],
      })})
      eq('crea el gasto con reparto', r.status, 201)
      spotify = (await json(r)).transaction
      eq('tres partes', spotify.splits.length, 3)
      eq('Carlos se creó al vuelo', (await json(await api('/people'))).people.length, 3)

      const saldoDespues = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('el saldo baja el BRUTO ($11.99), no tu parte ($2.99)',
         round2(saldoAntes - saldoDespues), 11.99)

      const lista = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el gasto bruto del mes incluye Spotify entero', lista.total_gasto_usd, 17.02)
      eq('lo repartido son $9', lista.total_repartido_usd, 9)
      eq('el gasto real descuenta lo de otros', lista.total_gasto_real_usd, 8.02)

      const soloCompartidos = await json(await api('/transactions?shared=1'))
      eq('el filtro shared=1 devuelve solo el compartido', soloCompartidos.transactions.length, 1)
    }

    section('SPRINT 2 · validación del reparto')
    {
      // Regla CAMBIADA en el Sprint 3: repartir por encima del gasto es válido
      // (cobrás de más y ganás la diferencia). Se limpia para no ensuciar los
      // conteos de las secciones que siguen.
      const sobra = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-05', account_id: airtm.id, amount: 10,
        splits: [{ person_id: ana.id, amount: 20 }],
      })})
      eq('repartir más que el gasto ya no se rechaza', sobra.status, 201)
      await api(`/transactions/${(await json(sobra)).transaction.id}`, { method: 'DELETE' })

      const enIngreso = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'ingreso', date: '2026-08-05', account_id: airtm.id, amount: 100,
        splits: [{ person_id: ana.id, amount: 10 }],
      })})
      eq('un ingreso no se reparte → 400', enIngreso.status, 400)

      const repetida = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-05', account_id: airtm.id, amount: 10,
        splits: [{ person_id: ana.id, amount: 2 }, { person_id: ana.id, amount: 2 }],
      })})
      eq('la misma persona dos veces → 400', repetida.status, 400)

      const fantasma = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-05', account_id: airtm.id, amount: 10,
        splits: [{ person_id: '00000000-0000-0000-0000-000000000009', amount: 2 }],
      })})
      eq('una persona que no existe → 400', fantasma.status, 400)

      // Si el reparto falla, el gasto no debe quedar suelto.
      eq('y ninguno de esos intentos dejó un gasto colgado',
         (await json(await api('/transactions?from=2026-08-05&to=2026-08-05'))).transactions.length, 1)
    }

    section('SPRINT 2 · GET /shared')
    {
      const sh = await json(await api('/shared'))
      eq('te deben $9', sh.por_cobrar_usd, 9)
      eq('repartido entre tres personas', sh.por_persona.length, 3)
      eq('cada una debe $3', sh.por_persona.every(p => p.open_usd === 3), true)
      ok('con la antigüedad calculada', sh.por_persona.every(p => typeof p.oldest_days === 'number'))
      eq('nada cobrado todavía', sh.cobrado_mes_usd, 0)
      eq('un reparto reciente para repetir', sh.repartos_recientes.length, 1)
      eq('con las tres personas', sh.repartos_recientes[0].people.length, 3)
      eq('y detectado como parejo', sh.repartos_recientes[0].even, true)
    }

    section('SPRINT 2 · cobrar')
    let cobroTx
    {
      const sh = await json(await api('/shared'))
      const deAna = sh.por_persona.find(p => p.person.id === ana.id)
      const saldoAntes = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance

      const r = await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: deAna.splits.map(x => x.id), account_id: airtm.id, amount: 3, date: '2026-08-18',
      })})
      eq('registra el cobro', r.status, 201)
      const body = await json(r)
      cobroTx = body.transaction
      eq('como ingreso', cobroTx.type, 'ingreso')
      eq('pero marcado como movimiento', cobroTx.flow_type, 'movimiento')
      eq('y sin categoría', cobroTx.category_id ?? null, null)

      const saldoDespues = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('el saldo sube los $3 que entraron', round2(saldoDespues - saldoAntes), 3)

      // La prueba que define el sprint.
      const lista = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el ingreso del mes NO se mueve', lista.total_ingreso_usd, 28.69)
      eq('y el gasto real tampoco: cobrar no cambia de quién es el gasto', lista.total_gasto_real_usd, 8.02)

      const sh2 = await json(await api('/shared'))
      eq('te deben $6', sh2.por_cobrar_usd, 6)
      eq('cobrado este mes: $3', sh2.cobrado_mes_usd, 3)
      eq('Ana sale de las deudas abiertas', sh2.por_persona.length, 2)
      eq('y entra al historial', sh2.historial.length, 1)
      eq('marcada como cobrada', sh2.historial[0].state, 'cobrado')
    }

    section('SPRINT 2 · cobrar · errores')
    {
      const sh = await json(await api('/shared'))
      const deJuan = sh.por_persona.find(p => p.person.id === juan.id)
      const otro = sh.por_persona.find(p => p.person.id !== juan.id)
      const yaCobrada = sh.historial[0]

      eq('sin deudas → 400', (await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [], account_id: airtm.id, amount: 3 }) })).status, 400)

      eq('sin cuenta → 400', (await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deJuan.splits[0].id], amount: 3 }) })).status, 400)

      eq('monto en cero → 400', (await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deJuan.splits[0].id], account_id: airtm.id, amount: 0 }) })).status, 400)

      eq('una deuda que no existe → 404', (await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: ['00000000-0000-0000-0000-000000000009'], account_id: airtm.id, amount: 3 }) })).status, 404)

      const yaCerrada = await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [yaCobrada.id], account_id: airtm.id, amount: 3 }) })
      eq('una deuda ya cobrada → 400', yaCerrada.status, 400)
      ok('con el gasto nombrado en el error', (await json(yaCerrada)).error.includes('Spotify'))

      const mezcla = await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deJuan.splits[0].id, otro.splits[0].id], account_id: airtm.id, amount: 6 }) })
      eq('mezclar dos personas en un cobro → 400', mezcla.status, 400)

      // Ninguno de esos rechazos debe haber dejado un movimiento suelto.
      const ingresos = (await json(await api('/transactions?type=ingreso'))).transactions
      eq('ningún cobro fallido dejó un movimiento colgado',
         ingresos.filter(t => t.flow_type === 'movimiento').length, 1)
    }

    section('SPRINT 2 · un cobro salda varias deudas')
    {
      // Un segundo gasto compartido con Juan: dos deudas, un solo pago.
      const segundo = (await json(await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-06', account_id: airtm.id, amount: 8, description: 'Cena',
        splits: [{ person_id: juan.id, amount: 4 }],
      })}))).transaction

      const sh = await json(await api('/shared'))
      const deJuan = sh.por_persona.find(p => p.person.id === juan.id)
      eq('Juan debe dos cosas', deJuan.splits.length, 2)

      const r = await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: deJuan.splits.map(x => x.id), account_id: airtm.id, amount: 7, date: '2026-08-18',
      })})
      eq('un solo cobro las salda a las dos', (await json(r)).settled, 2)

      const ingresos = (await json(await api('/transactions?type=ingreso'))).transactions
      eq('y crea un solo movimiento', ingresos.filter(t => t.flow_type === 'movimiento').length, 2)

      // "Cena" queda viva a propósito: con su parte ya cobrada no se puede
      // borrar (esa es justamente la regla), y las secciones siguientes la usan
      // como el reparto que sobrevive a Spotify.
      eq('y ahora no se puede borrar: tiene una parte cobrada',
         (await api(`/transactions/${segundo.id}`, { method: 'DELETE' })).status, 409)
    }

    section('SPRINT 2 · condonar')
    {
      const antes = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      const sh = await json(await api('/shared'))
      const carlos = sh.por_persona[0]

      const r = await api('/shared/waive', { method: 'POST', body: JSON.stringify({
        split_ids: [carlos.splits[0].id] }) })
      eq('condona', (await json(r)).waived, 1)

      const ingresos = (await json(await api('/transactions?type=ingreso'))).transactions
      eq('sin crear ningún movimiento nuevo', ingresos.filter(t => t.flow_type === 'movimiento').length, 2)

      const despues = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      ok('el gasto real SUBE: te hiciste cargo vos',
         despues.total_gasto_real_usd > antes.total_gasto_real_usd,
         `${antes.total_gasto_real_usd} → ${despues.total_gasto_real_usd}`)

      const sh2 = await json(await api('/shared'))
      eq('ya no te debe nada', sh2.por_cobrar_usd, 0)
      eq('condonado este mes: $3', sh2.condonado_mes_usd, 3)

      eq('condonar algo ya cerrado → 400', (await api('/shared/waive', { method: 'POST', body: JSON.stringify({
        split_ids: [carlos.splits[0].id] }) })).status, 400)
    }

    section('SPRINT 2 · deshacer')
    {
      const sh = await json(await api('/shared'))
      const cobrado = sh.historial.find(x => x.state === 'cobrado' && x.person.id === ana.id)

      const saldoAntes = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance

      const r = await api('/shared/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [cobrado.id], delete_transaction: true }) })
      const body = await json(r)
      eq('reabre la deuda', body.reopened, 1)
      eq('y borra el movimiento del cobro', body.deleted_transactions, 1)

      const saldoDespues = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('el saldo devuelve exactamente los $3 del cobro', round2(saldoAntes - saldoDespues), 3)

      const sh2 = await json(await api('/shared'))
      eq('Ana vuelve a deber $3', sh2.por_cobrar_usd, 3)

      // Borrar el movimiento del cobro directamente también reabre la deuda:
      // es el `on delete set null` visto desde la API.
      const shJuan = await json(await api('/shared'))
      const cobradoJuan = shJuan.historial.find(x => x.state === 'cobrado')
      await api(`/transactions/${cobradoJuan.settled_tx_id}`, { method: 'DELETE' })
      const sh3 = await json(await api('/shared'))
      ok('borrar el movimiento del cobro reabre la deuda sola',
         sh3.por_cobrar_usd > sh2.por_cobrar_usd, `${sh2.por_cobrar_usd} → ${sh3.por_cobrar_usd}`)
    }

    section('SPRINT 2 · PATCH del reparto')
    {
      eq('sin `splits` en el body el reparto queda intacto',
         (await json(await api(`/transactions/${spotify.id}`, {
           method: 'PATCH', body: JSON.stringify({ description: 'Spotify familiar' }),
         }))).transaction.splits.length, 3)

      // Regla CAMBIADA en el Sprint 3: bajar el gasto por debajo de lo repartido
      // es válido — pasás a cobrar por encima del costo. Se restaura el monto
      // para no alterar los totales de las secciones siguientes.
      const bajar = await api(`/transactions/${spotify.id}`, {
        method: 'PATCH', body: JSON.stringify({ amount: 5 }) })
      eq('bajar el monto por debajo del reparto ya no se rechaza', bajar.status, 200)
      await api(`/transactions/${spotify.id}`, { method: 'PATCH', body: JSON.stringify({ amount: 11.99 }) })

      const reemplazo = await api(`/transactions/${spotify.id}`, {
        method: 'PATCH', body: JSON.stringify({ splits: [{ person_id: ana.id, amount: 3 }, { person_id: juan.id, amount: 5 }] }) })
      const tras = (await json(reemplazo)).transaction
      eq('reemplaza el reparto entero', tras.splits.length, 2)
      eq('actualizando el que cambió de monto',
         Number(tras.splits.find(x => x.person_id === juan.id).amount), 5)

      const cambiarTipo = await api(`/transactions/${spotify.id}`, {
        method: 'PATCH', body: JSON.stringify({ type: 'ingreso' }) })
      eq('no se puede cambiar de tipo con reparto → 400', cambiarTipo.status, 400)
    }

    section('SPRINT 2 · borrar un gasto compartido')
    {
      // Con una parte cobrada, no se puede.
      const sh = await json(await api('/shared'))
      const deAna = sh.por_persona.find(p => p.person.id === ana.id)
      await api('/shared/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deAna.splits[0].id], account_id: airtm.id, amount: 3 }) })

      const bloqueado = await api(`/transactions/${spotify.id}`, { method: 'DELETE' })
      eq('con una parte cobrada → 409', bloqueado.status, 409)
      ok('y el mensaje explica qué hacer', (await json(bloqueado)).error.includes('Deshac'))

      const sh2 = await json(await api('/shared'))
      const cobrado = sh2.historial.find(x => x.state === 'cobrado')
      await api('/shared/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [cobrado.id], delete_transaction: true }) })

      const antes = await json(await api('/shared'))
      const deudaSpotify = antes.por_persona
        .flatMap(p => p.splits)
        .filter(x => x.transaction.id === spotify.id)
        .reduce((n, x) => n + x.amount_usd, 0)

      eq('sin cobros, borra el gasto y su reparto',
         (await api(`/transactions/${spotify.id}`, { method: 'DELETE' })).status, 200)

      const despues = await json(await api('/shared'))
      eq('desaparecen las deudas de ESE gasto',
         round2(antes.por_cobrar_usd - despues.por_cobrar_usd), round2(deudaSpotify))
      eq('y ninguna queda apuntando al gasto borrado',
         despues.por_persona.flatMap(p => p.splits).filter(x => x.transaction.id === spotify.id).length, 0)
    }

    section('SPRINT 2 · personas · PATCH y DELETE')
    {
      eq('renombrar', (await api(`/people/${ana.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: 'Ana María' }) })).status, 200)
      eq('nombre en blanco → 400', (await api(`/people/${ana.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: '  ' }) })).status, 400)
      eq('una persona que no existe → 404', (await api('/people/00000000-0000-0000-0000-000000000009', {
        method: 'PATCH', body: JSON.stringify({ name: 'X' }) })).status, 404)

      // Juan es el que conserva historial: su parte de "Cena" sigue viva. Los
      // repartos de Ana se borraron junto con Spotify.
      const conHistorial = await api(`/people/${juan.id}`, { method: 'DELETE' })
      eq('con historial de repartos → 409', conHistorial.status, 409)
      ok('sugiriendo archivar', ((await json(conHistorial))?.error ?? '').includes('Archival'))

      eq('archivar sí se puede', (await api(`/people/${juan.id}`, {
        method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200)

      const limpia = (await json(await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Sin historial' }) }))).person
      eq('sin historial se borra', (await api(`/people/${limpia.id}`, { method: 'DELETE' })).status, 200)
    }

    section('SPRINT 2 · autenticación de las rutas nuevas')
    {
      for (const [label, path, init] of [
        ['GET /people', '/people', {}],
        ['POST /people', '/people', { method: 'POST', body: '{}' }],
        ['GET /shared', '/shared', {}],
        ['POST /shared/settle', '/shared/settle', { method: 'POST', body: '{}' }],
        ['POST /shared/waive', '/shared/waive', { method: 'POST', body: '{}' }],
        ['POST /shared/unsettle', '/shared/unsettle', { method: 'POST', body: '{}' }],
      ]) {
        const r = await fetch(`${BASE}/api/finanzas${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
        eq(`${label} sin cookie → 401`, r.status, 401)
      }
    }

    section('GET /bootstrap · un viaje en vez de seis')
    {
      const anon = await fetch(`${BASE}/api/finanzas/bootstrap`)
      eq('sin cookie → 401', anon.status, 401)

      const RANGE = 'from=2026-08-01&to=2026-08-31'
      const b = await json(await api(`/bootstrap?${RANGE}&limit=500&recent=3`))

      // Lo que importa no es el contenido —cada ruta suelta ya tiene sus
      // pruebas— sino que sea EXACTAMENTE el mismo. Si las dos vías se separan,
      // la app muestra una cosa al abrir y otra al navegar.
      const [acc, cat, ppl, shr, txm] = await Promise.all([
        json(await api('/accounts')),
        json(await api('/categories')),
        json(await api('/people')),
        json(await api(`/shared?${RANGE}`)),
        json(await api(`/transactions?${RANGE}&limit=500`)),
      ])

      eq('el uid es el del usuario', b.uid, USER_ID)
      eq('cuentas idénticas a GET /accounts', b.accounts, acc.accounts)
      eq('patrimonio idéntico', b.total_usd, acc.total_usd)
      eq('tasas idénticas', b.rates, acc.rates)
      eq('rate_list idéntico', b.rate_list, acc.rate_list)
      eq('categorías idénticas a GET /categories', b.categories, cat.categories)
      eq('personas idénticas a GET /people', b.people, ppl.people)
      eq('compartidos idénticos a GET /shared', b.shared, shr)
      eq('el mes idéntico a GET /transactions', b.tx.month, txm)

      ok('los últimos respetan el limit', b.tx.recent.transactions.length <= 3,
         `llegaron ${b.tx.recent.transactions.length}`)
      ok('y vienen del más nuevo al más viejo',
         b.tx.recent.transactions.every((t, i, a) => i === 0 || a[i - 1].date >= t.date))

      // El mes lo fija el cliente, no el reloj UTC del servidor.
      const otro = await json(await api('/bootstrap?from=2026-01-01&to=2026-01-31'))
      eq('otro rango filtra el mes', otro.tx.month.transactions.length, 0)
      eq('pero las cuentas son las mismas', otro.total_usd, acc.total_usd)
    }


    /* ══════════════════════════════════════════════════════════════════════
       SPRINT 3 · Fijos
       ══════════════════════════════════════════════════════════════════════ */

    section('SPRINT 3 · repartir por encima del gasto')
    {
      const tx = (await json(await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-20', account_id: airtm.id, amount: 11.99, description: 'Margen',
        splits: [{ person_id: ana.id, amount: 4.5 }, { person_id: juan.id, amount: 4.5 }],
      })}))).transaction
      eq('cobrar más que el costo ya no se rechaza', tx.splits.length, 2)

      const lista = await json(await api('/transactions?from=2026-08-20&to=2026-08-20'))
      eq('el bruto es lo que pagaste', lista.total_gasto_usd, 11.99)
      eq('lo repartido puede superarlo', lista.total_repartido_usd, 9)
      eq('y el real baja en consecuencia', lista.total_gasto_real_usd, 2.99)

      // Y hasta puede dar negativo: eso es ganancia.
      await api(`/transactions/${tx.id}`, { method: 'PATCH', body: JSON.stringify({
        splits: [{ person_id: ana.id, amount: 7 }, { person_id: juan.id, amount: 7 }] }) })
      const conGanancia = await json(await api('/transactions?from=2026-08-20&to=2026-08-20'))
      eq('el gasto real da negativo: ganaste', conGanancia.total_gasto_real_usd, -2.01)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
    }

    section('SPRINT 3 · POST /recurring')
    let spotifyFijo
    {
      eq('sin nombre → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ amount: 5, account_id: airtm.id }) })).status, 400)
      eq('sin cuenta → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5 }) })).status, 400)
      eq('monto cero → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 0, account_id: airtm.id }) })).status, 400)
      eq('día 45 → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5, account_id: airtm.id, day_of_month: 45 }) })).status, 400)
      eq('anual sin mes → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5, account_id: airtm.id, frequency: 'anual' }) })).status, 400)
      eq('cuenta que no existe → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5, account_id: '00000000-0000-0000-0000-000000000009' }) })).status, 400)

      const r = await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Spotify', emoji: '📱', amount: 11.99, account_id: airtm.id,
        frequency: 'mensual', day_of_month: 5,
        // `amount: null` = parte pareja, se recalcula con el precio de cada mes.
        splits: [{ person_id: ana.id, amount: null }, { person_id: juan.id, amount: null }],
      })})
      eq('crea la plantilla', r.status, 201)
      spotifyFijo = (await json(r)).recurring

      const lista = await json(await api('/recurring'))
      const mio = lista.recurring.find(x => x.id === spotifyFijo.id)
      eq('con sus dos partes', mio.splits.length, 2)
      eq('las dos parejas', mio.splits.every(sp => sp.amount === null), true)
      eq('la moneda sale de la cuenta', mio.currency, 'USD')
      ok('y trae su estado del período', ['pendiente', 'vencido', 'registrado'].includes(mio.status), mio.status)
      eq('nada registrado todavía', lista.done, 0)
    }

    section('SPRINT 3 · registrar el período')
    {
      const antes = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance

      const r = await api(`/recurring/${spotifyFijo.id}/register`, { method: 'POST', body: JSON.stringify({}) })
      eq('registra', r.status, 201)
      const tx = (await json(r)).transaction

      eq('como gasto de consumo', `${tx.type}·${tx.flow_type}`, 'gasto·consumo')
      eq('apuntando a su plantilla', tx.recurring_id, spotifyFijo.id)
      eq('con la descripción del fijo', tx.description, 'Spotify')
      eq('y genera las dos deudas', tx.splits.length, 2)
      eq('$11.99 entre 3 → $3.99 cada uno', tx.splits.map(sp => Number(sp.amount)), [3.99, 3.99])

      const despues = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('el saldo baja el bruto', round2(antes - despues), 11.99)

      const lista = await json(await api('/recurring'))
      const mio = lista.recurring.find(x => x.id === spotifyFijo.id)
      eq('la plantilla queda registrada', mio.status, 'registrado')
      eq('con el movimiento enlazado', mio.registered_tx_id, tx.id)
      eq('y sabe cuánto te deben de este fijo', mio.open_usd, 7.98)
      eq('el progreso lo cuenta', lista.done, 1)

      // Idempotencia: dos toques al botón no son dos gastos.
      const otra = await api(`/recurring/${spotifyFijo.id}/register`, { method: 'POST', body: JSON.stringify({}) })
      eq('registrar dos veces el mismo período → 409', otra.status, 409)
      ok('diciendo cuál ya está', (await json(otra)).error.includes('Spotify'))
    }

    section('SPRINT 3 · la fecha por defecto es la del período, no hoy')
    {
      const lista = await json(await api('/recurring'))
      const mio = lista.recurring.find(x => x.id === spotifyFijo.id)
      const tx = (await json(await api(`/transactions?from=${mio.due}&to=${mio.due}`))).transactions
        .find(t => t.recurring_id === spotifyFijo.id)
      ok('el gasto cayó el día que le tocaba, no el de hoy', !!tx, `esperaba uno en ${mio.due}`)
    }

    section('SPRINT 3 · el precio sube')
    {
      // Otro fijo para no ensuciar el de arriba, y en un período limpio.
      const tv = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'TradingView', amount: 29.95, account_id: airtm.id, day_of_month: 12,
        splits: [{ person_id: ana.id, amount: null }],
      })}))).recurring

      const r = await api(`/recurring/${tv.id}/register`, { method: 'POST', body: JSON.stringify({
        amount: 34.95, update_template: true }) })
      const tx = (await json(r)).transaction
      eq('el monto del mes manda', Number(tx.amount), 34.95)
      eq('y la parte pareja se recalcula con ÉL', Number(tx.splits[0].amount), 17.47)

      const lista = await json(await api('/recurring'))
      eq('la plantilla se actualizó porque se pidió',
         Number(lista.recurring.find(x => x.id === tv.id).amount), 34.95)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' }).catch(() => {})
    }

    section('SPRINT 3 · PATCH y pausa')
    {
      eq('renombrar', (await api(`/recurring/${spotifyFijo.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: 'Spotify Familiar' }) })).status, 200)

      eq('sin `splits` el reparto queda intacto',
         (await json(await api('/recurring'))).recurring.find(x => x.id === spotifyFijo.id).splits.length, 2)

      await api(`/recurring/${spotifyFijo.id}`, { method: 'PATCH', body: JSON.stringify({
        splits: [{ person_id: ana.id, amount: 5 }] }) })
      const tras = (await json(await api('/recurring'))).recurring.find(x => x.id === spotifyFijo.id)
      eq('mandarlo lo reemplaza entero', tras.splits.length, 1)
      eq('con el monto fijo que se pidió', Number(tras.splits[0].amount), 5)

      await api(`/recurring/${spotifyFijo.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
      const pausado = (await json(await api('/recurring'))).recurring.find(x => x.id === spotifyFijo.id)
      eq('pausado deja de reclamar', pausado.status, 'pausado')

      eq('un fijo que no existe → 404', (await api('/recurring/00000000-0000-0000-0000-000000000009', {
        method: 'PATCH', body: JSON.stringify({ name: 'X' }) })).status, 404)
      eq('registrar uno que no existe → 404', (await api('/recurring/00000000-0000-0000-0000-000000000009/register', {
        method: 'POST', body: JSON.stringify({}) })).status, 404)
    }

    section('SPRINT 3 · borrar la plantilla no borra la historia')
    {
      const antes = (await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))).transactions
        .filter(t => t.recurring_id === spotifyFijo.id).length
      ok('hay al menos un gasto generado por el fijo', antes > 0)

      eq('borra', (await api(`/recurring/${spotifyFijo.id}`, { method: 'DELETE' })).status, 200)

      const despues = (await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))).transactions
      ok('los gastos siguen ahí', despues.some(t => t.description?.includes('Spotify')))
      eq('pero sin vínculo', despues.filter(t => t.recurring_id === spotifyFijo.id).length, 0)
    }

    section('SPRINT 3 · autenticación de las rutas nuevas')
    {
      for (const [label, path, init] of [
        ['GET /recurring', '/recurring', {}],
        ['POST /recurring', '/recurring', { method: 'POST', body: '{}' }],
        ['POST /recurring/[id]/register', '/recurring/x/register', { method: 'POST', body: '{}' }],
      ]) {
        const r = await fetch(`${BASE}/api/finanzas${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
        eq(`${label} sin cookie → 401`, r.status, 401)
      }
    }

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
