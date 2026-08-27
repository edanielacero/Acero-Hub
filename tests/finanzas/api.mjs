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

/**
 * Aportar a un ahorro por el único camino manual que existe desde la Ronda 8:
 * un fijo de ahorro registrado. El quick-add ya no puede — aportar es una
 * decisión de plan (fijo o cierre de mes), no el registro de algo que pasó.
 */
async function aportar({ goalId, fromId, toId, amount, date, currency = 'USD' }) {
  const fijo = (await json(await api('/recurring', {
    method: 'POST',
    body: JSON.stringify({
      name: `Aporte ${Math.random().toString(36).slice(2, 8)}`, amount, currency,
      savings_goal_id: goalId, to_account_id: toId,
      starts_on: date, day_of_month: Number(date.slice(8, 10)),
    }),
  }))).recurring
  const reg = await json(await api(`/recurring/${fijo.id}/register`, {
    method: 'POST', body: JSON.stringify({ account_id: fromId, to_account_id: toId, date }),
  }))
  return { transaction: reg?.transaction, recurring_id: fijo?.id, error: reg?.error }
}
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
    // Desde el Sprint 8 las 14 categorías ya vienen sembradas: las pone
    // `createProfile` al crear el perfil, que ocurre en el primer request que
    // pasa por `requireProfile` — o sea, antes de que este test corra. El seed
    // dejó de ser quien las crea y pasó a ser la red de seguridad que las
    // repone si faltara alguna.
    const a = await json(await api('/seed', { method: 'POST' }))
    eq('el perfil ya nació con sus categorías: no hay nada que sembrar', a.creadas, 0)
    eq('y están las 14', a.total, 14)
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
  // Todo fijo necesita categoría (§ validateRecurring). Los tests de abajo no
  // prueban nada sobre CUÁL es, así que comparten una y se concentran en lo
  // suyo; los que sí prueban la categoría la eligen a propósito.
  let catFijo
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
    // Con saldo cero el primer gasto de 35 Bs ya rebotaría por la regla dura
    // del server (§ assertBalance) — se arranca con lo justo para cubrirlo,
    // no en cero.
    efectivo = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({ name: 'Efectivo', currency: 'BOB', initial_balance: 35   }) }))).account
    ok('crea las 3 cuentas', !!airtm && !!broker && !!efectivo)

    const d = await json(await api('/accounts'))
    eq('patrimonio = 2284.03', d.total_usd, 2284.03)

    const cats = await json(await api('/categories'))
    const comida = cats.categories.find(c => c.name === 'Comida')
    catFijo = cats.categories.find(c => c.name === 'Suscripciones').id

    const gasto = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: efectivo.id, category_id: comida.id, amount: 35, description: 'Almuerzo' }),
    }))).transaction
    eq('la moneda la pone el server desde la cuenta', gasto.currency, 'BOB')
    eq('congela amount_usd = 5.03', Number(gasto.amount_usd), 5.03)
    ok('congela el factor USD-por-Bs, no la tasa invertida',
       Math.abs(Number(gasto.exchange_rate) - 1 / 6.96) < 1e-7, `obtenido ${gasto.exchange_rate}`)

    const afterGasto = await json(await api('/accounts'))
    eq('Efectivo bajó 35 Bs', afterGasto.accounts.find(a => a.id === efectivo.id).balance, 0)

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
    eq('cross-currency: Efectivo = 348 Bs', t2.accounts.find(a => a.id === efectivo.id).balance, 348)

    section('el saldo insuficiente es una regla dura del SERVER, no solo un aviso del cliente')
    {
      // Airtm está en 1149 en este punto del flujo (línea de arriba).
      const antesSaldo = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id)

      // Muy por encima de lo que hay → 400, y no crea nada.
      const rechazado = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: antesSaldo.balance + 1000 }) })
      eq('un gasto que supera el saldo → 400', rechazado.status, 400)
      ok('el error nombra la cuenta', (await json(rechazado)).error.includes(antesSaldo.name))

      const sinCambios = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('el saldo no se movió', sinCambios, antesSaldo.balance)

      // Una transferencia se mide igual: también sale de una cuenta de origen.
      const transRechazada = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: broker.id,
        amount: antesSaldo.balance + 1000 }) })
      eq('una transferencia que supera el saldo → 400', transRechazada.status, 400)

      // Un ingreso no tiene tope: nunca choca con este límite.
      const ingresoOk = await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'ingreso', date: '2026-08-18', account_id: airtm.id, amount: 999999 }) })
      eq('un ingreso nunca choca con este límite', ingresoOk.status, 201)
      await api(`/transactions/${(await json(ingresoOk)).transaction.id}`, { method: 'DELETE' })

      // Exactamente lo disponible sí entra — el límite es inclusive, no exige
      // dejar un colchón.
      const justo = (await json(await api('/transactions', { method: 'POST', body: JSON.stringify({
        type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: antesSaldo.balance }) }))).transaction
      ok('gastar EXACTO el saldo entra', !!justo?.id)
      const enCero = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('la cuenta queda en cero, no negativa', enCero, 0)

      // Editar un gasto existente hacia un monto imposible también se rechaza
      // — no es solo una validación del alta.
      const subirDeMas = await api(`/transactions/${justo.id}`, { method: 'PATCH', body: JSON.stringify({
        amount: 999999 }) })
      eq('editar un gasto hacia un monto imposible → 400', subirDeMas.status, 400)

      // Pero SÍ se puede editar ese mismo gasto hacia abajo (o dejarlo igual):
      // `availableFrom` revierte el efecto viejo antes de medir el nuevo, así
      // que esto no queda bloqueado para siempre por haber vaciado la cuenta.
      const bajarOk = await api(`/transactions/${justo.id}`, { method: 'PATCH', body: JSON.stringify({
        amount: antesSaldo.balance / 2 }) })
      eq('bajarlo sí entra', bajarOk.status, 200)

      await api(`/transactions/${justo.id}`, { method: 'DELETE' })
      const restaurado = (await json(await api('/accounts'))).accounts.find(a => a.id === airtm.id).balance
      eq('Airtm queda como estaba antes de esta sección', restaurado, antesSaldo.balance)
    }

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
    eq('el saldo refleja 70, no 35+70', bal.accounts.find(a => a.id === efectivo.id).balance, 313)

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
        body: JSON.stringify({ name: 'IBKR', currency: 'USD', initial_balance: 200, is_investment: true }),
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
      eq('el saldo SÍ se mueve con esos movimientos: 200 −200 +340',
         conIbkr.accounts.find(a => a.id === ibkr.id).balance, 340)

      const totalesDespues = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('pero el gasto de inversión no sube el gasto del mes',
         totalesDespues.total_gasto_usd, totalesAntes.total_gasto_usd)
      eq('ni el ingreso de inversión sube el ingreso del mes',
         totalesDespues.total_ingreso_usd, totalesAntes.total_ingreso_usd)

      // §7.2: una actualización de valor no es un movimiento de cuentas —
      // no aparece en la lista de Movimientos, ni siquiera aunque esté
      // dentro del rango de fechas pedido.
      const idsDespues = totalesDespues.transactions.map(t => t.id)
      eq('el gasto de inversión no aparece en la lista de Movimientos', idsDespues.includes(perdida.id), false)
      eq('el ingreso de inversión tampoco aparece en la lista de Movimientos', idsDespues.includes(ganancia.id), false)

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

      section('Feature 11.1 · "Actualizar valor" — negativo permitido, PATCH bloqueado (§7.2)')
      // Saldo de ibkr acá: 200 (inicial), sin otros movimientos vivos —
      // los de acá arriba ya se borraron.

      // Un ajuste a la baja SÍ puede dejar una cuenta de inversión en
      // negativo (una cuenta apalancada en rojo no es un error): a
      // diferencia de un gasto normal, acá el `assertBalance` no aplica.
      const bajaFuerte = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: ibkr.id, amount: 500 }),
      }))).transaction
      eq('un gasto de inversión SÍ puede dejar la cuenta en negativo', bajaFuerte.amount, 500)

      const conRojo = await json(await api('/accounts'))
      eq('el saldo queda negativo: 200 − 500', conRojo.accounts.find(a => a.id === ibkr.id).balance, -300)

      // Pero una transferencia SÍ sigue necesitando saldo real para salir,
      // inversión o no: no se puede retirar más de lo que la cuenta vale.
      const transferSinFondos = await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'transferencia', date: '2026-08-18', account_id: ibkr.id, to_account_id: airtm.id, amount: 10 }),
      })
      eq('una transferencia desde una cuenta de inversión en rojo sigue rechazada', transferSinFondos.status, 400)

      await api(`/transactions/${bajaFuerte.id}`, { method: 'DELETE' })

      // Sin ninguna actualización viva (la de recién ya se borró), el flag
      // parte en false — tanto para la de inversión como para una normal.
      const sinNada = await json(await api('/accounts'))
      eq('has_value_updates en false sin actualizaciones vivas',
         sinNada.accounts.find(a => a.id === ibkr.id).has_value_updates, false)
      eq('y siempre en false para una cuenta que nunca fue de inversión',
         sinNada.accounts.find(a => a.id === airtm.id).has_value_updates, false)

      // El toggle "Cuenta de inversión" se bloquea Sí→No una vez que ya hay
      // una actualización de valor registrada — mismo patrón que ya bloquea
      // cambiar la moneda de una cuenta con movimientos.
      const conAjuste = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'ingreso', date: '2026-08-18', account_id: ibkr.id, amount: 50 }),
      }))).transaction

      // El flag que la UI de Cuentas usa para no ofrecer el toggle: `true`
      // apenas hay una actualización de valor registrada.
      const conFlag = await json(await api('/accounts'))
      eq('has_value_updates se prende con la actualización recién cargada',
         conFlag.accounts.find(a => a.id === ibkr.id).has_value_updates, true)

      // Y tampoco aparece en Movimientos.
      const movsConAjuste = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el ingreso recién cargado tampoco aparece en Movimientos',
         movsConAjuste.transactions.map(t => t.id).includes(conAjuste.id), false)

      const bloqueado = await api(`/accounts/${ibkr.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_investment: false }),
      })
      eq('desmarcar con una actualización de valor ya cargada → 409', bloqueado.status, 409)

      const siguesInvestment = await json(await api('/accounts'))
      eq('sigue marcada como inversión', siguesInvestment.accounts.find(a => a.id === ibkr.id).is_investment, true)

      await api(`/transactions/${conAjuste.id}`, { method: 'DELETE' })

      // Borrada la única actualización, el flag vuelve a false.
      const sinFlag = await json(await api('/accounts'))
      eq('has_value_updates vuelve a false sin actualizaciones vivas',
         sinFlag.accounts.find(a => a.id === ibkr.id).has_value_updates, false)

      // Sin actualizaciones de valor, el toggle vuelve a estar libre.
      const libre = await api(`/accounts/${ibkr.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_investment: false }),
      })
      eq('sin actualizaciones de valor, desmarcarla funciona', libre.status, 200)
      await api(`/accounts/${ibkr.id}`, { method: 'PATCH', body: JSON.stringify({ is_investment: true }) })

      // Una transferencia (aporte/retiro real) no cuenta como "actualización
      // de valor" — no debería bloquear el toggle.
      const soloTransfer = (await json(await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'transferencia', date: '2026-08-18', account_id: airtm.id, to_account_id: ibkr.id, amount: 20 }),
      }))).transaction

      const libreConTransfer = await api(`/accounts/${ibkr.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_investment: false }),
      })
      eq('una cuenta que solo recibió transferencias no queda bloqueada', libreConTransfer.status, 200)
      await api(`/accounts/${ibkr.id}`, { method: 'PATCH', body: JSON.stringify({ is_investment: true }) })

      await api(`/transactions/${soloTransfer.id}`, { method: 'DELETE' })
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
        name: 'Fecha', category_id: catFijo, amount: 12, account_id: airtm.id, day_of_month: 5,
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
        name: 'Margen', category_id: catFijo, amount: 10, account_id: airtm.id, day_of_month: 3,
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

    section('SPRINT 3 · la ganancia de un margen se cuenta al COBRAR, no al crear el gasto')
    {
      // $10 pagados, $16 repartidos ($8 a Ana, $8 a Juan) → $6 de margen total,
      // repartido proporcional: cada deuda de $8 trae $5 de costo real y $3 de
      // margen (ratio 10/16 = 0.625 aplicado a cada una).
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'MargenCobro', category_id: catFijo, amount: 10, account_id: airtm.id, day_of_month: 3,
        splits: [{ person_id: ana.id, amount: 8 }, { person_id: juan.id, amount: 8 }],
      })}))).recurring

      const antes = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))

      const tx = (await json(await api(`/recurring/${t.id}/register`, {
        method: 'POST', body: JSON.stringify({}) }))).transaction

      const trasCrear = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el gasto real NO se mueve al crear el gasto — antes se hacía negativo acá mismo',
         trasCrear.total_gasto_real_usd, antes.total_gasto_real_usd)

      const anaDebt = tx.debts.find(d => d.person_id === ana.id)
      const antesIngreso = trasCrear.total_ingreso_usd

      const cobro = await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [anaDebt.id], account_id: airtm.id, amount: 8 }) })
      eq('cobra', cobro.status, 201)
      const { transaction: reembolsoTx, ganancia_transaction: gananciaTx } = await json(cobro)

      ok('separa en reembolso + ganancia', !!reembolsoTx && !!gananciaTx)
      eq('el reembolso queda como movimiento (no cuenta como ingreso)', reembolsoTx.flow_type, 'movimiento')
      eq('la ganancia queda como consumo — ingreso real', gananciaTx.flow_type, 'consumo')
      eq('reembolso: los $5 de costo real', Number(reembolsoTx.amount), 5)
      eq('ganancia: los $3 de margen', Number(gananciaTx.amount), 3)
      eq('juntos suman exacto lo cobrado', round2(Number(reembolsoTx.amount) + Number(gananciaTx.amount)), 8)

      const trasCobro = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      eq('el ingreso del mes sube SOLO por la ganancia ($3), no por el reembolso',
         round2(trasCobro.total_ingreso_usd - antesIngreso), 3)
      eq('y el gasto real sigue sin moverse: cobrar no es un gasto',
         trasCobro.total_gasto_real_usd, antes.total_gasto_real_usd)

      // Deshacer el cobro borra los DOS movimientos — uno solo dejaría al otro
      // como un ingreso real huérfano de un cobro que ya no existe.
      const deshecho = await json(await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [anaDebt.id], delete_transaction: true }) }))
      eq('deshacer borra los dos movimientos del cobro', deshecho.deleted_transactions, 2)

      const sinMargen = await json(await api('/debts', { method: 'POST', body: JSON.stringify({
        person_id: juan.id, amount: 5, currency: 'USD', concept: 'Sin margen' }) }))
      const cobroSinMargen = await json(await api('/debts/settle', { method: 'POST', body: JSON.stringify({
        split_ids: [sinMargen.debt.id], account_id: airtm.id, amount: 5 }) }))
      eq('sin margen, no hay transacción de ganancia', cobroSinMargen.ganancia_transaction, null)
      eq('y se comporta exactamente como antes: un solo movimiento', cobroSinMargen.transaction.flow_type, 'movimiento')
      await api('/debts/unsettle', { method: 'POST', body: JSON.stringify({
        split_ids: [sinMargen.debt.id], delete_transaction: true }) })

      // La de Juan (con margen) sigue abierta — borrar el gasto se la lleva
      // puesta, igual que cualquier deuda sin cobrar todavía.
      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${t.id}`, { method: 'DELETE' })
    }

    section('SPRINT 3 · POST /recurring')
    let spotifyFijo
    {
      eq('sin nombre → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ amount: 5, account_id: airtm.id }) })).status, 400)
      // Sin categoría un fijo no entra en el "comprometido" de ningún
      // presupuesto, así que es obligatoria — igual que el nombre o el monto.
      eq('sin categoría → 400',
         (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5, account_id: airtm.id }) })).status, 400)
      // `account_id` siempre se validó contra el usuario; `category_id` se
      // insertaba tal cual, así que una categoría inexistente (o de otro
      // usuario) entraba y el error salía crudo desde Postgres.
      eq('categoría inexistente en un fijo → 400',
         (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', amount: 5, account_id: airtm.id, category_id: '00000000-0000-0000-0000-000000000009' }) })).status, 400)
      eq('categoría inexistente en un movimiento → 400',
         (await api('/transactions', { method: 'POST', body: JSON.stringify({ type: 'gasto', date: '2026-08-18', account_id: airtm.id, amount: 3, category_id: '00000000-0000-0000-0000-000000000009' }) })).status, 400)
      eq('sin cuenta → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', category_id: catFijo, amount: 5 }) })).status, 400)
      eq('monto cero → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', category_id: catFijo, amount: 0, account_id: airtm.id }) })).status, 400)
      eq('día 45 → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', category_id: catFijo, amount: 5, account_id: airtm.id, day_of_month: 45 }) })).status, 400)
      eq('anual sin mes → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', category_id: catFijo, amount: 5, account_id: airtm.id, frequency: 'anual' }) })).status, 400)
      eq('cuenta que no existe → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({ name: 'X', category_id: catFijo, amount: 5, account_id: '00000000-0000-0000-0000-000000000009' }) })).status, 400)

      const r = await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Spotify', category_id: catFijo, icon: 'suscripciones', amount: 11.99, account_id: airtm.id,
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
        name: 'TradingView', category_id: catFijo, amount: 29.95, account_id: airtm.id, day_of_month: 12,
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

    section('SPRINT 3 · un fijo sin cuenta propia no se puede registrar sin elegir una')
    {
      const sinCuenta = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'SinCuenta', category_id: catFijo, amount: 20, currency: 'USD', day_of_month: 1,
      })}))).recurring
      eq('nace sin cuenta', sinCuenta.account_id, null)
      eq('pero con la moneda que se pidió', sinCuenta.currency, 'USD')

      const r = await api(`/recurring/${sinCuenta.id}/register`, { method: 'POST', body: JSON.stringify({}) })
      eq('sin account_id en el body → 400', r.status, 400)
      ok('pide la cuenta', (await json(r)).error.includes('cuenta'))

      await api(`/recurring/${sinCuenta.id}`, { method: 'DELETE' })
    }

    section('SPRINT 3 · pagar un fijo con una cuenta de otra moneda')
    {
      // El fijo queda en Bs (sin cuenta propia); se paga con una cuenta en
      // USD. La plantilla no se entera — sigue en Bs para el próximo mes —
      // pero ESTE movimiento queda en la moneda de la cuenta que se usó.
      const alquiler = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Alquiler', category_id: catFijo, amount: 500, currency: 'BOB', day_of_month: 1,
        splits: [{ person_id: ana.id, amount: null }],
      })}))).recurring

      const r = await api(`/recurring/${alquiler.id}/register`, { method: 'POST', body: JSON.stringify({
        account_id: airtm.id, amount: 71.84 }) })
      eq('registra', r.status, 201)
      const tx = (await json(r)).transaction

      eq('el movimiento queda en la moneda de la cuenta elegida', tx.currency, 'USD')
      eq('con lo que realmente salió de ahí, no una conversión automática', Number(tx.amount), 71.84)
      eq('y la deuda que genera también en esa moneda', tx.debts[0].currency, 'USD')

      const lista = await json(await api('/recurring'))
      const mio = lista.recurring.find(x => x.id === alquiler.id)
      eq('la plantilla sigue en Bs', mio.currency, 'BOB')
      eq('con el monto de siempre — nadie le pidió actualizarse', Number(mio.amount), 500)
      eq('y sigue sin cuenta propia: pagarlo una vez no se la asigna', mio.account_id, null)

      await api(`/transactions/${tx.id}`, { method: 'DELETE' })
      await api(`/recurring/${alquiler.id}`, { method: 'DELETE' })
    }

    section('SPRINT 3 · registrar un fijo por encima del saldo también choca con la regla dura')
    {
      // Es un gasto como cualquier otro (§ assertBalance): no hay una
      // excepción para fijos.
      const antesSaldo = (await json(await api('/accounts'))).accounts.find(a => a.id === broker.id)

      const caro = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Demasiado caro', category_id: catFijo, amount: antesSaldo.balance + 1000, currency: 'USD', day_of_month: 1,
      })}))).recurring

      const r = await api(`/recurring/${caro.id}/register`, { method: 'POST', body: JSON.stringify({
        account_id: broker.id }) })
      eq('registrarlo por encima del saldo → 400', r.status, 400)
      ok('el error nombra la cuenta', (await json(r)).error.includes(antesSaldo.name))

      const sinCambios = (await json(await api('/accounts'))).accounts.find(a => a.id === broker.id).balance
      eq('el saldo de Broker no se movió', sinCambios, antesSaldo.balance)

      await api(`/recurring/${caro.id}`, { method: 'DELETE' })
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
        name: 'Dup', category_id: catFijo, amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: null }, { person_id: pepe.id, amount: null }] }) })
      eq('la misma persona dos veces en la plantilla → 400', dup.status, 400)
      ok('con un mensaje legible, no el de Postgres',
         !(await json(dup)).error.includes('constraint'))

      const cruzado = await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Dup2', category_id: catFijo, amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: null }, { person_name: 'pepe', amount: null }] }) })
      eq('por id y por nombre, la misma → 400', cruzado.status, 400)

      eq('una parte en cero → 400', (await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Cero', category_id: catFijo, amount: 10, account_id: airtm.id,
        splits: [{ person_id: pepe.id, amount: 0 }] }) })).status, 400)

      eq('y ninguno de esos intentos dejó una plantilla colgada',
         (await json(await api('/recurring'))).recurring.filter(x => x.name.startsWith('Dup') || x.name === 'Cero').length, 0)

      // El bug caro: un PATCH inválido borraba el reparto y DESPUÉS fallaba.
      const t = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Intacto', category_id: catFijo, amount: 10, account_id: airtm.id,
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
        name: 'Futuro', category_id: catFijo, amount: 5, account_id: airtm.id, day_of_month: 5,
        starts_on: '2026-12-01' }) }))).recurring
      const f = (await json(await api('/recurring'))).recurring.find(x => x.id === futuro.id)
      eq('queda programado', f.status, 'programado')
      eq('sin nada pendiente', f.pending.length, 0)

      // Cargado tarde: hay meses que recuperar, del más viejo al más nuevo.
      const viejo = (await json(await api('/recurring', { method: 'POST', body: JSON.stringify({
        name: 'Atrasado', category_id: catFijo, amount: 7, account_id: airtm.id, day_of_month: 5,
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
        name: 'ConGasto', category_id: catFijo, amount: 12, account_id: airtm.id, day_of_month: 9,
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
        name: 'ConGasto', category_id: catFijo, amount: 12, account_id: airtm.id, day_of_month: 9,
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
    eq('borrar el gasto devuelve Efectivo a 383', final.accounts.find(a => a.id === efectivo.id).balance, 383)
    eq('borrar algo inexistente no rompe',
       (await api('/transactions/00000000-0000-0000-0000-000000000009', { method: 'DELETE' })).status, 200)

    section('SPRINT 5 · autenticación de las rutas nuevas')
    {
      for (const [label, path, init] of [
        ['GET /pasanaku', '/pasanaku', {}],
        ['POST /pasanaku', '/pasanaku', { method: 'POST', body: '{}' }],
        ['POST /pasanaku/[id]/aporte', '/pasanaku/x/aporte', { method: 'POST', body: '{}' }],
        ['POST /pasanaku/[id]/recibir', '/pasanaku/x/recibir', { method: 'POST', body: '{}' }],
      ]) {
        const r = await fetch(`${BASE}/api/finanzas${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
        eq(`${label} sin cookie → 401`, r.status, 401)
      }
    }

    let bs, bsInversion, pasanaku
    section('POST /accounts · cuenta en Bs para el pasanaku')
    {
      bs = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Efectivo Bs', currency: 'BOB', initial_balance: 5000,
      })}))).account
      ok('crea la cuenta', !!bs?.id)

      bsInversion = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Bs inversión', currency: 'BOB', initial_balance: 1000, is_investment: true,
      })}))).account
      ok('crea la cuenta de inversión para las pruebas de rechazo', !!bsInversion?.id)
    }

    section('POST /pasanaku · validación')
    {
      eq('sin moneda → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
      })})).status, 400)
      eq('un solo puesto → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', currency: 'BOB', contribution_amount: 300, total_slots: 1, my_slot: 1, start_date: '2026-08-05',
      })})).status, 400)
      eq('tu puesto mayor al total → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', currency: 'BOB', contribution_amount: 300, total_slots: 8, my_slot: 9, start_date: '2026-08-05',
      })})).status, 400)
      eq('aporte en cero → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', currency: 'BOB', contribution_amount: 0, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
      })})).status, 400)
      eq('cuenta inexistente (si se manda una) → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', currency: 'BOB', account_id: '00000000-0000-0000-0000-000000000009',
        contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
      })})).status, 400)
      // Un aporte ahí sería 'gasto · movimiento' igual que un ajuste de valor
      // de inversión — isInvestmentAdjustment() no podría distinguirlos y el
      // aporte desaparecería de Movimientos sin tope de saldo.
      eq('cuenta de inversión (si se manda una) → 400', (await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'X', currency: 'BOB', account_id: bsInversion.id, contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
      })})).status, 400)
    }

    section('POST /pasanaku · flujo completo — sin cuenta, solo monto y moneda')
    {
      pasanaku = (await json(await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'Oficina', currency: 'BOB', contribution_amount: 300, total_slots: 8, my_slot: 4, start_date: '2026-08-05',
      })}))).pasanaku
      ok('se crea', !!pasanaku?.id)
      eq('sin cuenta propia', pasanaku.account_id, null)

      const listado = await json(await api('/pasanaku'))
      const p = listado.pasanaku.find(x => x.id === pasanaku.id)
      eq('puesto 4 de 8 recibe 3 meses después del inicio', p.expected_turn, '2026-11-05')
      eq('todavía no recibiste', p.received, false)
      eq('sin aportes todavía', p.aportes_count, 0)
    }

    let aporte1
    section('POST /pasanaku/[id]/aporte')
    {
      eq('sin cuenta → 400 (no hay de dónde sacar el default)', (await api(`/pasanaku/${pasanaku.id}/aporte`, {
        method: 'POST', body: JSON.stringify({ date: '2026-08-05' }),
      })).status, 400)

      const antes = await json(await api('/accounts'))
      const saldoAntes = antes.accounts.find(a => a.id === bs.id).balance
      const mesAntes = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))

      aporte1 = (await json(await api(`/pasanaku/${pasanaku.id}/aporte`, { method: 'POST', body: JSON.stringify({
        date: '2026-08-05', account_id: bs.id,
      })}))).transaction
      eq('usa el aporte sugerido de la plantilla', aporte1.amount, 300)
      eq('gasto, no consumo — no debe ensuciar el gasto del mes', aporte1.flow_type, 'movimiento')
      eq('sin categoría', aporte1.category_id, null)

      const despues = await json(await api('/accounts'))
      eq('el saldo de la cuenta baja 300', despues.accounts.find(a => a.id === bs.id).balance, saldoAntes - 300)

      const mesDespues = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      ok('el aporte sí aparece en la lista de movimientos', mesDespues.transactions.some(t => t.id === aporte1.id))
      eq('pero el total de gasto del mes no cambia', mesDespues.total_gasto_usd, mesAntes.total_gasto_usd)

      const otro = (await json(await api(`/pasanaku/${pasanaku.id}/aporte`, { method: 'POST', body: JSON.stringify({
        date: '2026-09-05', amount: 300, account_id: bs.id,
      })}))).transaction
      ok('un segundo aporte también se registra', !!otro?.id)

      // El pasanaku sigue en BOB; una cuenta en USD sin monto explícito
      // convierte con la tasa de hoy en vez de mandar "300" tal cual.
      const bsUsd = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Cuenta USD para el pasanaku', currency: 'USD', initial_balance: 1000,
      })}))).account
      const aporteUsd = (await json(await api(`/pasanaku/${pasanaku.id}/aporte`, { method: 'POST', body: JSON.stringify({
        date: '2026-09-06', account_id: bsUsd.id,
      })}))).transaction
      eq('sin monto explícito, convierte 300 Bs a USD con la tasa de hoy', aporteUsd.amount, round2(300 / 6.96))
      eq('y la transacción queda en USD, no en Bs', aporteUsd.currency, 'USD')

      // Cada aporte puede salir de una cuenta distinta — la del pasanaku es
      // solo el default, no una ley.
      const bs2 = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Banco Bs', currency: 'BOB', initial_balance: 1000,
      })}))).account
      const aporteOtraCuenta = (await json(await api(`/pasanaku/${pasanaku.id}/aporte`, { method: 'POST', body: JSON.stringify({
        date: '2026-10-05', amount: 300, account_id: bs2.id,
      })}))).transaction
      eq('un aporte puede salir de otra cuenta', aporteOtraCuenta.account_id, bs2.id)
      const bs2Despues = await json(await api('/accounts'))
      eq('esa cuenta baja, no la del pasanaku', bs2Despues.accounts.find(a => a.id === bs2.id).balance, 700)

      const listado = await json(await api('/pasanaku'))
      const p = listado.pasanaku.find(x => x.id === pasanaku.id)
      eq('van 4 aportes, cuenten de la cuenta que cuenten', p.aportes_count, 4)
      // total_aportado queda en la moneda del pasanaku (BOB), no en USD. Los
      // 3 aportes en BOB suman su monto tal cual (300 cada uno, sin ninguna
      // conversión de por medio); el de la cuenta USD (43.10, ya redondeado)
      // vuelve a Bs con la tasa de hoy — con su propio redondeo, así que no
      // da 300 exacto, da 299.98.
      eq('suman lo esperado, en Bs — no en USD', p.total_aportado, 300 + 300 + round2(round2(300 / 6.96) * 6.96) + 300)

      const excede = await api(`/pasanaku/${pasanaku.id}/aporte`, { method: 'POST', body: JSON.stringify({
        amount: 999999, date: '2026-09-10', account_id: bs.id,
      })})
      eq('supera el saldo → 400', excede.status, 400)
    }

    section('POST /pasanaku/[id]/recibir · un cobro por jugador, no el pozo entero')
    {
      eq('sin cuenta → 400 (no hay de dónde sacar el default)', (await api(`/pasanaku/${pasanaku.id}/recibir`, {
        method: 'POST', body: JSON.stringify({ date: '2026-11-05' }),
      })).status, 400)

      const antes = await json(await api('/accounts'))
      const saldoAntes = antes.accounts.find(a => a.id === bs.id).balance
      const mesAntes = await json(await api('/transactions?from=2026-11-01&to=2026-11-30'))

      const cobro1 = (await json(await api(`/pasanaku/${pasanaku.id}/recibir`, { method: 'POST', body: JSON.stringify({
        date: '2026-11-05', account_id: bs.id,
      })}))).transaction
      // Ya no sugiere el pozo entero (8 × 300 = 2400): sugiere la parte de UN
      // jugador — se registra de a uno, no todo de una vez.
      eq('sugiere la parte de un jugador, no el pozo entero', cobro1.amount, 300)
      eq('ingreso, movimiento — no es plata ganada', cobro1.flow_type, 'movimiento')

      const despues = await json(await api('/accounts'))
      eq('el saldo sube 300, no 2400', despues.accounts.find(a => a.id === bs.id).balance, saldoAntes + 300)

      const mesDespues = await json(await api('/transactions?from=2026-11-01&to=2026-11-30'))
      ok('el cobro sí aparece en la lista de movimientos', mesDespues.transactions.some(t => t.id === cobro1.id))
      eq('pero no cuenta como ingreso real del mes', mesDespues.total_ingreso_usd, mesAntes.total_ingreso_usd)

      const listado1 = await json(await api('/pasanaku'))
      const p1 = listado1.pasanaku.find(x => x.id === pasanaku.id)
      eq('un cobro no alcanza para marcar received', p1.received, false)
      eq('el objetivo es la parte de los OTROS 7 puestos: 300 × 7', p1.collection_target, 2100)
      eq('llevás cobrado 300 de los 2100', p1.collected_amount, 300)
      eq('un cobro en la lista', p1.cobros.length, 1)

      // Los 6 restantes, hasta juntar la parte de los 7 demás puestos.
      for (let i = 2; i <= 7; i++) {
        await api(`/pasanaku/${pasanaku.id}/recibir`, { method: 'POST', body: JSON.stringify({
          date: `2026-11-0${i}`, account_id: bs.id,
        })})
      }

      const listado2 = await json(await api('/pasanaku'))
      const p2 = listado2.pasanaku.find(x => x.id === pasanaku.id)
      eq('7 de 7 cobros', p2.cobros.length, 7)
      eq('juntaste el objetivo entero', p2.collected_amount, 2100)
      eq('ahora sí, received en true', p2.received, true)
      eq('received_at es el cobro más reciente', p2.received_at, '2026-11-07')

      // Borrar uno vuelve a dejarlo incompleto — derivado, no un flag suelto.
      const unCobro = p2.cobros[0]
      await api(`/transactions/${unCobro.id}`, { method: 'DELETE' })
      const listado3 = await json(await api('/pasanaku'))
      const p3 = listado3.pasanaku.find(x => x.id === pasanaku.id)
      eq('borrar un cobro baja el total', p3.collected_amount, 2100 - unCobro.amount)
      eq('y received vuelve a false', p3.received, false)

      // Se repone para dejar el pasanaku "completo" para las secciones de abajo.
      await api(`/pasanaku/${pasanaku.id}/recibir`, { method: 'POST', body: JSON.stringify({
        date: '2026-11-08', account_id: bs.id,
      })})
    }

    section('POST /pasanaku/[id]/recibir · un cobro puede entrar a otra cuenta')
    {
      const bs3 = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Otra cuenta para recibir', currency: 'BOB', initial_balance: 0,
      })}))).account

      const cobroOtraCuenta = (await json(await api(`/pasanaku/${pasanaku.id}/recibir`, { method: 'POST', body: JSON.stringify({
        date: '2026-12-05', account_id: bs3.id,
      })}))).transaction
      eq('el cobro puede entrar a otra cuenta', cobroOtraCuenta.account_id, bs3.id)

      const conBs3 = await json(await api('/accounts'))
      eq('esa cuenta sube la parte de un jugador', conBs3.accounts.find(a => a.id === bs3.id).balance, 300)

      const listado = await json(await api('/pasanaku'))
      const p = listado.pasanaku.find(x => x.id === pasanaku.id)
      eq('la lista sigue mostrando el cobro más reciente', p.received_at, '2026-12-05')
      ok('sigue received: ya se había completado antes', p.received, true)
    }

    section('SPRINT 5 (revisión) · received tolera el redondeo de un cobro cross-currency')
    {
      // 10.03 Bs → 1.44 USD (round2(10.03/6.96)) → de vuelta a Bs da 10.02,
      // no 10.03: el viaje de ida y vuelta pierde un centavo. Sin tolerancia,
      // este pasanaku quedaría "casi cobrado" para siempre.
      const p2 = (await json(await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'Redondeo', currency: 'BOB', contribution_amount: 10.03, total_slots: 2, my_slot: 1, start_date: '2026-08-05',
      })}))).pasanaku

      const bsUsd2 = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'USD para el redondeo', currency: 'USD', initial_balance: 100,
      })}))).account

      const cobro = (await json(await api(`/pasanaku/${p2.id}/recibir`, { method: 'POST', body: JSON.stringify({
        date: '2026-09-01', account_id: bsUsd2.id,
      })}))).transaction
      eq('sugiere 1.44 USD (10.03 Bs convertidos)', cobro.amount, 1.44)

      const listado = await json(await api('/pasanaku'))
      const p = listado.pasanaku.find(x => x.id === p2.id)
      eq('vuelto a Bs da 10.02, un centavo menos que el objetivo (10.03)', p.collected_amount, 10.02)
      eq('el objetivo sigue siendo el aporte real', p.collection_target, 10.03)
      ok('pero received es true igual — la tolerancia absorbe el redondeo', p.received, true)

      await api(`/pasanaku/${p2.id}`, { method: 'DELETE' })
    }

    section('PATCH /pasanaku/[id]')
    {
      const editado = (await json(await api(`/pasanaku/${pasanaku.id}`, { method: 'PATCH', body: JSON.stringify({
        name: 'Oficina (nuevo turno)',
      })}))).pasanaku
      eq('cambia el nombre', editado.name, 'Oficina (nuevo turno)')

      eq('mover a una cuenta de inversión → 400', (await api(`/pasanaku/${pasanaku.id}`, {
        method: 'PATCH', body: JSON.stringify({ account_id: bsInversion.id }),
      })).status, 400)
    }

    section('cuentas de inversión rechazadas en /aporte y /recibir')
    {
      eq('POST /aporte con account_id de inversión → 400', (await api(`/pasanaku/${pasanaku.id}/aporte`, {
        method: 'POST', body: JSON.stringify({ account_id: bsInversion.id, date: '2026-09-06' }),
      })).status, 400)
      eq('POST /recibir con account_id de inversión → 400', (await api(`/pasanaku/${pasanaku.id}/recibir`, {
        method: 'POST', body: JSON.stringify({ account_id: bsInversion.id, date: '2026-09-06' }),
      })).status, 400)
    }

    section('SPRINT 5 (revisión) · POST /pasanaku/[id]/historico — aportes de antes de la app')
    {
      for (const [label, path, init] of [
        ['POST /pasanaku/[id]/historico', '/pasanaku/x/historico', { method: 'POST', body: '{}' }],
        ['DELETE /pasanaku/historico/[id]', '/pasanaku/historico/x', { method: 'DELETE' }],
      ]) {
        const r = await fetch(`${BASE}/api/finanzas${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
        eq(`${label} sin cookie → 401`, r.status, 401)
      }

      eq('monto en cero → 400', (await api(`/pasanaku/${pasanaku.id}/historico`, {
        method: 'POST', body: JSON.stringify({ amount: 0, date: '2026-05-05' }),
      })).status, 400)
      eq('sin fecha → 400', (await api(`/pasanaku/${pasanaku.id}/historico`, {
        method: 'POST', body: JSON.stringify({ amount: 300 }),
      })).status, 400)

      const cuentasAntes = await json(await api('/accounts'))
      const mesAntes = await json(await api('/transactions?from=2026-05-01&to=2026-05-31'))
      const listadoAntes = await json(await api('/pasanaku'))
      const antes = listadoAntes.pasanaku.find(x => x.id === pasanaku.id)

      const h1 = (await json(await api(`/pasanaku/${pasanaku.id}/historico`, { method: 'POST', body: JSON.stringify({
        amount: 300, date: '2026-05-05',
      })}))).historico
      ok('se crea', !!h1?.id)
      eq('sin cuenta: no es una fila de fin_transactions', h1.account_id, undefined)

      const cuentasDespues = await json(await api('/accounts'))
      eq('ninguna cuenta se mueve', JSON.stringify(cuentasDespues.accounts.map(a => a.balance)),
         JSON.stringify(cuentasAntes.accounts.map(a => a.balance)))

      const mesDespues = await json(await api('/transactions?from=2026-05-01&to=2026-05-31'))
      eq('no aparece en Movimientos', mesDespues.transactions.length, mesAntes.transactions.length)

      const h2 = (await json(await api(`/pasanaku/${pasanaku.id}/historico`, { method: 'POST', body: JSON.stringify({
        amount: 300, date: '2026-06-05',
      })}))).historico

      const listadoDespues = await json(await api('/pasanaku'))
      const despues = listadoDespues.pasanaku.find(x => x.id === pasanaku.id)
      eq('suma 2 al conteo de aportes', despues.aportes_count, antes.aportes_count + 2)
      ok('suma al total aportado', despues.total_aportado > antes.total_aportado)
      eq('quedan listados para poder borrarlos', despues.historico.length, 2)

      await api(`/pasanaku/historico/${h2.id}`, { method: 'DELETE' })
      const listadoTrasBorrar = await json(await api('/pasanaku'))
      const trasBorrar = listadoTrasBorrar.pasanaku.find(x => x.id === pasanaku.id)
      eq('borrar uno resta del conteo', trasBorrar.aportes_count, despues.aportes_count - 1)
      eq('y de la lista', trasBorrar.historico.length, 1)
    }

    section('DELETE /pasanaku/[id] · no borra la historia')
    {
      await api(`/pasanaku/${pasanaku.id}`, { method: 'DELETE' })

      const sigue = await json(await api('/transactions?from=2026-08-01&to=2026-08-31'))
      const fila = sigue.transactions.find(t => t.id === aporte1.id)
      ok('el aporte sigue en Movimientos', !!fila)
      eq('pero perdió el vínculo', fila.pasanaku_id, null)
    }

    section('DELETE /accounts · una cuenta con un pasanaku asociado no se borra')
    {
      const cuentaNueva = (await json(await api('/accounts', { method: 'POST', body: JSON.stringify({
        name: 'Sin movimientos', currency: 'BOB', initial_balance: 100,
      })}))).account

      const pasanakuSinAportes = (await json(await api('/pasanaku', { method: 'POST', body: JSON.stringify({
        name: 'Recién creado', account_id: cuentaNueva.id, currency: 'BOB',
        contribution_amount: 50, total_slots: 5, my_slot: 2, start_date: '2026-09-01',
      })}))).pasanaku

      // La cuenta no tiene NINGÚN movimiento todavía (fin_pasanaku no cuenta
      // como uno), así que el guard de fin_transactions no alcanza a frenarla
      // — tiene que ser el chequeo de fin_pasanaku el que la protege.
      const borrar = await api(`/accounts/${cuentaNueva.id}`, { method: 'DELETE' })
      eq('rechazada con 409, no con el error crudo de Postgres', borrar.status, 409)

      await api(`/pasanaku/${pasanakuSinAportes.id}`, { method: 'DELETE' })
      eq('sin el pasanaku, ahora sí se puede borrar',
         (await api(`/accounts/${cuentaNueva.id}`, { method: 'DELETE' })).status, 200)
    }

    section('PATCH /accounts · marcarla como inversión con aportes de pasanaku ya cargados')
    {
      // `bs` tiene movimientos de pasanaku propios (aportes y la recepción,
      // más arriba) con flow_type: 'movimiento' — marcarla como inversión los
      // volvería indistinguibles de un ajuste de valor y desaparecerían de
      // Movimientos.
      const marcar = await api(`/accounts/${bs.id}`, { method: 'PATCH', body: JSON.stringify({ is_investment: true }) })
      eq('rechazada con 409, no aplicada en silencio', marcar.status, 409)

      const sigue = await json(await api('/accounts'))
      eq('la cuenta sigue sin marcar', sigue.accounts.find(a => a.id === bs.id).is_investment, false)
    }
  }

  section('SPRINT 6 · Presupuesto')
  {
    // Fechas calculadas en vez de fijas: el suite no depende de en qué año
    // corra. `thisMonth` es el período vigente real (el que usa el server).
    const todayStr = new Date().toISOString().slice(0, 10)
    const thisMonth = `${todayStr.slice(0, 7)}-01`
    const addMonths = (period, n) => {
      const [y, m] = period.split('-').map(Number)
      const total = y * 12 + (m - 1) + n
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
    }
    const nextMonth = addMonths(thisMonth, 1)
    const prevMonth = addMonths(thisMonth, -1)

    const cats = await json(await api('/categories'))
    const comida = cats.categories.find(c => c.name === 'Comida')
    const sueldo = cats.categories.find(c => c.name === 'Sueldo')
    ok('hay categoría Comida', !!comida)

    const before = await json(await api('/budgets'))
    ok('Comida aparece sin línea todavía',
       before.categories_without_line.some(c => c.id === comida.id))

    eq('monto en cero → 400',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [comida.id], amount: 0 }) })).status, 400)
    eq('una categoría de INGRESO no admite presupuesto → 400',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [sueldo.id], amount: 50 }) })).status, 400)
    eq('categoría inexistente → 400',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: ['00000000-0000-0000-0000-000000000000'], amount: 50 }) })).status, 400)
    eq('moneda inválida → 400',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [comida.id], amount: 50, currency: 'EUR' }) })).status, 400)

    const comidaLine = (await json(await api('/budgets', {
      method: 'POST', body: JSON.stringify({ category_ids: [comida.id], amount: 80 }),
    }))).line
    ok('crea la línea de Comida', !!comidaLine?.id)
    eq('retroactive por default: true', comidaLine.retroactive, true)
    eq('sin nombre, name queda null (alias opcional)', comidaLine.name, null)
    eq('sin moneda, input_currency por default USD', comidaLine.input_currency, 'USD')

    eq('la misma categoría de nuevo → 409',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [comida.id], amount: 50 }) })).status, 409)

    // El tope general ya no es una línea propia: no hay categoría que
    // omitir, es simplemente obligatorio tener al menos una.
    eq('sin category_ids → 400 (no existe más el "tope general" como línea)',
       (await api('/budgets', { method: 'POST', body: JSON.stringify({ amount: 500 }) })).status, 400)

    const after = await json(await api('/budgets'))
    ok('Comida ya no aparece sin línea', !after.categories_without_line.some(c => c.id === comida.id))
    eq('arranca sin gastar nada', after.categories.find(c => c.line_id === comidaLine.id).spent_usd, 0)
    eq('disponible = monto entero', after.categories.find(c => c.line_id === comidaLine.id).available_usd, 80)
    ok('el general es la suma de las categorías (solo Comida, por ahora)',
       after.general.amount_usd === 80 && after.general.available_usd === 80)

    // Cuenta dedicada: no depende del saldo que hayan dejado otras secciones.
    const cuenta = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Presupuesto Test', currency: 'USD', initial_balance: 1000 }),
    }))).account

    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: todayStr, account_id: cuenta.id, category_id: comida.id, amount: 30, description: 'Super' }),
    })
    const afterGasto = await json(await api('/budgets'))
    eq('gastado 30', afterGasto.categories.find(c => c.line_id === comidaLine.id).spent_usd, 30)
    eq('disponible 50', afterGasto.categories.find(c => c.line_id === comidaLine.id).available_usd, 50)

    // El server NO bloquea con dureza (§4.6 del spec): la app es la puerta
    // real. Un gasto que se pasa igual se guarda si no viene por el quick-add.
    const overRes = await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: todayStr, account_id: cuenta.id, category_id: comida.id, amount: 60, description: 'Se pasó' }),
    })
    eq('el server no frena un gasto que excede el presupuesto', overRes.status, 201)
    const overBudget = await json(await api('/budgets'))
    eq('disponible negativo', overBudget.categories.find(c => c.line_id === comidaLine.id).available_usd, -10)
    eq('el general arrastra el mismo negativo (es la única categoría)', overBudget.general.available_usd, -10)

    let pastLine

    section('PATCH /budgets/[id]/period — no toca otros meses')
    {
      eq('actualiza el monto del mes siguiente',
         (await api(`/budgets/${comidaLine.id}/period`, { method: 'PATCH', body: JSON.stringify({ period: nextMonth, amount: 120 }) })).status, 200)

      const viewNextMonth = await json(await api(`/budgets?today=${nextMonth.slice(0, 8)}15`))
      eq('el mes siguiente ya tiene 120', viewNextMonth.categories.find(c => c.line_id === comidaLine.id).amount_usd, 120)

      const stillToday = await json(await api('/budgets'))
      eq('el mes actual sigue en 80, sin tocarse', stillToday.categories.find(c => c.line_id === comidaLine.id).amount_usd, 80)

      eq('período inválido (no es el día 1) → 400',
         (await api(`/budgets/${comidaLine.id}/period`, { method: 'PATCH', body: JSON.stringify({ period: `${thisMonth.slice(0, 8)}15`, amount: 10 }) })).status, 400)
    }

    section('POST /budgets/[id]/extend — ampliar un mes puntual')
    {
      eq('línea inexistente → 404',
         (await api(`/budgets/00000000-0000-0000-0000-000000000000/extend`, { method: 'POST', body: JSON.stringify({ period: thisMonth, amount: 10 }) })).status, 404)

      eq('registra la ampliación del mes siguiente',
         (await api(`/budgets/${comidaLine.id}/extend`, { method: 'POST', body: JSON.stringify({ period: nextMonth, amount: 15 }) })).status, 201)

      const withExt = await json(await api(`/budgets?today=${nextMonth.slice(0, 8)}15`))
      const comidaExt = withExt.categories.find(c => c.line_id === comidaLine.id)
      eq('el monto ampliado queda aparte del original', comidaExt.extended_usd, 15)
      eq('y también en la moneda de la línea (acá USD, así que el mismo)', comidaExt.extended, 15)
      ok('la ampliación queda auditada, no pisa el monto', comidaExt.extensions.some(e => Number(e.amount_usd) === 15))
    }

    section('POST /budgets/[id]/close — la pregunta de cierre de mes')
    {
      // Un mes YA terminado necesita una línea cuyo `created_on` sea de antes
      // — la API siempre la crea con `created_on = hoy`, así que se backdatea
      // directo con la service role (igual que db.mjs prueba constraints que
      // no se pueden ejercitar desde afuera).
      const transporte = (await json(await api('/categories'))).categories.find(c => c.name === 'Transporte')
      pastLine = (await json(await api('/budgets', {
        method: 'POST', body: JSON.stringify({ category_ids: [transporte.id], amount: 40 }),
      }))).line

      await adminFetch(`/rest/v1/fin_budget_lines?id=eq.${pastLine.id}`, {
        method: 'PATCH', body: JSON.stringify({ created_on: prevMonth }),
      })
      await adminFetch(`/rest/v1/fin_budget_periods?line_id=eq.${pastLine.id}`, {
        method: 'PATCH', body: JSON.stringify({ period: prevMonth }),
      })

      const withPending = await json(await api('/budgets'))
      ok('el mes pasado de Transporte queda pendiente de cierre',
         withPending.pending_closures.some(p => p.line_id === pastLine.id && p.period === prevMonth))

      const closed = await json(await api(`/budgets/${pastLine.id}/close`, {
        method: 'POST', body: JSON.stringify({ period: prevMonth, carried: true }),
      }))
      ok('cierra el mes pasado', !!closed?.closure?.id)
      eq('el disponible congelado es el monto entero (sin gasto ese mes)', Number(closed.closure.amount_usd), 40)

      eq('el mismo mes no se cierra dos veces',
         (await api(`/budgets/${pastLine.id}/close`, { method: 'POST', body: JSON.stringify({ period: prevMonth, carried: false }) })).status, 409)

      const afterClose = await json(await api('/budgets'))
      ok('ya no queda pendiente', !afterClose.pending_closures.some(p => p.line_id === pastLine.id))
      eq('el mes en curso ya arranca con los 40 llevados',
         afterClose.categories.find(c => c.line_id === pastLine.id).carried_usd, 40)
    }

    section('DELETE /budgets/[id] y PATCH archived')
    {
      eq('borra la línea de Comida — configuración, sin 409 posible',
         (await api(`/budgets/${comidaLine.id}`, { method: 'DELETE' })).status, 200)

      const finalState = await json(await api('/budgets'))
      ok('Comida vuelve a estar disponible para presupuestar',
         finalState.categories_without_line.some(c => c.id === comida.id))
      ok('el general sigue existiendo — todavía queda Transporte', !!finalState.general)

      eq('archiva Transporte también',
         (await api(`/budgets/${pastLine.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200)
      const empty = await json(await api('/budgets'))
      eq('sin ninguna categoría presupuestada, el general es null', empty.general, null)
      const transporteCat = (await json(await api('/categories'))).categories.find(c => c.name === 'Transporte')
      ok('Transporte también vuelve a estar libre — archivar no la deja reservada para siempre',
         empty.categories_without_line.some(c => c.id === transporteCat.id))
    }

    section('Presupuesto con varias categorías — exclusividad entre líneas')
    {
      const salud = (await json(await api('/categories'))).categories.find(c => c.name === 'Salud')
      const personal = (await json(await api('/categories'))).categories.find(c => c.name === 'Personal')

      const grupoLine = (await json(await api('/budgets', {
        method: 'POST',
        body: JSON.stringify({ category_ids: [salud.id, personal.id], name: 'Salud y Personal', amount: 100 }),
      }))).line
      ok('crea una línea con dos categorías', !!grupoLine?.id)

      const withGrupo = await json(await api('/budgets'))
      ok('ninguna de las dos aparece ya sin línea',
         !withGrupo.categories_without_line.some(c => c.id === salud.id || c.id === personal.id))

      eq('una de esas dos categorías, sola, ya no se puede presupuestar aparte → 409',
         (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [salud.id], amount: 20 }) })).status, 409)

      const cuenta = (await json(await api('/accounts', {
        method: 'POST', body: JSON.stringify({ name: 'Grupo Test', currency: 'USD', initial_balance: 1000 }),
      }))).account
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'gasto', date: todayStr, account_id: cuenta.id, category_id: salud.id, amount: 15, description: 'Consulta' }),
      })
      await api('/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'gasto', date: todayStr, account_id: cuenta.id, category_id: personal.id, amount: 25, description: 'Corte' }),
      })

      const grupoProgress = (await json(await api('/budgets'))).categories.find(c => c.line_id === grupoLine.id)
      eq('el gasto de las dos categorías se suma en la misma línea', grupoProgress.spent_usd, 40)
      eq('las dos categorías quedan en category_ids',
         [...grupoProgress.category_ids].sort(), [personal.id, salud.id].sort())

      // "Ver movimientos" de una línea con varias categorías manda las dos
      // separadas por coma — Movimientos tiene que traer los gastos de
      // CUALQUIERA de ellas, no solo de la primera.
      const movsGrupo = (await json(await api(`/transactions?category_id=${salud.id},${personal.id}`))).transactions
      ok('trae el gasto de salud', movsGrupo.some(t => t.description === 'Consulta'))
      ok('trae el gasto de personal', movsGrupo.some(t => t.description === 'Corte'))

      eq('el orden de las categorías es estable, no el que devuelva Postgres',
         grupoProgress.category_names, [...grupoProgress.category_names].sort((a, b) => a.localeCompare(b)))

      // Editar el monto de una línea agrupada no toca sus categorías.
      eq('cambia el monto del grupo',
         (await api(`/budgets/${grupoLine.id}/period`, {
           method: 'PATCH', body: JSON.stringify({ period: thisMonth, amount: 200 }),
         })).status, 200)
      const grupoTrasEditar = (await json(await api('/budgets'))).categories.find(c => c.line_id === grupoLine.id)
      eq('el monto nuevo se aplica', grupoTrasEditar.amount_usd, 200)
      eq('y sigue cubriendo las dos categorías', grupoTrasEditar.category_ids.length, 2)
      eq('el gasto acumulado de las dos no se pierde', grupoTrasEditar.spent_usd, 40)

      // Editar las categorías del grupo sin perder el historial: es lo que
      // evita tener que borrar y recrear para sumar una categoría más.
      const educacionCat = (await json(await api('/categories'))).categories.find(c => c.name === 'Educación')
      eq('suma una categoría al grupo ya creado',
         (await api(`/budgets/${grupoLine.id}`, {
           method: 'PATCH', body: JSON.stringify({ category_ids: [salud.id, personal.id, educacionCat.id] }),
         })).status, 200)
      const conTres = (await json(await api('/budgets'))).categories.find(c => c.line_id === grupoLine.id)
      eq('ahora cubre tres categorías', conTres.category_ids.length, 3)
      eq('el monto sigue siendo el mismo', conTres.amount_usd, 200)
      eq('y el gasto de las dos originales tampoco se perdió', conTres.spent_usd, 40)

      eq('saca una categoría del grupo',
         (await api(`/budgets/${grupoLine.id}`, {
           method: 'PATCH', body: JSON.stringify({ category_ids: [salud.id, educacionCat.id] }),
         })).status, 200)
      const sinPersonal = (await json(await api('/budgets'))).categories.find(c => c.line_id === grupoLine.id)
      ok('personal ya no está en el grupo', !sinPersonal.category_ids.includes(personal.id))
      eq('y su gasto deja de contar: quedan los 15 de salud', sinPersonal.spent_usd, 15)
      const librePersonal = await json(await api('/budgets'))
      ok('personal vuelve a estar disponible para otro presupuesto',
         librePersonal.categories_without_line.some(c => c.id === personal.id))

      eq('dejar el grupo sin ninguna categoría → 400, no lo borra en silencio',
         (await api(`/budgets/${grupoLine.id}`, {
           method: 'PATCH', body: JSON.stringify({ category_ids: [] }),
         })).status, 400)
      ok('el grupo sigue vivo tras el intento fallido',
         (await json(await api('/budgets'))).categories.some(c => c.line_id === grupoLine.id))

      // Una categoría que ya es de OTRA línea no se puede robar.
      const otraLinea = (await json(await api('/budgets', {
        method: 'POST', body: JSON.stringify({ category_ids: [personal.id], amount: 10 }),
      }))).line
      eq('no se puede sumar al grupo una categoría que ya tiene otro presupuesto → 409',
         (await api(`/budgets/${grupoLine.id}`, {
           method: 'PATCH', body: JSON.stringify({ category_ids: [salud.id, educacionCat.id, personal.id] }),
         })).status, 409)
      await api(`/budgets/${otraLinea.id}`, { method: 'DELETE' })

      // Volver al par original para que el resto de la sección siga igual.
      await api(`/budgets/${grupoLine.id}`, {
        method: 'PATCH', body: JSON.stringify({ category_ids: [salud.id, personal.id] }),
      })

      eq('borra la línea del grupo', (await api(`/budgets/${grupoLine.id}`, { method: 'DELETE' })).status, 200)
      const afterGrupoDelete = await json(await api('/budgets'))
      ok('las dos categorías vuelven a estar libres',
         afterGrupoDelete.categories_without_line.some(c => c.id === salud.id)
         && afterGrupoDelete.categories_without_line.some(c => c.id === personal.id))
    }

    section('Presupuesto · borrar una categoría de un grupo, y la última')
    {
      const cats = (await json(await api('/categories'))).categories
      const educacion = cats.find(c => c.name === 'Educación')
      const otros = cats.find(c => c.name === 'Otros' && c.kind === 'gasto')

      const parLine = (await json(await api('/budgets', {
        method: 'POST', body: JSON.stringify({ category_ids: [educacion.id, otros.id], amount: 60 }),
      }))).line
      ok('crea un presupuesto con dos categorías', !!parLine?.id)

      // Borrar UNA: el presupuesto sobrevive con la que queda.
      eq('borra una de las dos categorías', (await api(`/categories/${otros.id}`, { method: 'DELETE' })).status, 200)
      const trasUna = await json(await api('/budgets'))
      const sobreviviente = trasUna.categories.find(c => c.line_id === parLine.id)
      ok('el presupuesto sigue existiendo', !!sobreviviente)
      eq('y le queda solo la categoría que no se borró', sobreviviente.category_ids, [educacion.id])

      // Borrar la ÚLTIMA: el trigger se lleva el presupuesto entero.
      eq('borra la última categoría que le quedaba',
         (await api(`/categories/${educacion.id}`, { method: 'DELETE' })).status, 200)
      const trasUltima = await json(await api('/budgets'))
      ok('sin categorías, el presupuesto desaparece solo',
         !trasUltima.categories.some(c => c.line_id === parLine.id))
    }

    section('Categorías · no se borra una que un fijo esté usando')
    {
      const cats = (await json(await api('/categories'))).categories
      const servicios = cats.find(c => c.name === 'Servicios')

      const fijo = (await json(await api('/recurring', {
        method: 'POST',
        body: JSON.stringify({ name: 'Luz', category_id: servicios.id, amount: 80, currency: 'BOB', day_of_month: 10 }),
      }))).recurring
      ok('crea un fijo en esa categoría', !!fijo?.id)

      // La FK está en RESTRICT: sin este chequeo el fijo quedaba con
      // category_id null y ya no se podía ni pausar (el toggle revalida todo).
      const res = await api(`/categories/${servicios.id}`, { method: 'DELETE' })
      eq('borrar la categoría de un fijo → 409', res.status, 409)
      ok('y el error dice cuál es el fijo', (await res.json()).error.includes('Luz'))

      const sigueTeniendo = (await json(await api('/recurring'))).recurring.find(r => r.id === fijo.id)
      eq('el fijo conserva su categoría', sigueTeniendo.category_id, servicios.id)

      // Pausarlo tiene que seguir funcionando — era justo lo que se rompía.
      eq('el fijo se puede pausar',
         (await api(`/recurring/${fijo.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })).status, 200)

      await api(`/recurring/${fijo.id}`, { method: 'DELETE' })
      eq('sin el fijo, la categoría ya se borra',
         (await api(`/categories/${servicios.id}`, { method: 'DELETE' })).status, 200)
    }

    section('Presupuesto · una categoría archivada no se puede presupuestar')
    {
      const ocio = (await json(await api('/categories'))).categories.find(c => c.name === 'Ocio')
      eq('archiva la categoría',
         (await api(`/categories/${ocio.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status, 200)

      const budgetsConArchivada = await json(await api('/budgets'))
      ok('una categoría archivada no se ofrece para presupuestar',
         !budgetsConArchivada.categories_without_line.some(c => c.id === ocio.id))

      eq('y el server la rechaza igual → 400',
         (await api('/budgets', { method: 'POST', body: JSON.stringify({ category_ids: [ocio.id], amount: 30 }) })).status, 400)

      await api(`/categories/${ocio.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })
    }
  }

  section('SPRINT 6 (revisión) · nombre propio y moneda de entrada')
  {
    const todayStr = new Date().toISOString().slice(0, 10)
    const thisMonth = `${todayStr.slice(0, 7)}-01`
    const addMonths = (period, n) => {
      const [y, m] = period.split('-').map(Number)
      const total = y * 12 + (m - 1) + n
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
    }
    const nextMonth = addMonths(thisMonth, 1)

    const vivienda = (await json(await api('/categories'))).categories.find(c => c.name === 'Vivienda')

    // 696 Bs a 6.96 Bs/USD (fijada al principio de la suite) da exactamente
    // 100 USD — un número redondo para no depender de decimales de más.
    const viviendaLine = (await json(await api('/budgets', {
      method: 'POST',
      body: JSON.stringify({ category_ids: [vivienda.id], name: 'Alquiler y depósito', amount: 696, currency: 'BOB' }),
    }))).line
    eq('el alias queda guardado', viviendaLine.name, 'Alquiler y depósito')
    eq('la moneda de entrada queda guardada', viviendaLine.input_currency, 'BOB')

    const withVivienda = await json(await api('/budgets'))
    const viviendaProgress = withVivienda.categories.find(c => c.line_id === viviendaLine.id)
    eq('696 Bs se convierten a 100 USD al crear', viviendaProgress.amount_usd, 100)
    eq('pero el monto nativo queda EXACTO — 696, no reconvertido', viviendaProgress.amount, 696)
    eq('el progreso trae el mismo alias', viviendaProgress.name, 'Alquiler y depósito')

    // El corazón del arreglo: la tasa se mueve y el monto que el usuario
    // escribió NO. Antes se recalculaba desde el USD en cada lectura, y
    // "2.400 Bs" volvía como "2.400,02 Bs".
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 12.4 }) })
    const afterRateMove = await json(await api('/budgets'))
    const stillExact = afterRateMove.categories.find(c => c.line_id === viviendaLine.id)
    eq('con otra tasa, el monto en Bs sigue siendo 696 clavado', stillExact.amount, 696)
    eq('y su USD congelado tampoco se recalcula', stillExact.amount_usd, 100)
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })

    eq('renombrar la línea', (await api(`/budgets/${viviendaLine.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Depa' }),
    })).status, 200)
    const renamed = await json(await api('/budgets'))
    eq('el nuevo alias se ve en el progreso', renamed.categories.find(c => c.line_id === viviendaLine.id).name, 'Depa')

    eq('vaciar el nombre lo vuelve al default (null → nombre de categoría)', (await json(await api(`/budgets/${viviendaLine.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: '' }),
    }))).line.name, null)

    // El monto del mes siguiente también se escribe en Bs — la moneda quedó
    // fija en la línea al crearla, no hace falta volver a mandarla.
    eq('el monto de otro mes también se escribe en la moneda de la línea',
       (await api(`/budgets/${viviendaLine.id}/period`, {
         method: 'PATCH', body: JSON.stringify({ period: nextMonth, amount: 348 }),
       })).status, 200)
    const viewNextMonth = await json(await api(`/budgets?today=${nextMonth.slice(0, 8)}15`))
    const nextMonthLine = viewNextMonth.categories.find(c => c.line_id === viviendaLine.id)
    eq('348 Bs se convierten a 50 USD, sin que el cliente mande la moneda', nextMonthLine.amount_usd, 50)
    eq('y el nativo de ese mes también queda exacto', nextMonthLine.amount, 348)

    // El caso que reportó el usuario: un gasto de 10 Bs se veía como 9,99 en
    // el presupuesto. `amount_usd` está redondeado a centavos (10 Bs a 6.96
    // dan 1.4367... → 1.44), y reconvertir esos 1.44 daba 10.02. Sumando el
    // monto nativo, sigue siendo 10 clavado.
    const cuentaBs = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Bs Presupuesto', currency: 'BOB', initial_balance: 500 }),
    }))).account
    eq('registra un gasto de 10 Bs en la categoría presupuestada',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({ type: 'gasto', date: todayStr, account_id: cuentaBs.id, category_id: vivienda.id, amount: 10, description: 'Prueba redondeo' }),
       })).status, 201)

    const conGasto = await json(await api('/budgets'))
    const viviendaConGasto = conGasto.categories.find(c => c.line_id === viviendaLine.id)
    eq('el gastado en Bs es 10 exacto, no 9,99', viviendaConGasto.spent, 10)
    eq('y el disponible cierra clavado: 696 − 10', viviendaConGasto.available, 686)
  }

  section('Transferencias · el lado que llega también se congela')
  {
    const cuentaUsd = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Origen USD', currency: 'USD', initial_balance: 500 }),
    }))).account
    const cuentaBs = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Destino Bs', currency: 'BOB', initial_balance: 0 }),
    }))).account

    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })

    // Salen 100 USD y llegan 680 Bs: a 6.96 eso son 97,70 USD, así que el
    // camino se comió 2,30.
    const t = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transferencia', date: '2026-08-20',
        account_id: cuentaUsd.id, to_account_id: cuentaBs.id,
        amount: 100, to_amount: 680, description: 'P2P',
      }),
    }))).transaction

    eq('congela lo que salió', Number(t.amount_usd), 100)
    eq('y también lo que llegó', Number(t.to_amount_usd), 97.70)
    eq('con la tasa del destino congelada aparte',
       Math.abs(Number(t.to_exchange_rate) - 1 / 6.96) < 1e-7, true)

    // El corazón del arreglo: la tasa se mueve y la comisión NO.
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 12.4 }) })
    const tras = (await json(await api('/transactions?from=2026-08-01&to=2026-08-31')))
      .transactions.find(x => x.id === t.id)
    eq('con otra tasa, lo que llegó sigue valiendo lo mismo', Number(tras.to_amount_usd), 97.70)
    eq('y lo que salió tampoco se recalcula', Number(tras.amount_usd), 100)
    await api('/rates', { method: 'PATCH', body: JSON.stringify({ currency: 'BOB', rate: 6.96 }) })

    // Una transferencia de misma moneda no tiene destino que congelar.
    const cuentaUsd2 = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Otra USD', currency: 'USD', initial_balance: 0 }),
    }))).account
    const misma = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transferencia', date: '2026-08-20',
        account_id: cuentaUsd.id, to_account_id: cuentaUsd2.id, amount: 50,
      }),
    }))).transaction
    eq('misma moneda: sin to_amount_usd', misma.to_amount_usd, null)

    // Misma moneda CON comisión: mandás 50 y llegan 48, el banco se comió 2.
    const conComision = (await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transferencia', date: '2026-08-21',
        account_id: cuentaUsd.id, to_account_id: cuentaUsd2.id,
        amount: 50, to_amount: 48, description: 'Con comisión',
      }),
    }))).transaction
    eq('guarda lo que realmente llegó', Number(conComision.to_amount), 48)
    eq('y su USD congelado', Number(conComision.to_amount_usd), 48)

    eq('en la misma moneda no puede llegar MÁS de lo que salió → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'transferencia', date: '2026-08-21',
           account_id: cuentaUsd.id, to_account_id: cuentaUsd2.id, amount: 50, to_amount: 60,
         }),
       })).status, 400)

    // El saldo del destino tiene que reflejar lo que llegó, no lo que salió.
    const cuentas = (await json(await api('/accounts'))).accounts
    const destino = cuentas.find(a => a.id === cuentaUsd2.id)
    eq('el destino recibe 50 + 48, no 50 + 50', destino.balance, 98)
  }

  section('SPRINT 6 · /bootstrap incluye presupuesto')
  {
    const boot = await json(await api('/bootstrap'))
    ok('el payload trae budgets con su forma esperada',
       boot.budgets && Array.isArray(boot.budgets.categories) && Array.isArray(boot.budgets.pending_closures),
       JSON.stringify(boot.budgets))
  }

  section('SPRINT 7 · CRUD de fin_savings_goals')
  let ahorroEmergencia, ahorroViaje
  {
    const before = await json(await api('/savings-goals'))
    eq('arranca sin ahorros', before.goals, [])
    eq('sin ahorros, tampoco hay período pendiente', before.pending_period, null)

    eq('sin nombre → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ currency: 'USD', allocation_type: 'fixed', allocation_value: 50 }) })).status, 400)
    eq('moneda inválida → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'EUR', allocation_type: 'fixed', allocation_value: 50 }) })).status, 400)
    eq('allocation_type inválido → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'USD', allocation_type: 'mitad', allocation_value: 50 }) })).status, 400)
    eq('allocation_value en cero → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'USD', allocation_type: 'fixed', allocation_value: 0 }) })).status, 400)
    eq('porcentaje mayor a 100 → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'USD', allocation_type: 'percent', allocation_value: 150 }) })).status, 400)
    eq('meta en cero → 400',
       (await api('/savings-goals', { method: 'POST', body: JSON.stringify({ name: 'X', currency: 'USD', allocation_type: 'fixed', allocation_value: 50, target_amount: 0 }) })).status, 400)

    ahorroEmergencia = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Emergencia', currency: 'USD', allocation_type: 'fixed', allocation_value: 50 }),
    }))).goal
    ok('crea el ahorro de emergencia', !!ahorroEmergencia?.id)

    ahorroViaje = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Viaje', currency: 'USD', allocation_type: 'percent', allocation_value: 30, target_amount: 1000 }),
    }))).goal
    ok('crea el ahorro de viaje, con meta', !!ahorroViaje?.id)

    const listed = await json(await api('/savings-goals'))
    eq('los dos ahorros aparecen con saldo cero', listed.goals.map(g => g.balance_usd).sort(), [0, 0])
    eq('el de viaje no alcanzó su meta con saldo cero', listed.goals.find(g => g.id === ahorroViaje.id).goal_reached, false)

    const renamed = (await json(await api(`/savings-goals/${ahorroEmergencia.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Fondo de emergencia' }),
    }))).goal
    eq('renombra el ahorro', renamed.name, 'Fondo de emergencia')

    const reparto = (await json(await api(`/savings-goals/${ahorroEmergencia.id}`, {
      method: 'PATCH', body: JSON.stringify({ allocation_type: 'fixed', allocation_value: 75 }),
    }))).goal
    eq('el reparto es editable siempre (§0 Ronda 3)', reparto.allocation_value, 75)

    eq('reparto sin type ni value juntos no rompe nada — PATCH parcial de otro campo',
       (await api(`/savings-goals/${ahorroEmergencia.id}`, { method: 'PATCH', body: JSON.stringify({ target_date: '2026-12-31' }) })).status, 200)

    // Cajón de sastre: marcar uno tiene que DESmarcar al anterior solo, no
    // rebotar con el error crudo del índice único.
    await api(`/savings-goals/${ahorroEmergencia.id}`, { method: 'PATCH', body: JSON.stringify({ is_catchall: true }) })
    const traspaso = await api(`/savings-goals/${ahorroViaje.id}`, { method: 'PATCH', body: JSON.stringify({ is_catchall: true }) })
    eq('marcar un segundo cajón de sastre no falla', traspaso.status, 200)
    const trasTraspaso = await json(await api('/savings-goals'))
    eq('solo queda uno marcado', trasTraspaso.goals.filter(g => g.is_catchall).length, 1)
    eq('y es el último que se marcó', trasTraspaso.goals.find(g => g.is_catchall)?.id, ahorroViaje.id)
    await api(`/savings-goals/${ahorroViaje.id}`, { method: 'PATCH', body: JSON.stringify({ is_catchall: false }) })
  }

  section('SPRINT 7 · quick-add — aporte y retiro de un ahorro')
  let cuentaRegular, cuentaAhorro
  {
    cuentaRegular = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Regular Ahorro Test', currency: 'USD', initial_balance: 500 }),
    }))).account
    cuentaAhorro = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Dedicada Ahorro Test', currency: 'USD', initial_balance: 0 }),
    }))).account

    const hoy = new Date().toISOString().slice(0, 10)

    // RONDA 8 — por el quick-add un ahorro solo puede SALIR.
    //
    // La plata entra a un ahorro por dos caminos deliberados y periódicos (un
    // fijo de ahorro y el reparto del cierre de mes); romperlo pasa en el
    // momento y sin plan, así que vive en el gasto que lo rompe. Una
    // transferencia común, por su lado, solo mueve saldo disponible.
    eq('transferir sin tagear ningún ahorro → 201',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({ type: 'transferencia', date: hoy, account_id: cuentaRegular.id, to_account_id: cuentaAhorro.id, amount: 1 }),
       })).status, 201)

    const transfTageada = await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'transferencia', date: hoy, account_id: cuentaRegular.id, to_account_id: cuentaAhorro.id, amount: 50,
        savings_goal_id: ahorroEmergencia.id, savings_flow: 'aporte',
      }),
    })
    eq('tagear una transferencia desde el quick-add → 400', transfTageada.status, 400)
    ok('y el error manda a "Mover de cuenta"',
       /Mover de cuenta/i.test((await json(transfTageada))?.error ?? ''), 'sin la referencia')

    const ingresoTageado = await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'ingreso', date: hoy, account_id: cuentaAhorro.id, amount: 50,
        savings_goal_id: ahorroEmergencia.id,
      }),
    })
    eq('marcar un ingreso como aporte → 400', ingresoTageado.status, 400)
    ok('y el error nombra los dos caminos reales',
       /fijo de ahorro/i.test((await json(ingresoTageado))?.error ?? ''), 'sin la referencia')

    eq('retirar de un ahorro que no existe → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 10,
           savings_goal_id: '00000000-0000-0000-0000-000000000000', savings_reason: 'otro',
         }),
       })).status, 400)

    // El aporte se hace por donde corresponde: un fijo de ahorro registrado.
    const fijoAporte = (await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Aporte de prueba', amount: 50, currency: 'USD',
        savings_goal_id: ahorroEmergencia.id, to_account_id: cuentaAhorro.id,
        starts_on: hoy, day_of_month: Number(hoy.slice(8, 10)),
      }),
    }))).recurring
    const aporte = await json(await api(`/recurring/${fijoAporte.id}/register`, {
      method: 'POST',
      body: JSON.stringify({ account_id: cuentaRegular.id, to_account_id: cuentaAhorro.id, date: hoy }),
    }))
    ok('el aporte se guarda desde el fijo', !!aporte.transaction?.id, JSON.stringify(aporte))
    eq('y el fijo declara la dirección solo', aporte.transaction.savings_flow, 'aporte')
    eq('flow_type de una transferencia es siempre movimiento', aporte.transaction.flow_type, 'movimiento')
    eq('queda tageado con el ahorro', aporte.transaction.savings_goal_id, ahorroEmergencia.id)

    eq('retirar sin savings_reason → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({ type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 10, savings_goal_id: ahorroEmergencia.id }),
       })).status, 400)

    eq('retirar con un motivo fuera del enum → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 10,
           savings_goal_id: ahorroEmergencia.id, savings_reason: 'porque sí',
         }),
       })).status, 400)

    const retiro = await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 10,
        savings_goal_id: ahorroEmergencia.id, savings_reason: 'emergencia',
      }),
    }))
    ok('el retiro se guarda', !!retiro.transaction?.id)
    eq('un retiro tipo gasto SÍ cuenta como consumo real (Ronda 2)', retiro.transaction.flow_type, 'consumo')

    const goals = await json(await api('/savings-goals'))
    eq('el saldo del ahorro es 50 − 10 = 40', goals.goals.find(g => g.id === ahorroEmergencia.id).balance_usd, 40)

    // FIX (revisión post-construcción): la lista de movimientos tiene que
    // traer savings_goal_id/savings_reason. Sin eso, abrir un aporte para
    // editarlo mostraba el picker de ahorro vacío y el quick-add bloqueaba el
    // guardado hasta re-elegirlo — un dato que ya estaba guardado.
    const lista = await json(await api(`/transactions?limit=50`))
    const aporteEnLista = lista.transactions.find(t => t.id === aporte.transaction.id)
    eq('el aporte llega en la lista con su ahorro', aporteEnLista?.savings_goal_id, ahorroEmergencia.id)
    const retiroEnLista = lista.transactions.find(t => t.id === retiro.transaction.id)
    eq('y el retiro con su motivo', retiroEnLista?.savings_reason, 'emergencia')

    // Editar solo la descripción no puede perder el tageo: el PATCH hereda
    // savings_goal_id/savings_reason de la fila actual si no vienen en el body.
    const editado = await json(await api(`/transactions/${retiro.transaction.id}`, {
      method: 'PATCH', body: JSON.stringify({ description: 'Se rompió la moto' }),
    }))
    eq('editar la descripción conserva el ahorro', editado.transaction.savings_goal_id, ahorroEmergencia.id)
    eq('y conserva el motivo', editado.transaction.savings_reason, 'emergencia')

    // FIX (revisión post-construcción): archivar un ahorro no puede congelar
    // la historia que lo referencia. Es el mismo bug que apareció con los
    // fijos y su categoría (20260824000000_...fijo_categoria_restrict): el
    // movimiento quedaba sin poder editarse NUNCA más, ni la descripción.
    await api(`/savings-goals/${ahorroViaje.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    const retiroViaje = await json(await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 1,
        savings_goal_id: ahorroEmergencia.id, savings_reason: 'otro',
      }),
    }))
    // Se apunta al ahorro archivado por REST directo para simular un
    // movimiento que ya existía cuando su ahorro todavía estaba activo.
    await adminFetch(`/rest/v1/fin_transactions?id=eq.${retiroViaje.transaction.id}`, {
      method: 'PATCH', body: JSON.stringify({ savings_goal_id: ahorroViaje.id }),
    })
    const editArchivado = await api(`/transactions/${retiroViaje.transaction.id}`, {
      method: 'PATCH', body: JSON.stringify({ description: 'corrijo el detalle' }),
    })
    eq('un movimiento de un ahorro ARCHIVADO se sigue pudiendo editar', editArchivado.status, 200)

    // Pero elegir un ahorro archivado desde cero sí se rechaza.
    eq('no se puede apuntar un movimiento NUEVO a un ahorro archivado → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'gasto', date: hoy, account_id: cuentaAhorro.id, amount: 1,
           savings_goal_id: ahorroViaje.id, savings_reason: 'otro',
         }),
       })).status, 400)

    // Ya no hay "cuentas de ahorro" que excluir de Pasanaku: una cuenta que
    // aloja ahorros es una cuenta normal (la de inversión sí sigue afuera,
    // ver la sección de Pasanaku más arriba).
    const pasanakuConAhorro = await api('/pasanaku', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', account_id: cuentaAhorro.id, currency: 'USD', contribution_amount: 10, total_slots: 5, my_slot: 1, start_date: hoy }),
    })
    eq('una cuenta que aloja ahorros sí puede usarse para un pasanaku', pasanakuConAhorro.status, 201)

    // GAP CONOCIDO (documentado en sprint_7_ahorro.md §4.10): el tope "no
    // toques los ahorros" lo aplica hoy SOLO el quick-add. El servidor deja
    // salir cualquier monto hasta el saldo total, venga de donde venga.
    const antes = await json(await api('/accounts'))
    const saldoAhorro = antes.accounts.find(a => a.id === cuentaAhorro.id)
    ok('la cuenta reporta cuánto de su saldo está apartado',
       typeof saldoAhorro?.savings_balance === 'number', JSON.stringify(saldoAhorro))
  }

  section('SPRINT 7 (rev. 26/8) · regresiones de los tres bugs de la revisión')
  {
    const hoy = new Date().toISOString().slice(0, 10)
    const cA = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Rev Caja', currency: 'USD', initial_balance: 1000 }),
    }))).account
    const cB = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Rev Banco', currency: 'USD', initial_balance: 0 }),
    }))).account
    const meta = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Rev Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal

    // BUG 1 — el CHECK de forma evaluaba a NULL y dejaba pasar la fila.
    // Un CHECK que da NULL no se viola: `(false OR NULL)` es NULL, así que
    // una fila tageada SIN dirección entraba igual y quedaba ilegible.
    eq('tagear sin declarar dirección (transferencia) → 400',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'transferencia', date: hoy, account_id: cA.id, to_account_id: cB.id,
           amount: 10, savings_goal_id: meta.id,
         }),
       })).status, 400)

    // El invariante que sostiene la pantalla de Cuentas: el saldo del ahorro
    // tiene que ser exactamente la suma de lo apartado en cada cuenta.
    // Se aporta por el camino real: un fijo de ahorro registrado, que mueve la
    // plata de cA a cB y la deja apartada en el DESTINO.
    const aporteRev = await aportar({ goalId: meta.id, fromId: cA.id, toId: cB.id, amount: 200, date: hoy })
    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'gasto', date: hoy, account_id: cB.id, amount: 50,
        savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'emergencia',
      }),
    })

    const accs = (await json(await api('/accounts'))).accounts
    const apartadoA = accs.find(a => a.id === cA.id)?.savings_balance
    const apartadoB = accs.find(a => a.id === cB.id)?.savings_balance
    eq('la cuenta de origen del aporte no aparta nada', apartadoA, 0)
    eq('la de destino guarda 200 − 50', apartadoB, 150)
    const conSaldo = (await json(await api('/savings-goals'))).goals.find(g => g.id === meta.id)
    eq('y el saldo del ahorro cuadra con la suma de las dos', conSaldo.balance_usd, apartadoA + apartadoB)

    // BUG 2 — el CHECK no es diferible, así que soltar la etiqueta en dos
    // pasos (trigger + FK on delete set null) rompía a mitad de camino:
    // TODO ahorro con movimientos quedaba imborrable, con el mensaje crudo de
    // Postgres. Ahora el trigger suelta etiqueta, dirección y motivo juntos.
    // El fijo que lo alimenta lo bloquea a propósito (409 con su nombre), así
    // que primero se saca de en medio — es lo mismo que haría el usuario.
    eq('mientras un fijo lo use, no se borra',
       (await api(`/savings-goals/${meta.id}`, { method: 'DELETE' })).status, 409)
    await api(`/recurring/${aporteRev.recurring_id}`, { method: 'DELETE' })

    const borrado = await api(`/savings-goals/${meta.id}`, { method: 'DELETE' })
    eq('un ahorro que YA tiene movimientos se puede borrar', borrado.status, 200)

    const tras = (await json(await api('/transactions?limit=100'))).transactions
      .filter(x => x.account_id === cA.id || x.account_id === cB.id)
    ok('sus movimientos sobreviven', tras.length >= 2, String(tras.length))
    ok('ninguno queda con dirección colgada',
       tras.every(x => x.savings_goal_id == null && x.savings_flow == null && x.savings_reason == null),
       JSON.stringify(tras.map(x => [x.savings_goal_id, x.savings_flow, x.savings_reason])))

    const trasBorrar = (await json(await api('/accounts'))).accounts
    eq('y las cuentas dejan de reportar alcancía', trasBorrar.find(a => a.id === cB.id)?.savings_balance, 0)

    // BUG 3 — registrar un fijo contra un ahorro archivado devolvía 201 y
    // metía plata en un ahorro que la pantalla ni siquiera lista.
    const meta2 = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Rev Meta 2', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal
    const fijoRev = (await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Rev Fijo', amount: 15, currency: 'USD', savings_goal_id: meta2.id,
        to_account_id: cB.id, starts_on: hoy, day_of_month: Number(hoy.slice(8, 10)),
      }),
    }))).recurring
    await api(`/savings-goals/${meta2.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })

    const regArchivado = await api(`/recurring/${fijoRev.id}/register`, {
      method: 'POST', body: JSON.stringify({ account_id: cA.id, to_account_id: cB.id, date: hoy }),
    })
    eq('registrar un fijo contra un ahorro archivado → 400', regArchivado.status, 400)
    ok('con un mensaje que dice qué hacer',
       /archivad/i.test((await json(regArchivado))?.error ?? ''), 'sin mensaje')

    // Pero archivar no congela el fijo (clase b08fdb4).
    eq('el fijo se sigue pudiendo pausar',
       (await api(`/recurring/${fijoRev.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })).status, 200)

    await api(`/recurring/${fijoRev.id}`, { method: 'DELETE' })
    await api(`/savings-goals/${meta2.id}`, { method: 'DELETE' })
  }

  section('SPRINT 7 (rev. 26/8) · el piso de ahorro vale en todos los caminos')
  {
    // Pedido del usuario: "creo que debería estar en toda la app para que
    // ahorrar tenga sentido". Antes lo aplicaba solo el quick-add, así que
    // registrar un fijo o aportar a un pasanaku se comía lo apartado sin
    // avisar. Ahora el piso vive en `assertBalance`, que es por donde pasan
    // los cinco caminos que sacan plata de una cuenta.
    const hoy = new Date().toISOString().slice(0, 10)
    const c = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Piso Cuenta', currency: 'USD', initial_balance: 300 }),
    }))).account
    const otra = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Piso Otra', currency: 'USD', initial_balance: 0 }),
    }))).account
    const meta = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Piso Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal

    // Arranca con 300; se le aportan 200 desde otra cuenta, así que queda con
    // 500 de saldo y 200 apartados → 300 libres.
    const fondeo = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Piso Fondeo', currency: 'USD', initial_balance: 500 }),
    }))).account
    await aportar({ goalId: meta.id, fromId: fondeo.id, toId: c.id, amount: 200, date: hoy })

    const excede = await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'gasto', date: hoy, account_id: c.id, amount: 350 }),
    })
    eq('un gasto común no puede pasar de saldo − apartado', excede.status, 400)
    ok('y el error nombra la plata apartada',
       /apartad/i.test((await json(excede))?.error ?? ''), 'sin mención')

    eq('una transferencia común tampoco se los lleva',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({ type: 'transferencia', date: hoy, account_id: c.id, to_account_id: otra.id, amount: 350 }),
       })).status, 400)

    eq('justo hasta lo libre sí entra',
       (await api('/transactions', {
         method: 'POST', body: JSON.stringify({ type: 'gasto', date: hoy, account_id: c.id, amount: 300 }),
       })).status, 201)

    // Un retiro DECLARADO sí gasta de la alcancía — para eso está.
    eq('un retiro declarado gasta de lo apartado',
       (await api('/transactions', {
         method: 'POST',
         body: JSON.stringify({
           type: 'gasto', date: hoy, account_id: c.id, amount: 150,
           savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'emergencia',
         }),
       })).status, 201)

    // ...pero tampoco más de lo apartado (quedan 50).
    const pasado = await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'gasto', date: hoy, account_id: c.id, amount: 80,
        savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'otro',
      }),
    })
    eq('un retiro por más de lo apartado → 400', pasado.status, 400)

    // Registrar un FIJO respeta el mismo piso.
    const catPiso = ((await json(await api('/categories'))).categories ?? [])
      .find(x => !x.archived && x.kind === 'gasto')?.id ?? null
    const fijoPiso = (await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Piso Fijo', amount: 60, currency: 'USD', category_id: catPiso,
        starts_on: hoy, day_of_month: Number(hoy.slice(8, 10)),
      }),
    }))).recurring
    const regPiso = await api(`/recurring/${fijoPiso.id}/register`, {
      method: 'POST', body: JSON.stringify({ account_id: c.id, date: hoy }),
    })
    eq('registrar un fijo que se comería los ahorros → 400', regPiso.status, 400)

    // Y un aporte de PASANAKU también.
    const pasPiso = (await json(await api('/pasanaku', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Piso Pasanaku', account_id: c.id, currency: 'USD',
        contribution_amount: 60, total_slots: 4, my_slot: 2, start_date: hoy,
      }),
    }))).pasanaku
    eq('aportar a un pasanaku comiéndose los ahorros → 400',
       (await api(`/pasanaku/${pasPiso.id}/aporte`, {
         method: 'POST', body: JSON.stringify({ account_id: c.id, amount: 60, date: hoy }),
       })).status, 400)

    const finales = (await json(await api('/accounts'))).accounts
    eq('tras todos los rechazos, lo apartado quedó intacto',
       finales.find(a => a.id === c.id)?.savings_balance, 50)

    await api(`/recurring/${fijoPiso.id}`, { method: 'DELETE' })
    await api(`/pasanaku/${pasPiso.id}`, { method: 'DELETE' })
  }

  section('SPRINT 7 (Ronda 8) · mover un ahorro de cuenta')
  {
    // El "traslado": la tercera dirección. Mover plata YA ahorrada entre dos
    // cuentas propias no cambia cuánto tenés ahorrado, solo dónde está — así
    // que mueve lo apartado en LAS DOS cuentas y deja el saldo del ahorro
    // exactamente igual. Marcarlo como aporte lo contaba dos veces; como
    // retiro lo sacaba del ahorro. Ninguna de las dos era lo que pasó.
    const hoy = new Date().toISOString().slice(0, 10)
    const origen = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Traslado Origen', currency: 'USD', initial_balance: 500 }),
    }))).account
    const guarda = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Traslado A', currency: 'USD', initial_balance: 0 }),
    }))).account
    const guardaB = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Traslado B', currency: 'USD', initial_balance: 0 }),
    }))).account
    const metaT = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Traslado Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal
    const otraMeta = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Traslado Otra', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal

    await aportar({ goalId: metaT.id, fromId: origen.id, toId: guarda.id, amount: 120, date: hoy })
    await aportar({ goalId: otraMeta.id, fromId: origen.id, toId: guarda.id, amount: 80, date: hoy })

    const antes = await json(await api('/savings-goals'))
    eq('el ahorro arranca con 120', antes.goals.find(g => g.id === metaT.id)?.balance_usd, 120)
    const donde = antes.goals.find(g => g.id === metaT.id)?.by_account ?? []
    eq('y la app sabe en qué cuenta está', donde.length, 1)
    eq('con el monto correcto', donde[0]?.amount_usd, 120)

    const move = p => api(`/savings-goals/${metaT.id}/move`, { method: 'POST', body: JSON.stringify(p) })

    eq('mover a la misma cuenta → 400',
       (await move({ from_account_id: guarda.id, to_account_id: guarda.id, amount: 10 })).status, 400)
    eq('mover un monto en cero → 400',
       (await move({ from_account_id: guarda.id, to_account_id: guardaB.id, amount: 0 })).status, 400)

    // El tope es lo que hay DE ESTE AHORRO en esa cuenta (120), no lo apartado
    // en la cuenta (200: 120 de este ahorro + 80 del otro).
    const pasado = await move({ from_account_id: guarda.id, to_account_id: guardaB.id, amount: 150 })
    eq('mover más de lo que este ahorro tiene ahí → 400', pasado.status, 400)
    ok('y el error dice cuánto hay de ESTE ahorro',
       /120/.test((await json(pasado))?.error ?? ''), 'sin el monto')

    eq('desde una cuenta donde este ahorro no tiene nada → 400',
       (await move({ from_account_id: guardaB.id, to_account_id: guarda.id, amount: 10 })).status, 400)

    const movido = await json(await move({ from_account_id: guarda.id, to_account_id: guardaB.id, amount: 50 }))
    ok('el traslado se guarda', !!movido.transaction?.id, JSON.stringify(movido))
    eq('con la tercera dirección', movido.transaction.savings_flow, 'traslado')
    eq('y sin motivo: no se está rompiendo nada', movido.transaction.savings_reason, null)
    eq('es un movimiento, no ingreso ni gasto real', movido.transaction.flow_type, 'movimiento')

    const despues = await json(await api('/savings-goals'))
    const metaDespues = despues.goals.find(g => g.id === metaT.id)
    eq('el saldo del ahorro NO se movió un peso', metaDespues.balance_usd, 120)
    eq('pero ahora vive en dos cuentas', metaDespues.by_account.length, 2)
    eq('el otro ahorro sigue intacto', despues.goals.find(g => g.id === otraMeta.id)?.balance_usd, 80)

    const cuentas = (await json(await api('/accounts'))).accounts
    eq('la cuenta de origen aparta 200 − 50', cuentas.find(a => a.id === guarda.id)?.savings_balance, 150)
    eq('y la de destino los 50 que llegaron', cuentas.find(a => a.id === guardaB.id)?.savings_balance, 50)
    eq('los saldos reales también se movieron', cuentas.find(a => a.id === guardaB.id)?.balance, 50)

    // Un ahorro archivado no recibe movimientos nuevos, tampoco traslados.
    await api(`/savings-goals/${metaT.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    eq('trasladar un ahorro archivado → 400',
       (await move({ from_account_id: guarda.id, to_account_id: guardaB.id, amount: 10 })).status, 400)
    await api(`/savings-goals/${metaT.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })
  }

  section('SPRINT 7 (Ronda 9) · el mes pendiente avanza solo')
  {
    // BUG DE LA RONDA 9. El reparto global escribía una fila en
    // `fin_savings_closures` y `pendingSavingsPeriod` leía esa tabla para
    // saber qué mes faltaba. Al reemplazarlo por el botón por plan, nadie la
    // escribió más y **el mes pendiente quedó clavado para siempre**:
    // guardabas en todos tus planes, los botones desaparecían, y al mes
    // siguiente la app seguía ofreciendo organizar el mismo mes viejo. La
    // feature dejaba de funcionar en silencio a los treinta días de usarla.
    //
    // Ahora el mes pendiente es, siempre, el mes pasado.
    const hoyA = new Date().toISOString().slice(0, 10)
    const mesA = `${hoyA.slice(0, 7)}-01`
    const menos = n => {
      const [y, m] = mesA.split('-').map(Number)
      const k = y * 12 + (m - 1) - n
      return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`
    }
    const mesPasado = menos(1)

    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await api(`/savings-goals/${g.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    }

    const ctaAv = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Avance Cuenta', currency: 'USD', initial_balance: 5000 }),
    }))).account
    const metaAv = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Avance Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 50 }),
    }))).goal
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${metaAv.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${menos(3)}T00:00:00Z` }),
    })

    eq('el mes pendiente es el mes pasado, no el más viejo de la historia',
       (await json(await api('/savings-goals'))).pending_period, mesPasado)

    const guardarAv = await api(`/savings-goals/${metaAv.id}/save`, {
      method: 'POST', body: JSON.stringify({ period: mesPasado, from_account_id: ctaAv.id, amount: 50 }),
    })
    eq('se guarda para ese mes', guardarAv.status, 201)

    const trasAv = await json(await api('/savings-goals'))
    eq('el mes pendiente sigue siendo el pasado (el calendario no se movió)',
       trasAv.pending_period, mesPasado)
    const metaTras = trasAv.goals.find(g => g.id === metaAv.id)
    ok('pero ese plan ya no lo tiene por guardar',
       metaTras.saved_periods.includes(mesPasado), JSON.stringify(metaTras.saved_periods))

    // Un plan creado DESPUÉS del mes pasado no lo organiza.
    const nuevoAv = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Avance Nuevo', currency: 'USD', allocation_type: 'fixed', allocation_value: 10 }),
    }))).goal
    eq('un plan creado hoy no puede organizar el mes pasado → 400',
       (await api(`/savings-goals/${nuevoAv.id}/save`, {
         method: 'POST', body: JSON.stringify({ period: mesPasado, from_account_id: ctaAv.id, amount: 10 }),
       })).status, 400)

    await api(`/savings-goals/${nuevoAv.id}`, { method: 'DELETE' })
    await api(`/savings-goals/${metaAv.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
  }

  section('SPRINT 7 (revisión) · un fijo puede aportar a un ahorro')
  {
    const hoy = new Date().toISOString().slice(0, 10)
    const cats7 = await json(await api('/categories'))
    const comidaCat = cats7.categories.find(c => c.name === 'Comida' && c.kind === 'gasto')?.id
    const origen = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Fijo Ahorro Origen', currency: 'USD', initial_balance: 500 }),
    }))).account
    const destino = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Fijo Ahorro Destino', currency: 'USD' }),
    }))).account
    const meta = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Pagarme primero', currency: 'USD', allocation_type: 'fixed', allocation_value: 100 }),
    }))).goal

    // La cuenta destino se elige al REGISTRAR, no al crear (ajuste 2026-08-26):
    // la plantilla solo necesita saber a qué ahorro aporta.
    eq('un fijo de ahorro sin cuenta destino se crea igual',
       (await api('/recurring', {
         method: 'POST',
         body: JSON.stringify({ name: 'Sin destino', amount: 100, currency: 'USD', savings_goal_id: meta.id, account_id: origen.id }),
       })).status, 201)

    // La categoría se NORMALIZA en silencio, no se rechaza — mismo criterio
    // que `PATCH /transactions/[id]` al pasar un movimiento a transferencia.
    const conCategoria = await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Con categoría', amount: 100, currency: 'USD', account_id: origen.id,
        savings_goal_id: meta.id, to_account_id: destino.id, category_id: comidaCat,
      }),
    }))
    eq('un fijo de ahorro ignora la categoría que le manden', conCategoria.recurring?.category_id, null)

    // El destino ya no tiene que "ser de ahorro" — cualquier cuenta puede
    // alojarlos. La plantilla acepta incluso la misma cuenta que trae de
    // default como origen, porque el origen real se elige al REGISTRAR;
    // ahí sí se rechaza la transferencia a sí misma (ver más abajo).
    eq('el destino de un fijo de ahorro puede ser cualquier cuenta propia → 201',
       (await api('/recurring', {
         method: 'POST',
         body: JSON.stringify({
           name: 'Destino cualquiera', amount: 100, currency: 'USD', account_id: origen.id,
           savings_goal_id: meta.id, to_account_id: origen.id,
         }),
       })).status, 201)

    eq('pero una cuenta que no es tuya sigue siendo 400',
       (await api('/recurring', {
         method: 'POST',
         body: JSON.stringify({
           name: 'Destino ajeno', amount: 100, currency: 'USD', account_id: origen.id,
           savings_goal_id: meta.id, to_account_id: '00000000-0000-0000-0000-000000000000',
         }),
       })).status, 400)

    const fijo = (await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Ahorro mensual', amount: 100, currency: 'USD', account_id: origen.id,
        savings_goal_id: meta.id, to_account_id: destino.id, day_of_month: 1, starts_on: hoy,
      }),
    }))).recurring
    ok('crea el fijo de ahorro', !!fijo?.id)
    eq('sin categoría', fijo.category_id, null)
    eq('con su ahorro', fijo.savings_goal_id, meta.id)

    // El corazón del pedido: registrar genera una TRANSFERENCIA, no un gasto.
    const reg = await json(await api(`/recurring/${fijo.id}/register`, {
      method: 'POST', body: JSON.stringify({ account_id: origen.id, date: hoy }),
    }))
    eq('registrar genera una transferencia, no un gasto', reg.transaction?.type, 'transferencia')
    eq('y es un movimiento: no ensucia el gasto del mes', reg.transaction?.flow_type, 'movimiento')
    eq('va a la cuenta de ahorro', reg.transaction?.to_account_id, destino.id)
    eq('queda tageada con el ahorro', reg.transaction?.savings_goal_id, meta.id)
    eq('sin categoría', reg.transaction?.category_id, null)
    eq('no genera deudas', (reg.transaction?.debts ?? []).length, 0)

    // Y el saldo del ahorro lo refleja.
    const goalsTrasFijo = await json(await api('/savings-goals'))
    eq('el saldo del ahorro sube con el aporte del fijo',
       goalsTrasFijo.goals.find(g => g.id === meta.id)?.balance_usd, 100)

    // Idempotencia: el mismo período no se registra dos veces.
    eq('el mismo período no se registra dos veces → 409',
       (await api(`/recurring/${fijo.id}/register`, {
         method: 'POST', body: JSON.stringify({ account_id: origen.id, date: hoy }),
       })).status, 409)

    // Convertirlo de nuevo en gasto limpia las columnas del ahorro.
    const aGasto = await json(await api(`/recurring/${fijo.id}`, {
      method: 'PATCH', body: JSON.stringify({ savings_goal_id: null, to_account_id: null, category_id: comidaCat }),
    }))
    eq('volver a gasto limpia el ahorro', aGasto.recurring?.savings_goal_id, null)
    eq('y le devuelve la categoría', aGasto.recurring?.category_id, comidaCat)
  }

  section('SPRINT 7 (revisión) · lo que encontró el probe adversario')
  {
    const hoy = new Date().toISOString().slice(0, 10)
    const org = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Probe origen', currency: 'USD', initial_balance: 500 }),
    }))).account
    const dst = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Probe ahorro', currency: 'USD' }),
    }))).account
    const gol = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Probe meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 25 }),
    }))).goal
    const fij = (await json(await api('/recurring', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Probe fijo', amount: 25, currency: 'USD', account_id: org.id,
        savings_goal_id: gol.id, to_account_id: dst.id, starts_on: hoy,
      }),
    }))).recurring

    // El "aporte fantasma" que motivó este bloque ya no puede existir:
    // desapareció la marca de cuenta que se podía desmarcar por debajo. Lo
    // que queda protegido son los borrados con referencias vivas.

    // Borrar el ahorro / la cuenta que un fijo usa: 409 legible, nunca el
    // mensaje crudo del constraint de Postgres.
    const delGoal = await api(`/savings-goals/${gol.id}`, { method: 'DELETE' })
    eq('borrar un ahorro que un fijo usa → 409', delGoal.status, 409)
    const bodyGoal = await json(delGoal)
    ok('y el error nombra el fijo, no el constraint',
       typeof bodyGoal?.error === 'string' && bodyGoal.error.includes('Probe fijo'), JSON.stringify(bodyGoal))

    const delAcc = await api(`/accounts/${dst.id}`, { method: 'DELETE' })
    eq('borrar la cuenta que un fijo usa → 409', delAcc.status, 409)
    const bodyAcc = await json(delAcc)
    ok('con mensaje legible',
       typeof bodyAcc?.error === 'string' && !/violates foreign key/i.test(bodyAcc.error), JSON.stringify(bodyAcc))

    // Archivar el ahorro no puede congelar su fijo (clase b08fdb4).
    await api(`/savings-goals/${gol.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    eq('con el ahorro archivado, el fijo se sigue pudiendo pausar',
       (await api(`/recurring/${fij.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })).status, 200)
  }

  section('SPRINT 7 (Ronda 8) · el sobrante descuenta lo que los fijos ya guardaron')
  {
    // Un aporte es una `transferencia` (`flow_type: 'movimiento'`), así que ni
    // `ingresoUsd` ni `gastoUsd` lo miran: con un fijo de ahorro corriendo, el
    // reparto proponía repartir el sobrante ENTERO, incluido lo que el fijo ya
    // se había llevado. Te pedía ahorrar plata que ya estaba ahorrada.
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await api(`/savings-goals/${g.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    }

    // El mes pasado: desde la Ronda 9 es SIEMPRE el período pendiente, y cada
    // plan responde por su cuenta, así que dos secciones pueden compartirlo.
    const hoyS = new Date().toISOString().slice(0, 10)
    const mesActual = `${hoyS.slice(0, 7)}-01`
    const [ay, am] = mesActual.split('-').map(Number)
    const tot = ay * 12 + (am - 1) - 1
    const mesPrevio = `${Math.floor(tot / 12)}-${String((tot % 12) + 1).padStart(2, '0')}-01`
    const diaPrevio = d => `${mesPrevio.slice(0, 7)}-${String(d).padStart(2, '0')}`

    const cta = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Neto Cuenta', currency: 'USD', initial_balance: 2000 }),
    }))).account
    const guarda = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Neto Guarda', currency: 'USD', initial_balance: 0 }),
    }))).account
    const metaNeto = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'Neto Meta', currency: 'USD', is_catchall: true }),
    }))).goal
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${metaNeto.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPrevio}T00:00:00Z` }),
    })

    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'ingreso', date: diaPrevio(3), account_id: cta.id, amount: 1000 }),
    })
    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'gasto', date: diaPrevio(8), account_id: cta.id, amount: 600 }),
    })

    const bruto = await json(await api('/savings-goals'))
    eq('el mes pasado queda pendiente', bruto.pending_period, mesPrevio)
    // Contra la línea de base: otras secciones también dejaron plata en ese mes.
    const base = bruto.pending_surplus_usd

    await aportar({ goalId: metaNeto.id, fromId: cta.id, toId: guarda.id, amount: 100, date: diaPrevio(15) })
    const neto = await json(await api('/savings-goals'))
    eq('el aporte del fijo se descuenta del sobrante', neto.pending_surplus_usd, Math.round((base - 100) * 100) / 100)

    // Un traslado no ahorra nada nuevo: no puede tocarlo.
    await api(`/savings-goals/${metaNeto.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ from_account_id: guarda.id, to_account_id: cta.id, amount: 40, date: diaPrevio(20) }),
    })
    eq('un traslado no mueve el sobrante',
       (await json(await api('/savings-goals'))).pending_surplus_usd, Math.round((base - 100) * 100) / 100)

    // Y un aporte de OTRO mes tampoco toca este.
    await aportar({ goalId: metaNeto.id, fromId: cta.id, toId: guarda.id, amount: 250, date: hoyS })
    eq('un aporte de este mes no toca el sobrante del pasado',
       (await json(await api('/savings-goals'))).pending_surplus_usd, Math.round((base - 100) * 100) / 100)

    // Y guardar por el camino nuevo tampoco lo descuenta dos veces: el aporte
    // del reparto NO lleva `recurring_id`, así que no entra en la resta.
    const antesDeGuardar = (await json(await api('/savings-goals'))).pending_surplus_usd
    await api(`/savings-goals/${metaNeto.id}/save`, {
      method: 'POST',
      body: JSON.stringify({ period: mesPrevio, from_account_id: cta.id, amount: 30 }),
    })
    eq('guardar del mes no vuelve a bajar su propio sobrante',
       (await json(await api('/savings-goals'))).pending_surplus_usd, antesDeGuardar)
  }

  section('SPRINT 7 (Ronda 9) · "Ahorrar" plan por plan')
  {
    // El reparto dejó de ser un trámite mensual global: cada plan tiene su
    // botón. Lo que se prueba es lo que cambió — que el origen salga de dónde
    // quedó la plata DEL MES, que se pueda guardar sin mover de cuenta, y que
    // el botón se apague una vez por mes y por plan.
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await api(`/savings-goals/${g.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    }

    const hoyR9 = new Date().toISOString().slice(0, 10)
    const [ry, rm] = `${hoyR9.slice(0, 7)}-01`.split('-').map(Number)
    const nR9 = ry * 12 + (rm - 1) - 1
    const mesR9 = `${Math.floor(nR9 / 12)}-${String((nR9 % 12) + 1).padStart(2, '0')}-01`
    const diaR9 = d => `${mesR9.slice(0, 7)}-${String(d).padStart(2, '0')}`

    const bancoR9 = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'R9 Banco', currency: 'USD', initial_balance: 0 }),
    }))).account
    const quietaR9 = (await json(await api('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'R9 Quieta', currency: 'USD', initial_balance: 0 }),
    }))).account
    const metaR9 = (await json(await api('/savings-goals', {
      method: 'POST', body: JSON.stringify({ name: 'R9 Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 100 }),
    }))).goal
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${metaR9.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesR9}T00:00:00Z` }),
    })

    await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'ingreso', date: diaR9(3), account_id: bancoR9.id, amount: 500 }),
    })
    await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'gasto', date: diaR9(9), account_id: bancoR9.id, amount: 100 }),
    })

    const payloadR9 = await json(await api('/savings-goals'))
    eq('el mes pendiente es el que terminó', payloadR9.pending_period, mesR9)
    eq('el mes dejó 500 − 100 en la cuenta que lo recibió',
       payloadR9.available_funds.find(f => f.account_id === bancoR9.id)?.available, 400)
    ok('una cuenta que el mes no tocó no figura',
       !payloadR9.available_funds.some(f => f.account_id === quietaR9.id), JSON.stringify(payloadR9.available_funds))

    const guardar = body => api(`/savings-goals/${metaR9.id}/save`, { method: 'POST', body: JSON.stringify(body) })

    eq('guardar más de lo que dejó el mes → 400',
       (await guardar({ period: mesR9, from_account_id: bancoR9.id, amount: 450 })).status, 400)
    eq('guardar desde una cuenta que el mes no tocó → 400',
       (await guardar({ period: mesR9, from_account_id: quietaR9.id, amount: 10 })).status, 400)

    // Sin cuenta destino: se guarda en la misma, el saldo no se mueve.
    const antesR9 = (await json(await api('/accounts'))).accounts.find(a => a.id === bancoR9.id)
    const guardadoR9 = await json(await guardar({ period: mesR9, from_account_id: bancoR9.id, amount: 250 }))
    ok('se guarda sin mover de cuenta', !!guardadoR9.transaction?.id, JSON.stringify(guardadoR9))
    eq('origen y destino son la misma cuenta', guardadoR9.transaction.to_account_id, bancoR9.id)
    eq('con el período del mes que organiza', guardadoR9.transaction.savings_period?.slice(0, 10), mesR9)
    eq('y es un aporte', guardadoR9.transaction.savings_flow, 'aporte')

    const despuesR9 = (await json(await api('/accounts'))).accounts.find(a => a.id === bancoR9.id)
    eq('el saldo de la cuenta no se movió', despuesR9.balance, antesR9.balance)
    eq('pero ahora tiene 250 apartados', despuesR9.savings_balance, 250)

    const conSaldoR9 = (await json(await api('/savings-goals'))).goals.find(g => g.id === metaR9.id)
    eq('el ahorro subió 250', conSaldoR9.balance_usd, 250)
    ok('y el mes queda marcado', conSaldoR9.saved_periods.includes(mesR9), JSON.stringify(conSaldoR9.saved_periods))

    eq('guardar dos veces el mismo mes en el mismo plan → 409',
       (await guardar({ period: mesR9, from_account_id: bancoR9.id, amount: 10 })).status, 409)

    eq('lo guardado deja de figurar como disponible',
       (await json(await api('/savings-goals'))).available_funds.find(f => f.account_id === bancoR9.id)?.available, 150)
  }

  section('SPRINT 7 · /bootstrap incluye ahorros')
  {
    const boot = await json(await api('/bootstrap'))
    ok('el payload trae savings con su forma esperada',
       boot.savings && Array.isArray(boot.savings.goals) && 'pending_period' in boot.savings,
       JSON.stringify(boot.savings))
  }

  /* ════════════════════════════════════════════════════════════════════════
     SPRINT 8 · Perfiles
     ════════════════════════════════════════════════════════════════════════ */

  section('SPRINT 8 · el perfil default existe solo')
  {
    const boot = await json(await api('/bootstrap'))
    ok('bootstrap trae el perfil activo', typeof boot.profile === 'string' && boot.profile.length > 0, JSON.stringify(boot.profile))
    ok('y la lista de perfiles', Array.isArray(boot.profiles) && boot.profiles.length >= 1, JSON.stringify(boot.profiles))

    const p = await json(await api('/profiles'))
    const def = p.profiles.find(x => x.is_default)
    ok('hay exactamente un default', p.profiles.filter(x => x.is_default).length === 1)
    eq('y es el activo', p.active, def.id)
    eq('nace en verde', def.accent, 'verde')
    ok('y con historia, porque este usuario ya cargó de todo', def.has_movements)
  }

  let empresa = null
  section('SPRINT 8 · crear un perfil')
  {
    const r = await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Empresa' }) })
    eq('lo crea', r.status, 201)
    empresa = (await json(r)).profile
    eq('no es default', empresa.is_default, false)
    eq('y toma el siguiente color libre', empresa.accent, 'naranja')

    eq('sin nombre → 400', (await api('/profiles', { method: 'POST', body: JSON.stringify({ name: '  ' }) })).status, 400)
    eq('nombre repetido → 400', (await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Empresa' }) })).status, 400)
    eq('color inexistente → cae al siguiente libre, no falla',
       (await json(await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Tercero', accent: 'azul' }) }))).profile.accent, 'violeta')
  }

  section('SPRINT 8 · el perfil nuevo nace vacío pero usable')
  {
    const boot = await json(await api(`/bootstrap?profile=${empresa.id}`))
    eq('el server confirma el perfil pedido', boot.profile, empresa.id)
    eq('sin cuentas', boot.accounts.length, 0)
    eq('patrimonio en cero', boot.total_usd, 0)
    eq('sin personas', boot.people.length, 0)
    eq('sin fijos', boot.recurring.recurring.length, 0)
    eq('sin deudas', boot.shared.por_cobrar_usd, 0)
    eq('sin ahorros', boot.savings.goals.length, 0)
    eq('pero con sus 14 categorías sembradas', boot.categories.length, 14)
    ok('y con la tasa global, que no es del perfil', boot.rates.BOB > 0, JSON.stringify(boot.rates))
  }

  section('SPRINT 8 · barrido de aislamiento — lo del default no se ve desde la empresa')
  {
    // Un movimiento propio, para no depender de lo que dejaron las secciones
    // anteriores (varias borran lo que crean).
    await api('/transactions', { method: 'POST', body: JSON.stringify({
      type: 'gasto', date: '2026-08-20', account_id: airtm.id, amount: 3, description: 'Marca de aislamiento',
    })})

    const dflt = await json(await api('/bootstrap'))
    const emp  = await json(await api(`/bootstrap?profile=${empresa.id}`))

    ok('el default sí tiene cuentas', dflt.accounts.length > 0)
    eq('la empresa no ve ninguna', emp.accounts.length, 0)
    ok('el default tiene movimientos', dflt.tx.recent.transactions.length > 0)
    eq('la empresa no ve ninguno', emp.tx.recent.transactions.length, 0)
    ok('el default tiene personas', dflt.people.length > 0)
    eq('la empresa no ve ninguna', emp.people.length, 0)
    ok('los patrimonios son distintos', dflt.total_usd !== emp.total_usd, `${dflt.total_usd} vs ${emp.total_usd}`)

    // Las listas sueltas, por si alguna ruta se quedó sin el filtro.
    for (const [ruta, saca] of [
      ['/accounts',      d => d.accounts.length],
      ['/transactions',  d => d.transactions.length],
      ['/people',        d => d.people.length],
      ['/recurring',     d => d.recurring.length],
      ['/savings-goals', d => d.goals.length],
      ['/debt-plans',    d => d.plans.length],
      ['/pasanaku',      d => d.pasanaku.length],
    ]) {
      const sep = ruta.includes('?') ? '&' : '?'
      eq(`${ruta} no filtra nada de otro perfil`, saca(await json(await api(`${ruta}${sep}profile=${empresa.id}`))), 0)
    }
  }

  section('SPRINT 8 · escribir en un perfil no toca al otro')
  {
    const cuenta = (await json(await api(`/accounts?profile=${empresa.id}`, {
      method: 'POST', body: JSON.stringify({ name: 'Caja empresa', currency: 'USD', initial_balance: 500 }),
    }))).account
    ok('la cuenta se crea en la empresa', !!cuenta?.id)

    const emp = await json(await api(`/bootstrap?profile=${empresa.id}`))
    eq('y el patrimonio de la empresa la refleja', emp.total_usd, 500)

    const dflt = await json(await api('/bootstrap'))
    ok('el default no la ve', !dflt.accounts.some(a => a.id === cuenta.id))
    ok('y su patrimonio no se movió', dflt.total_usd !== 500)
  }

  section('SPRINT 8 · los únicos que cambiaron de alcance (§3.2.1)')
  {
    // Cada uno de estos era "único por usuario" y ahora es "único por perfil".
    // Sin migrarlos, el segundo perfil recibiría un duplicate key.
    const cat = await api(`/categories?profile=${empresa.id}`, {
      method: 'POST', body: JSON.stringify({ name: 'Comida', kind: 'gasto' }) })
    ok('una categoría con el mismo nombre que en el otro perfil… ya existe en este, así que 409',
       cat.status === 409 || cat.status === 400, `HTTP ${cat.status}`)

    const persona = await api(`/people?profile=${empresa.id}`, {
      method: 'POST', body: JSON.stringify({ name: 'Ana' }) })
    eq('la MISMA persona puede existir en los dos perfiles', persona.status, 201)

    const cajon = await api(`/savings-goals?profile=${empresa.id}`, {
      method: 'POST', body: JSON.stringify({
        name: 'Sobrante', currency: 'USD', is_catchall: true }) })
    ok('y cada perfil puede tener su propio cajón de sastre', cajon.status === 201, `HTTP ${cajon.status}`)
  }

  section('SPRINT 8 · un ?profile inválido cae al default, no rompe')
  {
    const otro = await json(await api('/bootstrap?profile=00000000-0000-0000-0000-000000000000'))
    const def  = (await json(await api('/profiles'))).profiles.find(p => p.is_default)
    eq('un id que no existe cae al default', otro.profile, def.id)
    ok('y devuelve los datos del default, no un error', otro.accounts.length > 0)
  }

  section('SPRINT 8 · renombrar y recolorear')
  {
    const r = await api(`/profiles/${empresa.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Acero SRL', accent: 'magenta' }) })
    eq('renombra y recolorea', r.status, 200)
    const p = (await json(r)).profile
    eq('el nombre nuevo', p.name, 'Acero SRL')
    eq('el color nuevo', p.accent, 'magenta')

    const def = (await json(await api('/profiles'))).profiles.find(x => x.is_default)
    eq('el default también se puede renombrar: es indeleble, no inmutable',
       (await api(`/profiles/${def.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Daniel' }) })).status, 200)
    await api(`/profiles/${def.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Personal' }) })

    eq('un color fuera de la paleta → 400',
       (await api(`/profiles/${empresa.id}`, { method: 'PATCH', body: JSON.stringify({ accent: 'azul' }) })).status, 400)
  }

  section('SPRINT 8 · borrar y archivar')
  {
    const def = (await json(await api('/profiles'))).profiles.find(p => p.is_default)
    eq('el default no se borra', (await api(`/profiles/${def.id}`, { method: 'DELETE' })).status, 409)
    eq('ni se archiva', (await api(`/profiles/${def.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) })).status, 409)

    // La empresa tiene una cuenta: no se borra, se archiva.
    const conDatos = await api(`/profiles/${empresa.id}`, { method: 'DELETE' })
    eq('un perfil con movimientos → 409', conDatos.status, 409)
    ok('y dice por qué, para que la UI ofrezca archivar', (await json(conDatos)).has_movements === true)

    const arch = await api(`/profiles/${empresa.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) })
    eq('archivar sí', arch.status, 200)
    ok('sale del selector', !(await json(await api('/profiles'))).profiles.find(p => p.id === empresa.id && !p.archived))

    const boot = await json(await api(`/bootstrap?profile=${empresa.id}`))
    ok('y pedir un perfil archivado cae al default', boot.profile !== empresa.id)

    eq('reactivar lo devuelve',
       (await api(`/profiles/${empresa.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: false }) })).status, 200)

    // Un perfil vacío de verdad sí se borra.
    const vacio = (await json(await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'Descartable' }) }))).profile
    eq('un perfil sin nada se borra', (await api(`/profiles/${vacio.id}`, { method: 'DELETE' })).status, 200)
    ok('y desaparece', !(await json(await api('/profiles'))).profiles.some(p => p.id === vacio.id))
  }

  section('SPRINT 8 (revisión) · el borrado fallido no deja daño')
  {
    // BUG encontrado en revisión: el DELETE borraba las categorías ANTES de
    // intentar borrar el perfil. Con cualquier otro dato cargado el segundo
    // delete fallaba, la ruta devolvía 409… y las 14 categorías ya no estaban.
    // El perfil quedaba vivo e inutilizable, sin que nada lo dijera.
    const p = (await json(await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'ConPersona' }) }))).profile

    // Una persona: ni cuentas ni movimientos, pero el perfil NO está vacío.
    eq('se le carga una persona', (await api(`/people?profile=${p.id}`, {
      method: 'POST', body: JSON.stringify({ name: 'Proveedor' }) })).status, 201)

    const lista = (await json(await api('/profiles'))).profiles.find(x => x.id === p.id)
    ok('un perfil con solo una persona NO se reporta vacío', lista.has_movements === true,
       `has_movements=${lista.has_movements}`)

    const antes = (await json(await api(`/categories?profile=${p.id}`))).categories.length
    eq('tiene sus 14 categorías', antes, 14)

    eq('borrarlo devuelve 409', (await api(`/profiles/${p.id}`, { method: 'DELETE' })).status, 409)

    ok('el perfil sigue existiendo', (await json(await api('/profiles'))).profiles.some(x => x.id === p.id))
    eq('y NO perdió sus categorías', (await json(await api(`/categories?profile=${p.id}`))).categories.length, 14)

    // Lo mismo con un ahorro, que tampoco es "movimiento".
    const q = (await json(await api('/profiles', { method: 'POST', body: JSON.stringify({ name: 'ConAhorro' }) }))).profile
    await api(`/savings-goals?profile=${q.id}`, { method: 'POST', body: JSON.stringify({
      name: 'Meta', currency: 'USD', allocation_type: 'fixed', allocation_value: 50 }) })
    eq('un perfil con solo un ahorro tampoco se borra', (await api(`/profiles/${q.id}`, { method: 'DELETE' })).status, 409)
    eq('y conserva sus categorías', (await json(await api(`/categories?profile=${q.id}`))).categories.length, 14)
  }

  section('SPRINT 8 (uso real) · la cookie sola aísla, sin ?profile= en ninguna llamada')
  {
    // El bug que reportó el usuario: cosas creadas en un perfil aparecían en
    // otro. La causa no era el server —que siempre filtró bien— sino que la
    // corrección dependía de que ~50 puntos de llamada del cliente se acordaran
    // de agregar `?profile=`. Tres formas de escribir un fetch se lo saltaron,
    // todas en silencio.
    //
    // Ahora el perfil viaja en la cookie `fz_profile`. Esta sección prueba
    // exactamente eso: NINGUNA llamada de acá lleva `?profile=`, igual que un
    // fetch que se "olvidó", y el aislamiento tiene que aguantar igual.
    const conPerfil = (id) => (path, init = {}) => fetch(`${BASE}/api/finanzas${path}`, {
      ...init,
      headers: { Cookie: `${COOKIE}; fz_profile=${id}`, 'Content-Type': 'application/json', ...init.headers },
    })

    const principal = (await json(await api('/profiles'))).profiles.find(p => p.is_default)
    const otro = (await json(await api('/profiles', {
      method: 'POST', body: JSON.stringify({ name: 'SoloCookie' }) }))).profile

    const enOtro = conPerfil(otro.id)
    const enPrincipal = conPerfil(principal.id)

    eq('la cookie decide el perfil activo', (await json(await enOtro('/bootstrap'))).profile, otro.id)

    // Crear de todo, sin un solo ?profile=.
    const cuenta = (await json(await enOtro('/accounts', {
      method: 'POST', body: JSON.stringify({ name: 'Caja cookie', currency: 'USD', initial_balance: 300 }) }))).account
    ok('la cuenta se crea', !!cuenta?.id)
    await enOtro('/people', { method: 'POST', body: JSON.stringify({ name: 'ProveedorCookie' }) })
    await enOtro('/categories', { method: 'POST', body: JSON.stringify({ name: 'HonorariosCookie', kind: 'gasto' }) })
    await enOtro('/transactions', { method: 'POST', body: JSON.stringify({
      type: 'gasto', date: '2026-08-27', account_id: cuenta.id, amount: 20, description: 'GastoCookie' }) })

    const b = await json(await enOtro('/bootstrap'))
    eq('todo quedó en su perfil: cuentas', b.accounts.length, 1)
    ok('personas', b.people.some(p => p.name === 'ProveedorCookie'))
    ok('categorías', b.categories.some(c => c.name === 'HonorariosCookie'))
    ok('movimientos', b.tx.recent.transactions.some(t => t.description === 'GastoCookie'))

    // `useTransactions` pedía /transactions sin perfil y mostraba los del
    // default. Es la lectura que más se nota: la pantalla de Movimientos.
    eq('Movimientos solo muestra los de este perfil',
       (await json(await enOtro('/transactions?limit=100'))).transactions.length, 1)

    // Y el principal, intacto.
    const p = await json(await enPrincipal('/bootstrap'))
    ok('el principal no ve la cuenta del otro', !p.accounts.some(a => a.name === 'Caja cookie'))
    ok('ni su persona', !p.people.some(x => x.name === 'ProveedorCookie'))
    ok('ni su categoría', !p.categories.some(c => c.name === 'HonorariosCookie'))
    ok('ni su movimiento', !p.tx.recent.transactions.some(t => t.description === 'GastoCookie'))

    // `?profile=` sigue mandando sobre la cookie: es lo que usa esta suite.
    eq('el query param gana sobre la cookie',
       (await json(await enOtro(`/bootstrap?profile=${principal.id}`))).profile, principal.id)
  }
}

await setup()
try { await run() } finally {
  await adminFetch(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
  console.log('\nUsuario de API eliminado (cascade borró sus datos).')
}
process.exit(summary() === 0 ? 0 : 1)
