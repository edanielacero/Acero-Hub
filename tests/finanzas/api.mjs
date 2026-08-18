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
