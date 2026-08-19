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

    section('Feature 11 · cuentas de inversión (is_investment)')
    {
      eq('una cuenta común nace sin marcar', airtm.is_investment, false)

      const ibkr = (await json(await api('/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'IBKR', currency: 'USD', initial_balance: 0, is_investment: true }),
      }))).account
      eq('se puede crear ya marcada como inversión', ibkr.is_investment, true)

      // Medido como delta, no contra un número fijo — mismo criterio que la
      // sección de transferencias: cualquier gasto/ingreso previo en el mes
      // cambia la base, y la propiedad real es "no se movió", no un valor.
      const totalesAntes = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))

      const perdida = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: ibkr.id, amount: 200 }),
      }))).transaction
      eq('un gasto en cuenta de inversión nace movimiento', perdida.flow_type, 'movimiento')

      const ganancia = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'ingreso', date: '2026-08-18', account_id: ibkr.id, amount: 340 }),
      }))).transaction
      eq('un ingreso en cuenta de inversión nace movimiento', ganancia.flow_type, 'movimiento')

      const conIbkr = await json(await api('/accounts'))
      eq('el saldo SÍ se mueve con esos movimientos: 0 −200 +340',
         conIbkr.accounts.find(a => a.id === ibkr.id).balance, 140)

      const totalesDespues = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('pero el gasto de inversión no sube el gasto del mes',
         totalesDespues.total_gasto_usd, totalesAntes.total_gasto_usd)
      eq('ni el ingreso de inversión sube el ingreso del mes',
         totalesDespues.total_ingreso_usd, totalesAntes.total_ingreso_usd)

      // Mover un gasto normal HACIA una cuenta de inversión lo sube a movimiento.
      const reasignable = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: 15 }),
      }))).transaction
      eq('nace consumo en una cuenta normal', reasignable.flow_type, 'consumo')

      const movido = (await json(await api(`/transactions/${reasignable.id}`, {
        method: 'PATCH', body: JSON.stringify({ account_id: ibkr.id }),
      }))).transaction
      eq('editar la cuenta hacia inversión sube el movimiento', movido.flow_type, 'movimiento')

      // Y el caso que importa: sacarlo de la cuenta de inversión NO lo vuelve a
      // bajar. `flowTypeOnEdit` nunca degrada un `'movimiento'` ya asentado —
      // el endpoint no tiene forma de saber si ese `'movimiento'` sigue
      // debiéndose a la cuenta o a otra razón (p. ej. un cobro de deuda editado
      // acá mismo), así que bajarlo sería adivinar. Mismo criterio que ya regía
      // para una transferencia que cambia de tipo.
      const devuelto = (await json(await api(`/transactions/${reasignable.id}`, {
        method: 'PATCH', body: JSON.stringify({ account_id: airtm.id }),
      }))).transaction
      eq('sacarlo de la cuenta de inversión NO lo degrada de nuevo a consumo', devuelto.flow_type, 'movimiento')

      // Limpieza: no dejar transacciones sueltas que compliquen leer la cuenta
      // de prueba a mano si algo falla más abajo.
      await api(`/transactions/${reasignable.id}`, { method: 'DELETE' })
      await api(`/transactions/${perdida.id}`, { method: 'DELETE' })
      await api(`/transactions/${ganancia.id}`, { method: 'DELETE' })

      const offOn = await json(await api(`/accounts/${ibkr.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_investment: false }),
      }))
      eq('PATCH /accounts también puede desmarcarla', offOn.account.is_investment, false)
      await api(`/accounts/${ibkr.id}`, { method: 'PATCH', body: JSON.stringify({ is_investment: true }) })
    }

    section('PATCH /categories · icon')
    {
      const cats = (await json(await api('/categories'))).categories
      const comidaCat = cats.find(c => c.name === 'Comida')
      eq('la semilla trae icon', comidaCat.icon, 'comida')

      const cambiado = (await json(await api(`/categories/${comidaCat.id}`, {
        method: 'PATCH', body: JSON.stringify({ icon: 'cafe' }),
      }))).category
      eq('se puede cambiar el icon de una categoría existente', cambiado.icon, 'cafe')
      eq('sin tocar el nombre', cambiado.name, 'Comida')

      const vaciado = (await json(await api(`/categories/${comidaCat.id}`, {
        method: 'PATCH', body: JSON.stringify({ icon: null }),
      }))).category
      eq('y se puede dejar sin icon', vaciado.icon, null)
      await api(`/categories/${comidaCat.id}`, { method: 'PATCH', body: JSON.stringify({ icon: 'comida' }) })
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
      const r = await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Ana' }) })
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

    const saldoAhora = async () =>
      (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance

    section('SPRINT 2 · una deuda existe sin ningún gasto detrás')
    let deudaAna
    {
      const saldoPrevio = await saldoAhora()
      // El corazón del cambio del 2026-08-19: antes una deuda necesitaba un
      // gasto padre. Prestar efectivo no tiene gasto padre.
      const r = await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 20, currency: 'USD',
        concept: 'Le presté para el pasaje', incurred_on: '2026-08-05',
      })})
      eq('crea una deuda suelta', r.status, 201)
      deudaAna = (await json(r)).debt
      eq('sin gasto padre', deudaAna.transaction_id, null)
      eq('con su concepto', deudaAna.concept, 'Le presté para el pasaje')
      eq('y su conversión congelada', Number(deudaAna.amount_usd), 20)

      // Una deuda suelta NO toca el saldo: nadie pagó nada todavía.
      eq('el patrimonio no se mueve', round2(saldoPrevio - (await saldoAhora())), 0)
    }

    section('SPRINT 2 · validación del alta de deuda')
    {
      eq('sin persona → 400', (await api('/debts', { method: 'POST', body: JSON.stringify({
        amount: 10, currency: 'USD', concept: 'x' }) })).status, 400)
      eq('sin concepto → 400', (await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 10, currency: 'USD' }) })).status, 400)
      eq('monto cero → 400', (await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 0, currency: 'USD', concept: 'x' }) })).status, 400)
      eq('moneda inválida → 400', (await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 10, currency: 'EUR', concept: 'x' }) })).status, 400)

      // Persona al vuelo, igual que en el resto de la app.
      const conNombre = await api('/debts', { method: 'POST', body: JSON.stringify({
        person_name: 'Carlos', amount: 5, currency: 'USD', concept: 'Café' }) })
      eq('crea la persona al vuelo', conNombre.status, 201)
      ok('y ahora existe', (await json(await api('/people'))).people.some(p => p.name === 'Carlos'))
      await api(`/debts/${(await json(conNombre)).debt.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · un movimiento ya NO sabe crear deudas')
    {
      // Se sacó el toggle "Es compartido": un gasto es un gasto. Mandar
      // `splits` ahora se ignora en vez de crear nada.
      const r = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-06', account_id: airtm.id, amount: 10, description: 'Suelto',
        splits: [{ person_id: ana.id, amount: 5 }],
      })})
      eq('el gasto se crea igual', r.status, 201)
      const creado = (await json(r)).transaction
      eq('pero sin deudas', creado.debts.length, 0)
      await api(`/transactions/${creado.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · GET /debts')
    {
      const sh = await json(await api('/debts'))
      eq('te deben $20', sh.por_cobrar_usd, 20)
      eq('una sola persona', sh.por_persona.length, 1)
      eq('con su antigüedad calculada', typeof sh.por_persona[0].oldest_days, 'number')
      eq('nada cobrado todavía', sh.cobrado_mes_usd, 0)
    }

    section('SPRINT 2 · editar y borrar una deuda')
    {
      const p = await api(`/debts/${deudaAna.id}`, { method: 'PATCH', body: JSON.stringify({ amount: 25 }) })
      eq('cambiar el monto', p.status, 200)
      eq('recalcula el USD con su propia tasa', Number((await json(p)).debt.amount_usd), 25)

      eq('vaciar el concepto de una suelta → 400', (await api(`/debts/${deudaAna.id}`, {
        method: 'PATCH', body: JSON.stringify({ concept: '  ' }) })).status, 400)

      const temp = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 3, currency: 'USD', concept: 'Temporal' }) }))).debt
      eq('se borra', (await api(`/debts/${temp.id}`, { method: 'DELETE' })).status, 200)
      eq('y desaparece del total', (await json(await api('/debts'))).por_cobrar_usd, 25)
    }

    section('SPRINT 2 · cobrar')
    {
      const saldoAntes = await saldoAhora()

      const r = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deudaAna.id], account_id: airtm.id, amount: 25, date: '2026-08-18',
      })})
      eq('registra el cobro', r.status, 201)
      const tx = (await json(r)).transaction
      eq('como ingreso', tx.type, 'ingreso')
      eq('pero marcado como movimiento', tx.flow_type, 'movimiento')

      eq('el saldo sube', round2((await saldoAhora()) - saldoAntes), 25)

      // La prueba que define la feature: cobrar no es ganar.
      const lista = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el ingreso del mes NO se mueve', lista.total_ingreso_usd, 28.69)

      const sh = await json(await api('/debts'))
      eq('ya no te deben nada', sh.por_cobrar_usd, 0)
      eq('cobrado este mes: $25', sh.cobrado_mes_usd, 25)
      eq('y entra al historial', sh.historial.length, 1)

      eq('editar una deuda ya cobrada → 409', (await api(`/debts/${deudaAna.id}`, {
        method: 'PATCH', body: JSON.stringify({ amount: 5 }) })).status, 409)
      eq('borrarla también → 409', (await api(`/debts/${deudaAna.id}`, { method: 'DELETE' })).status, 409)
    }

    section('SPRINT 2 · cobrar · errores')
    {
      eq('sin deudas → 400', (await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [], account_id: airtm.id, amount: 3 }) })).status, 400)
      eq('sin cuenta → 400', (await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deudaAna.id], amount: 3 }) })).status, 400)
      eq('una deuda que no existe → 404', (await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: ['00000000-0000-0000-0000-000000000009'], account_id: airtm.id, amount: 3 }) })).status, 404)
      eq('una ya cobrada → 400', (await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deudaAna.id], account_id: airtm.id, amount: 3 }) })).status, 400)

      const otra = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 4, currency: 'USD', concept: 'Otra' }) }))).debt
      const mezcla = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [deudaAna.id, otra.id], account_id: airtm.id, amount: 10 }) })
      eq('mezclar dos personas → 400', mezcla.status, 400)
      await api(`/debts/${otra.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · un cobro salda varias deudas')
    {
      const a = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 3, currency: 'USD', concept: 'Julio' }) }))).debt
      const b = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 4, currency: 'USD', concept: 'Agosto' }) }))).debt

      const r = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [a.id, b.id], account_id: airtm.id, amount: 7 }) })
      eq('un solo cobro las salda a las dos', (await json(r)).settled, 2)

      const ingresos = (await json(await api('/transactions?type=ingreso'))).transactions
      eq('y crea un solo movimiento', ingresos.filter(t => t.flow_type === 'movimiento').length, 2)

      // Deshacer una sola NO debe borrar el movimiento: todavía salda la otra.
      const u = await json(await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [a.id], delete_transaction: true }) }))
      eq('reabre una', u.reopened, 1)
      eq('sin borrar el movimiento que aún salda la otra', u.deleted_transactions, 0)

      await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [b.id], delete_transaction: true }) })
      await api(`/debts/${a.id}`, { method: 'DELETE' })
      await api(`/debts/${b.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · perdonar')
    {
      const d = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 6, currency: 'USD', concept: 'Se la regalo' }) }))).debt

      const r = await api('/debts/waive', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], note: 'se lo regalo' }) })
      eq('perdona', (await json(r)).waived, 1)

      const ingresos = (await json(await api('/transactions?type=ingreso'))).transactions
      eq('sin crear ningún movimiento', ingresos.filter(t => t.flow_type === 'movimiento').length, 1)

      const sh = await json(await api('/debts'))
      eq('sale de las deudas abiertas', sh.por_persona.filter(p => p.person.id === juan.id).length, 0)
      eq('perdonado este mes: $6', sh.perdonado_mes_usd, 6)

      eq('perdonar algo ya cerrado → 400', (await api('/debts/waive', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id] }) })).status, 400)

      await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({ split_ids: [d.id] }) })
      const tras = await json(await api('/debts'))
      eq('deshacer la perdón la reabre', tras.por_cobrar_usd, 6)
      await api(`/debts/${d.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · deshacer un cobro devuelve el saldo')
    {
      const d = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 9, currency: 'USD', concept: 'Para deshacer' }) }))).debt
      await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], account_id: airtm.id, amount: 9 }) })

      const antes = await saldoAhora()
      const u = await json(await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], delete_transaction: true }) }))
      eq('borra el movimiento del cobro', u.deleted_transactions, 1)

      eq('y el saldo vuelve atrás', round2(antes - (await saldoAhora())), 9)
      await api(`/debts/${d.id}`, { method: 'DELETE' })
    }


    section('SPRINT 2 · la deuda de un fijo nace el día del GASTO')
    {
      // Bug encontrado el 19/8: la deuda tomaba `current_date`, así que
      // registrar Spotify tarde la hacía parecer más nueva de lo que es y la
      // lista de Deudas quedaba mal ordenada.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Fecha', amount: 12, account_id: airtm.id, day_of_month: 5,
        splits: [{ person_id: ana.id, amount: null }] }) }))).recurring

      const tx = (await json(await api(`/recurring/${t.id}/register`, {
        method: 'POST', body: JSON.stringify({}) }))).transaction

      eq('la deuda hereda la fecha del gasto', tx.debts[0].incurred_on, tx.date)
      ok('que no es hoy', tx.date !== new Date().toISOString().slice(0, 10),
         `el gasto cayó ${tx.date}`)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${t.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · el error nombra la deuda, tenga gasto o no')
    {
      const d = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 10, currency: 'USD', concept: 'Le presté para el taxi' }) }))).debt
      await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], account_id: airtm.id, amount: 10 }) })

      const otra = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], account_id: airtm.id, amount: 10 }) })
      const msg = (await json(otra)).error
      ok('usa el concepto de la deuda suelta', msg.includes('taxi'), msg)
      ok('y no habla de un gasto que no existe', !msg.includes('ese gasto'), msg)

      await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [d.id], delete_transaction: true }) })
      await api(`/debts/${d.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · personas · PATCH y DELETE')
    {
      eq('renombrar', (await api(`/people/${ana.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: 'Ana María' }) })).status, 200)
      eq('nombre en blanco → 400', (await api(`/people/${ana.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: '  ' }) })).status, 400)
      eq('una persona que no existe → 404', (await api('/people/00000000-0000-0000-0000-000000000009', {
        method: 'PATCH', body: JSON.stringify({ name: 'X' }) })).status, 404)

      // Se le deja una deuda viva a propósito: el 409 es justamente "esta
      // persona tiene historial".
      await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 2, currency: 'USD', concept: 'Historial' }) })

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
        ['GET /shared', '/debts', {}],
        ['POST /shared/settle', '/debts/settle', { method: 'POST', body: '{}' }],
        ['POST /shared/waive', '/debts/waive', { method: 'POST', body: '{}' }],
        ['POST /shared/unsettle', '/debts/unsettle', { method: 'POST', body: '{}' }],
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
        json(await api(`/debts?${RANGE}`)),
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

    section('SPRINT 3 · cobrar por encima del costo, desde un fijo')
    {
      // Con el toggle fuera del quick-add, el margen vive donde tiene sentido:
      // en el fijo compartido. Le cobrás a cada uno un poco más que su parte.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Margen', amount: 10, account_id: airtm.id, day_of_month: 3,
        splits: [{ person_id: ana.id, amount: 8 }, { person_id: juan.id, amount: 8 }],
      })}))).recurring

      const tx = (await json(await api(`/recurring/${t.id}/register`, {
        method: 'POST', body: JSON.stringify({}) }))).transaction

      eq('el reparto puede superar al gasto', tx.debts.map(d => Number(d.amount)), [8, 8])
      eq('el gasto sigue siendo lo que pagaste', Number(tx.amount), 10)

      const mia = Number(tx.amount) - tx.debts.reduce((n, d) => n + Number(d.amount), 0)
      eq('y tu parte queda negativa: ganaste', round2(mia), -6)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${t.id}`, { method: 'DELETE' })
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
        name: 'Spotify', icon: 'suscripciones', amount: 11.99, account_id: airtm.id,
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
      eq('y genera las dos deudas', tx.debts.length, 2)
      eq('$11.99 entre 3 → $3.99 cada uno', tx.debts.map(sp => Number(sp.amount)), [3.99, 3.99])

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
      eq('y la parte pareja se recalcula con ÉL', Number(tx.debts[0].amount), 17.47)

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


    section('SPRINT 3 · errores legibles y sin pérdida de datos')
    {
      // Personas propias de esta sección: `ana` y `juan` ya fueron renombradas
      // y archivadas por las pruebas del Sprint 2, y el cruce por nombre
      // depende justamente del nombre vigente.
      const pepe = (await json(await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Pepe' }) }))).person
      const lola = (await json(await api('/people', { method: 'POST', body: JSON.stringify({ name: 'Lola' }) }))).person

      const dup = await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Dup', amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: null }, { person_id: pepe.id, amount: null }] }) })
      eq('la misma persona dos veces en la plantilla → 400', dup.status, 400)
      ok('con un mensaje legible, no el de Postgres',
         !(await json(dup)).error.includes('constraint'))

      const cruzado = await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Dup2', amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: null }, { person_name: 'pepe', amount: null }] }) })
      eq('por id y por nombre, la misma → 400', cruzado.status, 400)

      eq('una parte en cero → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Cero', amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: 0 }] }) })).status, 400)

      eq('y ninguno de esos intentos dejó una plantilla colgada',
         (await json(await api('/recurring'))).recurring.filter(x => x.name.startsWith('Dup') || x.name === 'Cero').length, 0)

      // El bug caro: un PATCH inválido borraba el reparto y DESPUÉS fallaba.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Intacto', amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: null }] }) }))).recurring

      const malo = await api(`/recurring/${t.id}`, { method: 'PATCH', body: JSON.stringify({
        splits: [{ person_id: lola.id, amount: null }, { person_id: lola.id, amount: null }] }) })
      eq('un PATCH con persona repetida → 400', malo.status, 400)

      const tras = (await json(await api('/recurring'))).recurring.find(x => x.id === t.id)
      eq('y el reparto sobrevive intacto', tras.splits.length, 1)
      eq('con la persona original', tras.splits[0].person_id, pepe.id)

      await api(`/recurring/${t.id}`, { method: 'DELETE' })
    }

    section('SPRINT 3 · desde cuándo corre un fijo')
    {
      // Empieza el mes que viene: no reclama nada todavía.
      const futuro = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Futuro', amount: 5, account_id: airtm.id, day_of_month: 5,
        starts_on: '2026-12-01' }) }))).recurring
      const f = (await json(await api('/recurring'))).recurring.find(x => x.id === futuro.id)
      eq('queda programado', f.status, 'programado')
      eq('sin nada pendiente', f.pending.length, 0)

      // Cargado tarde: hay meses que recuperar, del más viejo al más nuevo.
      const viejo = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Atrasado', amount: 7, account_id: airtm.id, day_of_month: 5,
        starts_on: '2026-06-01' }) }))).recurring
      const v = (await json(await api('/recurring'))).recurring.find(x => x.id === viejo.id)
      eq('tres meses sin registrar', v.pending.length, 3)
      eq('y propone el más viejo', v.due, '2026-06-05')

      // Registrar el más viejo deja los otros dos.
      const tx = (await json(await api(`/recurring/${viejo.id}/register`, {
        method: 'POST', body: JSON.stringify({ date: '2026-06-05' }) }))).transaction
      eq('el gasto cae en junio', tx.date, '2026-06-05')

      const v2 = (await json(await api('/recurring'))).recurring.find(x => x.id === viejo.id)
      eq('quedan dos', v2.pending.length, 2)
      eq('y ahora propone julio', v2.due, '2026-07-05')

      // Idempotencia por PERÍODO PEDIDO, no por el de hoy: sin esto, junio se
      // podía registrar dos veces estando en agosto.
      eq('junio no se puede registrar de nuevo', (await api(`/recurring/${viejo.id}/register`, {
        method: 'POST', body: JSON.stringify({ date: '2026-06-20' }) })).status, 409)
      eq('pero julio sí', (await api(`/recurring/${viejo.id}/register`, {
        method: 'POST', body: JSON.stringify({ date: '2026-07-05' }) })).status, 201)

      const v3 = (await json(await api('/recurring'))).recurring.find(x => x.id === viejo.id)
      eq('queda solo agosto', v3.pending.length, 1)

      for (const t of (await json(await api('/transactions?from=2026-06-01&to=2026-07-31'))).transactions) {
        await api(`/transactions/${t.id}`, { method: 'DELETE' })
      }
      await api(`/recurring/${viejo.id}`, { method: 'DELETE' })
      await api(`/recurring/${futuro.id}`, { method: 'DELETE' })
    }

    section('SPRINT 2 · cambiar la moneda de una deuda')
    {
      const d = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 100, currency: 'USD', concept: 'Moneda' }) }))).debt
      eq('nace en USD', Number(d.amount_usd), 100)

      const r = await api(`/debts/${d.id}`, { method: 'PATCH', body: JSON.stringify({
        amount: 348, currency: 'BOB' }) })
      eq('se puede pasar a Bs', r.status, 200)
      const tras = (await json(r)).debt
      eq('con la moneda nueva', tras.currency, 'BOB')
      eq('y la conversión rehecha a la tasa de hoy', Number(tras.amount_usd), 50)

      // Una deuda que vino de un gasto no: su moneda es la del gasto.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'ConGasto', amount: 12, account_id: airtm.id, day_of_month: 9,
        splits: [{ person_id: ana.id, amount: null }] }) }))).recurring
      const tx = (await json(await api(`/recurring/${t.id}/register`, {
        method: 'POST', body: JSON.stringify({}) }))).transaction

      const bloqueado = await api(`/debts/${tx.debts[0].id}`, {
        method: 'PATCH', body: JSON.stringify({ currency: 'BOB' }) })
      eq('la de un gasto no cambia de moneda → 400', bloqueado.status, 400)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${t.id}`, { method: 'DELETE' })
      await api(`/debts/${d.id}`, { method: 'DELETE' })
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

    section('SPRINT 4 · POST /debt-plans · no hay plan sin deuda primero')
    let planManual, deudaManual
    {
      // Sin deuda, no hay nada que planificar.
      deudaManual = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 250, currency: 'USD', concept: 'Préstamo en cuotas', incurred_on: '2026-08-05',
      })}))).debt

      const r = await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaManual.id, installments: 3, starts_on: '2026-09-05', mode: 'manual',
        cuotas: [
          { amount: 100, incurred_on: '2026-09-05' },
          { amount: 100, incurred_on: '2026-10-05' },
          { amount: 50, incurred_on: '2026-11-05' },
        ],
      })})
      eq('crea el plan a partir de la deuda', r.status, 201)
      planManual = (await json(r)).plan
      eq('sin gasto padre en ninguna cuota', planManual.cuotas.every(c => c.transaction_id === null), true)
      eq('la última cuota tiene el monto que se tipeó a mano', Number(planManual.cuotas[2].amount), 50)
      eq('la suma da exactamente el capital de la deuda original',
         round2(planManual.cuotas.reduce((s, c) => s + Number(c.amount), 0)), 250)

      const original = await api(`/debts/${deudaManual.id}`, { method: 'PATCH', body: '{}' })
      eq('la deuda original desaparece: la reemplazan sus cuotas', original.status, 404)
    }

    section('SPRINT 4 · POST /debt-plans · validación')
    {
      eq('sin debt_id → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        installments: 1, starts_on: '2026-09-05' }) })).status, 400)
      eq('una deuda que no existe → 404', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: '00000000-0000-0000-0000-000000000009', installments: 1, starts_on: '2026-09-05' }) })).status, 404)

      const deudaValidacion = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 100, currency: 'USD', concept: 'Para validar', incurred_on: '2026-08-05',
      })}))).debt

      eq('cero cuotas → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaValidacion.id, installments: 0, starts_on: '2026-09-05' }) })).status, 400)
      eq('interés negativo → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaValidacion.id, installments: 1, starts_on: '2026-09-05', interest_rate: -1 }) })).status, 400)
      eq('manual con menos cuotas de las prometidas → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaValidacion.id, installments: 3, starts_on: '2026-09-05',
        mode: 'manual', cuotas: [{ amount: 50, incurred_on: '2026-09-05' }] }) })).status, 400)

      // Una deuda que vino de un gasto compartido no es plannable: los planes
      // son para deudas sueltas.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'ConGasto', amount: 12, account_id: airtm.id, day_of_month: 9,
        splits: [{ person_id: ana.id, amount: null }] }) }))).recurring
      const tx = (await json(await api(`/recurring/${t.id}/register`, {
        method: 'POST', body: JSON.stringify({}) }))).transaction
      eq('deuda de un gasto compartido → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: tx.debts[0].id, installments: 1, starts_on: '2026-09-05' }) })).status, 400)
      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${t.id}`, { method: 'DELETE' })

      // Una cuota que ya es de un plan no puede volver a planificarse.
      const paraEncadenar = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 40, currency: 'USD', concept: 'Encadenada', incurred_on: '2026-08-05',
      })}))).debt
      const planCuota = await json(await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: paraEncadenar.id, installments: 1, starts_on: '2026-09-05', mode: 'iguales',
      })}))
      eq('una cuota de un plan no puede volver a planificarse → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: planCuota.plan.cuotas[0].id, installments: 1, starts_on: '2026-09-05' }) })).status, 400)
      await api(`/debt-plans/${planCuota.plan.id}`, { method: 'DELETE' })

      // Una deuda ya cerrada tampoco.
      const paraCerrar = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 20, currency: 'USD', concept: 'Se cierra', incurred_on: '2026-08-05',
      })}))).debt
      await api('/debts/waive', { method: 'POST', body: JSON.stringify({ split_ids: [paraCerrar.id] }) })
      eq('una deuda ya cerrada no se puede planificar → 400', (await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: paraCerrar.id, installments: 1, starts_on: '2026-09-05' }) })).status, 400)

      await api(`/debts/${deudaValidacion.id}`, { method: 'DELETE' })
    }

    section('SPRINT 4 · POST /debt-plans · modo iguales, con y sin interés')
    let planIguales
    {
      const deudaIguales = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 100, currency: 'USD', concept: 'Cien entre tres', incurred_on: '2026-08-05',
      })}))).debt
      const sinInteres = await json(await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaIguales.id, installments: 3, starts_on: '2026-09-01', mode: 'iguales',
      })}))
      planIguales = sinInteres.plan
      eq('el resto del redondeo va a la última cuota',
         planIguales.cuotas.map(c => Number(c.amount)), [33.33, 33.33, 33.34])

      const deudaInteres = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 100, currency: 'USD', concept: 'Con interés', incurred_on: '2026-08-05',
      })}))).debt
      const conInteres = await json(await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaInteres.id, interest_rate: 10, installments: 2, starts_on: '2026-09-01', mode: 'iguales',
      })}))
      eq('10% de interés en 2 cuotas: $55 cada una',
         conInteres.plan.cuotas.map(c => Number(c.amount)), [55, 55])
      await api(`/debt-plans/${conInteres.plan.id}`, { method: 'DELETE' })
    }

    section('SPRINT 4 · GET /debt-plans refleja los rollups')
    {
      const lista = await json(await api('/debt-plans'))
      const mio = lista.plans.find(p => p.id === planIguales.id)
      eq('total_usd', mio.total_usd, 100)
      eq('nada pagado todavía', mio.pagado_usd, 0)
      eq('todo pendiente', mio.pendiente_usd, 100)
      eq('no está cerrado', mio.cerrado, false)
    }

    section('SPRINT 4 · una cuota se cobra y se condona con los endpoints de Deudas — sin ningún cambio')
    {
      const cuota1 = planIguales.cuotas[0]
      const settle = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [cuota1.id], account_id: airtm.id, amount: 33.33, date: '2026-09-01',
      })})
      eq('cobrar una cuota funciona igual que cualquier deuda', settle.status, 201)

      const waive = await api('/debts/waive', { method: 'POST', body: JSON.stringify({
        split_ids: [planIguales.cuotas[1].id],
      })})
      eq('condonar también', waive.status, 200)

      const lista = await json(await api('/debt-plans'))
      const mio = lista.plans.find(p => p.id === planIguales.id)
      eq('pagado_usd sube', mio.pagado_usd, 33.33)
      eq('perdonado_usd también', mio.perdonado_usd, 33.33)
      eq('pendiente_usd baja a lo que queda', mio.pendiente_usd, 33.34)
      eq('todavía no está cerrado: falta una cuota', mio.cerrado, false)
    }

    section('SPRINT 4 · la moneda de una cuota no se cambia — es la del plan')
    {
      const cuota = planIguales.cuotas[2]
      const bloqueado = await api(`/debts/${cuota.id}`, { method: 'PATCH', body: JSON.stringify({ currency: 'BOB' }) })
      eq('rechazado', bloqueado.status, 400)
    }

    section('SPRINT 4 · DELETE /debt-plans')
    {
      // Con cuotas cobradas o perdonadas: no se borra, hay que regenerar.
      const conHistoria = await api(`/debt-plans/${planIguales.id}`, { method: 'DELETE' })
      eq('409 si ya tiene cuotas cobradas o perdonadas', conHistoria.status, 409)

      // Todo pendiente: se borra entero, plan y cuotas.
      const deudaLimpia = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 30, currency: 'USD', concept: 'Para borrar', incurred_on: '2026-08-05',
      })}))).debt
      const limpio = await json(await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaLimpia.id, installments: 1, starts_on: '2026-09-01', mode: 'iguales',
      })}))
      const del = await api(`/debt-plans/${limpio.plan.id}`, { method: 'DELETE' })
      eq('se borra si nada fue tocado', del.status, 200)
      eq('y su cuota desaparece', (await api(`/debts/${limpio.plan.cuotas[0].id}`, { method: 'PATCH', body: '{}' })).status, 404)
    }

    section('SPRINT 4 · POST /debt-plans/[id]/regenerate')
    {
      const deudaRenegociada = (await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: ana.id, amount: 90, currency: 'USD', concept: 'Renegociado', incurred_on: '2026-08-05',
      })}))).debt
      const original = await json(await api('/debt-plans', { method: 'POST', body: JSON.stringify({
        debt_id: deudaRenegociada.id, installments: 3, starts_on: '2026-09-01', mode: 'iguales',
      })}))
      const p = original.plan

      // Se cobra la primera: esa no se puede tocar al regenerar.
      await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [p.cuotas[0].id], account_id: airtm.id, amount: 30, date: '2026-09-01',
      })})

      const regen = await api(`/debt-plans/${p.id}/regenerate`, { method: 'POST', body: JSON.stringify({
        installments: 2, starts_on: '2026-10-01', mode: 'iguales',
      })})
      eq('regenera con el saldo pendiente como capital sugerido', regen.status, 200)

      const lista = await json(await api('/debt-plans'))
      const actualizado = lista.plans.find(x => x.id === p.id)
      eq('la cuota cobrada sigue estando', actualizado.cuotas.some(c => c.id === p.cuotas[0].id && c.state === 'cobrado'), true)
      eq('las 2 pendientes viejas ya no están',
         actualizado.cuotas.some(c => c.id === p.cuotas[1].id || c.id === p.cuotas[2].id), false)
      eq('ahora hay 3 cuotas en total: 1 vieja cobrada + 2 nuevas', actualizado.cuotas.length, 3)
      eq('las nuevas suman el saldo restante (60)',
         round2(actualizado.cuotas.filter(c => c.state === 'pendiente').reduce((s, c) => s + Number(c.amount), 0)), 60)

      await api(`/debt-plans/${p.id}/regenerate`, { method: 'POST', body: JSON.stringify({}) })
        .then(r => eq('regenerate sin body → 400 (falta installments/starts_on)', r.status, 400))
    }

    section('SPRINT 4 · autenticación de las rutas nuevas')
    {
      for (const [label, path, init] of [
        ['GET /debt-plans', '/debt-plans', {}],
        ['POST /debt-plans', '/debt-plans', { method: 'POST', body: '{}' }],
        ['POST /debt-plans/[id]/regenerate', '/debt-plans/x/regenerate', { method: 'POST', body: '{}' }],
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
