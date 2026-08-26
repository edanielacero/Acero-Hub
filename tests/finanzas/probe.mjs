/**
 * Probe adversario de Fijos + Ahorros.
 *
 * NO es una suite de confirmación: cada caso de acá está escrito para INTENTAR
 * romper algo que el código debería sostener, no para repetir lo que ya se sabe
 * que anda. Se corre solo:
 *
 *   FZ_BASE_URL=http://localhost:3000 node tests/finanzas/probe.mjs
 *
 * Lo que sobreviva y valga la pena se promueve a api.mjs.
 */
import { URL_, SRV, ANON } from './env.mjs'
import { eq, ok, section, summary, sweepTestUsers } from './harness.mjs'

const BASE = process.env.FZ_BASE_URL ?? 'http://localhost:3001'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

const adminFetch = (p, i = {}) => fetch(`${URL_}${p}`, {
  ...i, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...i.headers },
})

const EMAIL = `fz-probe-${Date.now()}@acerotest.local`
const PASSWORD = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
let USER_ID = null, COOKIE = null

async function setup() {
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
  COOKIE = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`
  console.log(`Probe: ${EMAIL}\n`)
}

const api = (path, init = {}) => fetch(`${BASE}/api/finanzas${path}`, {
  ...init, headers: { Cookie: COOKIE, 'Content-Type': 'application/json', ...init.headers },
})
const json = async r => { try { return await r.json() } catch { return null } }
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) })
const patch = (p, body) => api(p, { method: 'PATCH', body: JSON.stringify(body) })

const cuenta = async (name, extra = {}) =>
  (await json(await post('/accounts', { name, currency: 'USD', initial_balance: 1000, ...extra }))).account
const ahorro = async (name, extra = {}) =>
  (await json(await post('/savings-goals', { name, currency: 'USD', allocation_type: 'fixed', allocation_value: 50, ...extra }))).goal

const HOY = new Date().toISOString().slice(0, 10)
const MES = `${HOY.slice(0, 7)}-01`
const addMonths = (p, n) => {
  const [y, m] = p.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}

async function run() {
  await post('/seed', {})
  const cats = (await json(await api('/categories'))).categories
  const comida = cats.find(c => c.name === 'Comida' && c.kind === 'gasto').id

  section('A · Fijo de ahorro CROSS-CURRENCY: se congela lo que llegó')
  {
    const origenBs = (await json(await post('/accounts', {
      name: 'Origen Bs', currency: 'BOB', initial_balance: 5000,
    }))).account
    const ahorroUsd = await cuenta('Ahorro USD X', { initial_balance: 0 })
    const meta = await ahorro('Cross')

    const fijo = (await json(await post('/recurring', {
      name: 'Aporte Bs', amount: 696, currency: 'BOB', account_id: origenBs.id,
      savings_goal_id: meta.id, to_account_id: ahorroUsd.id, day_of_month: 1, starts_on: HOY,
    }))).recurring
    ok('crea el fijo cross-currency', !!fijo?.id)

    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: origenBs.id, date: HOY }))
    eq('es transferencia', reg.transaction?.type, 'transferencia')
    ok('congela el lado que LLEGÓ (to_amount)', reg.transaction?.to_amount != null,
       `to_amount=${reg.transaction?.to_amount}`)
    ok('y su USD congelado', reg.transaction?.to_amount_usd != null,
       `to_amount_usd=${reg.transaction?.to_amount_usd}`)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    // El ahorro tiene que reflejar lo que ENTRÓ a la cuenta de ahorro (USD),
    // no lo que salió en Bs.
    ok('el saldo del ahorro refleja lo que llegó, no lo que salió',
       Math.abs(g.balance_usd - Number(reg.transaction.to_amount_usd)) < 0.02,
       `saldo=${g.balance_usd} llegó=${reg.transaction?.to_amount_usd}`)
  }




  section('E · Un fijo de ahorro NO cuenta como comprometido de presupuesto')
  {
    const origen = await cuenta('E origen')
    const dest = await cuenta('E ahorro', { initial_balance: 0 })
    const meta = await ahorro('E meta')
    const linea = (await json(await post('/budgets', { category_ids: [comida], amount: 500 }))).line

    const antes = (await json(await api('/budgets'))).categories.find(c => c.line_id === linea.id)
    await post('/recurring', {
      name: 'E fijo ahorro', amount: 80, currency: 'USD', account_id: origen.id,
      savings_goal_id: meta.id, to_account_id: dest.id, starts_on: HOY,
    })
    const despues = (await json(await api('/budgets'))).categories.find(c => c.line_id === linea.id)
    eq('el comprometido no se mueve por un fijo de ahorro',
       despues.committed_usd, antes.committed_usd)
    await api(`/budgets/${linea.id}`, { method: 'DELETE' })
  }

  section('F · Registrar un fijo de ahorro no reduce el sobrante del mes')
  {
    const origen = await cuenta('F origen')
    const dest = await cuenta('F ahorro', { initial_balance: 0 })
    const meta = await ahorro('F meta')
    // Un mes pasado con ingreso/gasto reales, para poder medir el sobrante.
    const prev = addMonths(MES, -1)
    const prevDia = `${prev.slice(0, 7)}-15`
    await post('/transactions', { type: 'ingreso', date: prevDia, account_id: origen.id, amount: 400 })
    await post('/transactions', { type: 'gasto', date: prevDia, account_id: origen.id, category_id: comida, amount: 100 })

    const fijo = (await json(await post('/recurring', {
      name: 'F fijo', amount: 50, currency: 'USD', account_id: origen.id,
      savings_goal_id: meta.id, to_account_id: dest.id, day_of_month: 15, starts_on: prevDia,
    }))).recurring
    await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: prevDia })

    // El ahorro nace HOY, así que no habría período pendiente y la propuesta
    // saldría vacía. Se retrocede su created_at para que el mes pasado exista
    // como pregunta — mismo truco que ya usa api.mjs para el cierre.
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${meta.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${prev}T00:00:00Z` }),
    })

    const prop = await json(await api(`/savings-goals/close?today=${HOY}`))
    eq('el mes pasado queda pendiente', prop.pending_period, prev)
    eq('el sobrante sigue siendo 400 − 100 = 300, el aporte no lo tocó', prop.surplus_usd, 300)
  }

  section('G · Regresión: un fijo NORMAL sigue siendo un gasto con su reparto')
  {
    const origen = await cuenta('G origen')
    const persona = (await json(await post('/people', { name: 'Socio G' }))).person
    const fijo = (await json(await post('/recurring', {
      name: 'G fijo', amount: 60, currency: 'USD', account_id: origen.id,
      category_id: comida, starts_on: HOY,
      splits: [{ person_id: persona.id, amount: null }],
    }))).recurring
    ok('crea el fijo normal con reparto', !!fijo?.id)

    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: HOY }))
    eq('sigue siendo un gasto', reg.transaction?.type, 'gasto')
    eq('y consumo real', reg.transaction?.flow_type, 'consumo')
    eq('conserva su categoría', reg.transaction?.category_id, comida)
    ok('y genera la deuda del reparto', (reg.debts ?? reg.transaction?.debts ?? []).length > 0,
       JSON.stringify(reg).slice(0, 200))
  }

  section('H · Regresión: la validación del fijo ANUAL sigue viva tras el refactor')
  {
    const origen = await cuenta('H origen')
    eq('anual sin mes → 400',
       (await post('/recurring', {
         name: 'H anual', amount: 10, currency: 'USD', account_id: origen.id,
         category_id: comida, frequency: 'anual',
       })).status, 400)
    eq('día 45 → 400',
       (await post('/recurring', {
         name: 'H dia', amount: 10, currency: 'USD', account_id: origen.id,
         category_id: comida, day_of_month: 45,
       })).status, 400)

    const dest = await cuenta('H ahorro', { initial_balance: 0 })
    const meta = await ahorro('H meta')
    eq('un fijo de AHORRO anual sin mes también → 400',
       (await post('/recurring', {
         name: 'H ahorro anual', amount: 10, currency: 'USD', account_id: origen.id,
         savings_goal_id: meta.id, to_account_id: dest.id, frequency: 'anual',
       })).status, 400)
    eq('y con día inválido también',
       (await post('/recurring', {
         name: 'H ahorro dia', amount: 10, currency: 'USD', account_id: origen.id,
         savings_goal_id: meta.id, to_account_id: dest.id, day_of_month: 0,
       })).status, 400)
  }

  section('I · Borrar el movimiento de un fijo de ahorro devuelve el saldo')
  {
    const origen = await cuenta('I origen')
    const dest = await cuenta('I ahorro', { initial_balance: 0 })
    const meta = await ahorro('I meta')
    const fijo = (await json(await post('/recurring', {
      name: 'I fijo', amount: 40, currency: 'USD', account_id: origen.id,
      savings_goal_id: meta.id, to_account_id: dest.id, starts_on: HOY,
    }))).recurring
    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: HOY }))

    const conAporte = (await json(await api('/savings-goals'))).goals.find(g => g.id === meta.id)
    eq('el ahorro subió 40', conAporte.balance_usd, 40)

    await api(`/transactions/${reg.transaction.id}`, { method: 'DELETE' })
    const sinAporte = (await json(await api('/savings-goals'))).goals.find(g => g.id === meta.id)
    eq('borrado el movimiento, el ahorro vuelve a 0', sinAporte.balance_usd, 0)

    // Y el fijo vuelve a estar pendiente en ese período.
    const fijos = (await json(await api('/recurring'))).recurring.find(r => r.id === fijo.id)
    ok('y el fijo vuelve a pedirse', fijos.status !== 'registrado', `status=${fijos.status}`)
  }

  section('J · Editar el movimiento de un fijo de ahorro no pierde el tageo')
  {
    const origen = await cuenta('J origen')
    const dest = await cuenta('J ahorro', { initial_balance: 0 })
    const meta = await ahorro('J meta')
    const fijo = (await json(await post('/recurring', {
      name: 'J fijo', amount: 30, currency: 'USD', account_id: origen.id,
      savings_goal_id: meta.id, to_account_id: dest.id, starts_on: HOY,
    }))).recurring
    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: HOY }))

    const ed = await json(await patch(`/transactions/${reg.transaction.id}`, { description: 'nota nueva' }))
    eq('conserva el ahorro tras editar la descripción', ed.transaction?.savings_goal_id, meta.id)
    eq('sigue siendo transferencia', ed.transaction?.type, 'transferencia')

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('y el saldo del ahorro no cambió', g.balance_usd, 30)
  }

  section('K · Un retiro no puede sacar más de lo que la cuenta de ahorro tiene')
  {
    const origen = await cuenta('K origen')
    const dest = await cuenta('K ahorro', { initial_balance: 0 })
    const meta = await ahorro('K meta')
    await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: origen.id, to_account_id: dest.id,
      amount: 20, savings_goal_id: meta.id,
    })
    eq('retirar más de lo que hay → 400',
       (await post('/transactions', {
         type: 'gasto', date: HOY, account_id: dest.id, amount: 999,
         savings_goal_id: meta.id, savings_reason: 'emergencia',
       })).status, 400)
  }

  section('L · Un fijo compartido convertido en ahorro no arrastra sus deudas')
  {
    const origen = await cuenta('L origen')
    const dest = await cuenta('L ahorro', { initial_balance: 0 })
    const meta = await ahorro('L meta')
    const persona = (await json(await post('/people', { name: 'Socio L' }))).person

    const fijo = (await json(await post('/recurring', {
      name: 'L fijo', amount: 60, currency: 'USD', account_id: origen.id,
      category_id: comida, starts_on: HOY,
      splits: [{ person_id: persona.id, amount: null }],
    }))).recurring

    // Se convierte en fijo de ahorro SIN mandar splits: las partes viejas
    // siguen en la base.
    const conv = await patch(`/recurring/${fijo.id}`, {
      savings_goal_id: meta.id, to_account_id: dest.id, category_id: null,
    })
    eq('la conversión se acepta', conv.status, 200)

    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: HOY }))
    eq('registra como transferencia', reg.transaction?.type, 'transferencia')
    eq('y NO genera deudas colgando de una transferencia',
       (reg.debts ?? reg.transaction?.debts ?? []).length, 0)
  }

  section('M · Regresión: POST /budgets sigue creando la línea')
  {
    const r = await post('/budgets', { category_ids: [comida], amount: 80 })
    const body = await json(r)
    eq('POST /budgets responde 201', r.status, 201)
    ok('y devuelve la línea', !!body?.line?.id, JSON.stringify(body).slice(0, 300))
    if (body?.line?.id) await api(`/budgets/${body.line.id}`, { method: 'DELETE' })
  }


  section('O · Fijo de ahorro atrasado: se recuperan los meses de a uno')
  {
    const origen = await cuenta('O origen')
    const dest = await cuenta('O ahorro', { initial_balance: 0 })
    const meta = await ahorro('O meta')
    const hace2 = addMonths(MES, -2)
    const fijo = (await json(await post('/recurring', {
      name: 'O fijo', amount: 10, currency: 'USD', account_id: origen.id,
      savings_goal_id: meta.id, to_account_id: dest.id, day_of_month: 5,
      starts_on: `${hace2.slice(0, 7)}-05`,
    }))).recurring

    const estado = (await json(await api('/recurring'))).recurring.find(r => r.id === fijo.id)
    ok('arrastra los meses sin registrar', estado.pending.length >= 3, `pending=${estado.pending.length}`)

    // Se registran de a uno, del más viejo al más nuevo.
    for (const due of estado.pending.slice(0, 3)) {
      await post(`/recurring/${fijo.id}/register`, { account_id: origen.id, date: due })
    }
    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('los tres aportes se acumulan en el ahorro', g.balance_usd, 30)
  }

  section('P · Transferencia entre DOS cuentas de ahorro no pide ahorro ni motivo')
  {
    const a1 = await cuenta('P ahorro 1', { initial_balance: 100 })
    const a2 = await cuenta('P ahorro 2', { initial_balance: 0 })
    const r = await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: a1.id, to_account_id: a2.id, amount: 10,
    })
    eq('se acepta sin savings_goal_id (§0.1.2: reacomodar billeteras)', r.status, 201)
  }

  section('Q · Ajustes 2026-08-26 · el cajón de sastre no pide reparto')
  {
    const r = await post('/savings-goals', { name: 'Q patrimonio', currency: 'USD', is_catchall: true })
    eq('se crea sin allocation_type ni allocation_value', r.status, 201)
    const g = (await json(r)).goal
    eq('y quedan nulos', [g?.allocation_type, g?.allocation_value], [null, null])

    // Uno que NO es cajón sigue exigiéndolo.
    eq('un ahorro normal sin reparto → 400',
       (await post('/savings-goals', { name: 'Q normal', currency: 'USD' })).status, 400)

    // Y sigue repartiendo bien: se lleva todo lo que sobra.
    const otro = await ahorro('Q fijo 50')
    const prop = proposeStub => proposeStub
    void prop
    const lista = (await json(await api('/savings-goals'))).goals
    ok('el cajón aparece marcado', lista.find(x => x.id === g.id)?.is_catchall === true)
    ok('y el otro conserva su reparto', lista.find(x => x.id === otro.id)?.allocation_value === 50)

    // Dejar de ser cajón vuelve a exigir reparto.
    eq('quitarle el cajón sin darle reparto → 400',
       (await patch(`/savings-goals/${g.id}`, { is_catchall: false })).status, 400)
    eq('pero con reparto sí',
       (await patch(`/savings-goals/${g.id}`, { is_catchall: false, allocation_type: 'percent', allocation_value: 10 })).status, 200)
  }

  section('R · Ajustes · la moneda es editable mientras no haya movimientos')
  {
    const g = await ahorro('R meta', { currency: 'USD' })
    eq('sin movimientos se puede cambiar',
       (await patch(`/savings-goals/${g.id}`, { currency: 'BOB' })).status, 200)
    const trasCambio = (await json(await api('/savings-goals'))).goals.find(x => x.id === g.id)
    eq('y queda en la moneda nueva', trasCambio.input_currency, 'BOB')
    eq('has_movements sigue en false', trasCambio.has_movements, false)

    // Con un aporte registrado, ya no.
    const org = await cuenta('R origen')
    const dst = await cuenta('R ahorro', { initial_balance: 0 })
    await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: dst.id,
      amount: 10, savings_goal_id: g.id, savings_flow: 'aporte',
    })
    eq('con movimientos → 409', (await patch(`/savings-goals/${g.id}`, { currency: 'USD' })).status, 409)
    const conMov = (await json(await api('/savings-goals'))).goals.find(x => x.id === g.id)
    eq('y has_movements lo refleja', conMov.has_movements, true)
  }

  section('S · Ajustes · la cuenta del fijo de ahorro se elige al REGISTRAR')
  {
    const org = await cuenta('S origen')
    const dst = await cuenta('S ahorro', { initial_balance: 0 })
    const meta = await ahorro('S meta')

    // Crear el fijo SIN cuenta destino ya no es un error.
    const r = await post('/recurring', {
      name: 'S fijo', amount: 15, currency: 'USD', account_id: org.id,
      savings_goal_id: meta.id, starts_on: HOY,
    })
    eq('se crea sin cuenta destino', r.status, 201)
    const fijo = (await json(r)).recurring
    eq('y queda en null', fijo.to_account_id, null)

    // Registrar sin decir a dónde va sí falla: es el momento de elegirla.
    eq('registrar sin cuenta destino → 400',
       (await post(`/recurring/${fijo.id}/register`, { account_id: org.id, date: HOY })).status, 400)

    // Una cuenta que no es de ahorro se rechaza.
    eq('registrar hacia una cuenta que no es de ahorro → 400',
       (await post(`/recurring/${fijo.id}/register`, { account_id: org.id, to_account_id: org.id, date: HOY })).status, 400)

    const reg = await json(await post(`/recurring/${fijo.id}/register`, {
      account_id: org.id, to_account_id: dst.id, date: HOY,
    }))
    eq('con la cuenta elegida, registra', reg.transaction?.type, 'transferencia')
    eq('hacia la cuenta de ahorro', reg.transaction?.to_account_id, dst.id)

    // Y queda como default para la próxima.
    const trasRegistrar = (await json(await api('/recurring'))).recurring.find(x => x.id === fijo.id)
    eq('la plantilla recuerda la última cuenta usada', trasRegistrar.to_account_id, dst.id)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('y el ahorro subió', g.balance_usd, 15)
  }






  section('Y · Revisión 3 · un gasto normal NO puede tocar los ahorros')
  {
    const cta = await cuenta('Y cuenta', { initial_balance: 500 })
    const meta = await ahorro('Y meta')
    const org = await cuenta('Y origen', { initial_balance: 1000 })

    // Se apartan 200 en esa cuenta (aporte: transferencia SIN motivo).
    await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: cta.id,
      amount: 200, savings_goal_id: meta.id, savings_flow: 'aporte',
    })

    const ctas = (await json(await api('/accounts'))).accounts
    const c = ctas.find(a => a.id === cta.id)
    eq('la cuenta tiene 700 en total', c.balance, 700)
    eq('de los cuales 200 están apartados', c.savings_balance, 200)

    // El server sigue permitiendo gastar el saldo entero (la protección es de
    // UI, mismo criterio que el bloqueo de Presupuesto). Lo que importa es que
    // el dato para calcular "lo libre" esté bien y sea 500.
    eq('lo libre son 700 − 200 = 500', round2(c.balance - c.savings_balance), 500)
  }

  section('Z · Revisión 3 · cualquier cuenta puede alojar ahorros')
  {
    const cta = await cuenta('Z comun', { initial_balance: 300 })
    const meta = await ahorro('Z meta')

    // Un ingreso a esa cuenta sigue siendo ingreso real.
    const ing = await json(await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: cta.id, amount: 100,
    }))
    eq('el ingreso es consumo (ingreso real)', ing.transaction?.flow_type, 'consumo')

    // Y gastar de ahí sin decir nada no pide ahorro ni motivo.
    eq('gastar sin etiquetar se puede', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: cta.id, category_id: comida, amount: 20,
    })).status, 201)

    // Etiquetar un gasto exige motivo (es un retiro).
    eq('etiquetar un gasto sin motivo → 400', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: cta.id, amount: 10, savings_goal_id: meta.id,
    })).status, 400)
    eq('con motivo, se guarda', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: cta.id, amount: 10,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })).status, 201)
  }

  section('AA · Revisión 4 · la dirección se declara, no se deduce')
  {
    const org = await cuenta('AA origen', { initial_balance: 500 })
    const dst = await cuenta('AA destino', { initial_balance: 0 })
    const meta = await ahorro('AA meta')

    // Una transferencia etiquetada SIN declarar dirección se rechaza en vez
    // de asumir "aporte" por tener el motivo vacío.
    eq('transferencia etiquetada sin dirección → 400', (await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: dst.id,
      amount: 50, savings_goal_id: meta.id,
    })).status, 400)

    const aporte = await json(await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: dst.id,
      amount: 50, savings_goal_id: meta.id, savings_flow: 'aporte',
    }))
    eq('declarando aporte, se guarda', aporte.transaction?.savings_flow, 'aporte')

    const retiro = await json(await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: dst.id, to_account_id: org.id,
      amount: 20, savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'cambio_planes',
    }))
    eq('y un retiro declarado también', retiro.transaction?.savings_flow, 'retiro')

    eq('un retiro declarado sin motivo → 400', (await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: dst.id, to_account_id: org.id,
      amount: 5, savings_goal_id: meta.id, savings_flow: 'retiro',
    })).status, 400)

    // Un gasto no puede declararse como aporte: el tipo ya lo contradice.
    eq('un gasto declarado como aporte → 400', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: dst.id, amount: 5,
      savings_goal_id: meta.id, savings_flow: 'aporte',
    })).status, 400)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('el saldo respeta las direcciones declaradas: 50 − 20', g.balance_usd, 30)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AB · el saldo apartado de CADA cuenta
  //
  // Es el número nuevo del que depende todo: el "Máx" del quick-add, la línea
  // de la alcancía en Cuentas, y la promesa de que un gasto común no toca lo
  // ahorrado. Si este número miente, miente toda la feature.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AB · savings_balance por cuenta')
  {
    const caja = await cuenta('AB Caja')
    const banco = await cuenta('AB Banco', { initial_balance: 0 })
    const meta = await ahorro('AB Meta')

    // Un ingreso tageado aparta plata en la cuenta donde cae.
    await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: caja.id, amount: 200,
      savings_goal_id: meta.id, savings_flow: 'aporte',
    })
    let accs = (await json(await api('/accounts'))).accounts
    eq('un ingreso tageado aparta plata en su cuenta',
       accs.find(a => a.id === caja.id)?.savings_balance, 200)
    eq('y no toca a las demás', accs.find(a => a.id === banco.id)?.savings_balance, 0)

    // Una transferencia-aporte aparta en el DESTINO, no en el origen.
    await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: caja.id, to_account_id: banco.id,
      amount: 100, savings_goal_id: meta.id, savings_flow: 'aporte',
    })
    accs = (await json(await api('/accounts'))).accounts
    eq('una transferencia-aporte aparta en el destino',
       accs.find(a => a.id === banco.id)?.savings_balance, 100)

    // Un retiro baja lo apartado de la cuenta de donde sale.
    await post('/transactions', {
      type: 'gasto', date: HOY, account_id: caja.id, amount: 50,
      savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'emergencia',
    })
    accs = (await json(await api('/accounts'))).accounts
    eq('un retiro baja lo apartado de su cuenta',
       accs.find(a => a.id === caja.id)?.savings_balance, 150)

    // El saldo del ahorro tiene que ser exactamente la suma de lo apartado en
    // cada cuenta: 150 en Caja + 100 en Banco. Si no cuadra, o una cuenta
    // miente sobre su alcancía o el ahorro se está contando dos veces.
    //
    // (Los 100 de la transferencia son plata LIBRE de Caja que pasa a estar
    // ahorrada en Banco — un aporte nuevo, no un traslado de lo ya apartado.
    // Mover plata YA ahorrada entre cuentas propias no tiene hoy forma de
    // expresarse: ver la nota de "traslado" en el sprint.)
    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    const caja150 = accs.find(a => a.id === caja.id)?.savings_balance
    const banco100 = accs.find(a => a.id === banco.id)?.savings_balance
    eq('el saldo del ahorro cuadra con la suma de las alcancías',
       g.balance_usd, round2(caja150 + banco100))

    // Retirar más de lo apartado no puede dejar un apartado negativo.
    await post('/transactions', {
      type: 'gasto', date: HOY, account_id: caja.id, amount: 900,
      savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'otro',
    })
    accs = (await json(await api('/accounts'))).accounts
    ok('lo apartado nunca queda negativo',
       accs.find(a => a.id === caja.id)?.savings_balance >= 0,
       String(accs.find(a => a.id === caja.id)?.savings_balance))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AC · desetiquetar y cambiar de dirección desde el PATCH
  //
  // El constraint de forma (20260826030000) es estricto: etiqueta y dirección
  // van juntas SIEMPRE. Una edición que las desincronice muere con el mensaje
  // crudo de Postgres, que es justo lo que no se puede mostrar a nadie.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AC · editar un movimiento de ahorro')
  {
    const c = await cuenta('AC Cuenta')
    const meta = await ahorro('AC Meta')

    const retiro = (await json(await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 30,
      savings_goal_id: meta.id, savings_flow: 'retiro', savings_reason: 'emergencia',
    }))).transaction

    // Desetiquetar tiene que limpiar dirección y motivo, o el CHECK lo rechaza.
    const destag = await json(await patch(`/transactions/${retiro.id}`, { savings_goal_id: null }))
    eq('desetiquetar deja la etiqueta en null', destag.transaction?.savings_goal_id, null)
    eq('y también la dirección', destag.transaction?.savings_flow, null)
    eq('y el motivo', destag.transaction?.savings_reason, null)

    // Volver a etiquetarlo: la dirección se deduce del tipo (gasto → retiro).
    const retag = await json(await patch(`/transactions/${retiro.id}`, {
      savings_goal_id: meta.id, savings_reason: 'otro',
    }))
    eq('re-etiquetar deduce la dirección del tipo', retag.transaction?.savings_flow, 'retiro')

    // Y cambiar el tipo la da vuelta, limpiando el motivo que ya no aplica.
    const flip = await json(await patch(`/transactions/${retiro.id}`, { type: 'ingreso' }))
    eq('pasar de gasto a ingreso vuelve el retiro un aporte', flip.transaction?.savings_flow, 'aporte')
    eq('y un aporte no lleva motivo', flip.transaction?.savings_reason, null)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('el saldo sigue la última versión del movimiento: +30', g.balance_usd, 30)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AD · borrar un ahorro que ya se usó
  //
  // Bug encontrado el 26/8: el CHECK de forma no es diferible, así que soltar
  // la etiqueta en dos pasos (trigger + FK) rompía a mitad de camino y dejaba
  // TODO ahorro con movimientos imborrable, con un error crudo de Postgres.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AD · borrar un ahorro con historia')
  {
    const c = await cuenta('AD Cuenta')
    const meta = await ahorro('AD Meta')
    const tx = (await json(await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: c.id, amount: 80,
      savings_goal_id: meta.id, savings_flow: 'aporte',
    }))).transaction

    const del = await api(`/savings-goals/${meta.id}`, { method: 'DELETE' })
    eq('un ahorro con movimientos se puede borrar', del.status, 200)

    const lista = (await json(await api('/transactions?limit=100'))).transactions
    const sobreviviente = lista.find(t => t.id === tx.id)
    ok('el movimiento sobrevive al borrado', !!sobreviviente)
    eq('sin etiqueta', sobreviviente?.savings_goal_id, null)
    eq('y sin dirección colgada', sobreviviente?.savings_flow, null)

    const accs = (await json(await api('/accounts'))).accounts
    eq('y la cuenta deja de reportarlo como apartado',
       accs.find(a => a.id === c.id)?.savings_balance, 0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AE · fijo de ahorro — los caminos que no pasan por el quick-add
  //
  // El registro de un fijo escribe `savings_flow: 'aporte'` por su cuenta, sin
  // que nadie se lo pregunte. Es el camino más fácil de dejar desincronizado.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AE · registrar un fijo de ahorro')
  {
    const org = await cuenta('AE Origen')
    const dst = await cuenta('AE Destino', { initial_balance: 0 })
    const meta = await ahorro('AE Meta')

    const fijo = (await json(await post('/recurring', {
      name: 'AE Fijo', amount: 40, currency: 'USD',
      savings_goal_id: meta.id, starts_on: HOY, day_of_month: Number(HOY.slice(8, 10)),
    }))).recurring

    // Sin cuenta destino elegida, no se adivina.
    eq('registrar sin destino → 400',
       (await post(`/recurring/${fijo.id}/register`, { account_id: org.id, date: HOY })).status, 400)

    // Transferirse a sí mismo no movería nada y dejaría un aporte fantasma.
    eq('origen igual a destino → 400',
       (await post(`/recurring/${fijo.id}/register`, {
         account_id: org.id, to_account_id: org.id, date: HOY,
       })).status, 400)

    const reg = await json(await post(`/recurring/${fijo.id}/register`, {
      account_id: org.id, to_account_id: dst.id, date: HOY,
    }))
    eq('el registro escribe la dirección solo', reg.transaction?.savings_flow, 'aporte')
    eq('y es un movimiento, no un consumo', reg.transaction?.flow_type, 'movimiento')

    let accs = (await json(await api('/accounts'))).accounts
    eq('el destino queda con los 40 apartados',
       accs.find(a => a.id === dst.id)?.savings_balance, 40)
    eq('y el origen sin nada apartado',
       accs.find(a => a.id === org.id)?.savings_balance, 0)

    // Deshacer el registro tiene que revertir el apartado, no dejarlo colgado.
    await api(`/transactions/${reg.transaction.id}`, { method: 'DELETE' })
    accs = (await json(await api('/accounts'))).accounts
    eq('borrar el movimiento revierte lo apartado',
       accs.find(a => a.id === dst.id)?.savings_balance, 0)
    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('y el saldo del ahorro vuelve a cero', g.balance_usd, 0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AF · un fijo NORMAL no puede ensuciarse de ahorro
  // ─────────────────────────────────────────────────────────────────────────
  section('§AF · fijo normal sin contaminación de ahorro')
  {
    const c = await cuenta('AF Cuenta')
    const cats = (await json(await api('/categories'))).categories ?? []
    const cat = cats.find(x => !x.archived)?.id ?? null

    const fijo = (await json(await post('/recurring', {
      name: 'AF Fijo', amount: 10, currency: 'USD', category_id: cat,
      starts_on: HOY, day_of_month: Number(HOY.slice(8, 10)),
    }))).recurring

    const reg = await json(await post(`/recurring/${fijo.id}/register`, { account_id: c.id, date: HOY }))
    eq('un fijo normal no escribe dirección de ahorro', reg.transaction?.savings_flow ?? null, null)
    eq('ni etiqueta', reg.transaction?.savings_goal_id ?? null, null)
    eq('y sigue siendo consumo', reg.transaction?.flow_type, 'consumo')

    const accs = (await json(await api('/accounts'))).accounts
    eq('la cuenta no reporta nada apartado', accs.find(a => a.id === c.id)?.savings_balance, 0)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AG · cross-currency: un ahorro en USD alimentado desde una cuenta en Bs
  //
  // Es donde se cruzan las dos cosas que este sprint congela aparte: el lado
  // que sale y el lado que entra. Un solo `amount_usd` para los dos lados
  // haría que lo apartado en la cuenta destino no coincida con lo que entró.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AG · aporte cross-currency')
  {
    const bs = await cuenta('AG Bs', { currency: 'BOB', initial_balance: 7000 })
    const usd = await cuenta('AG USD', { initial_balance: 0 })
    const meta = await ahorro('AG Meta')

    const resAG = await json(await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: bs.id, to_account_id: usd.id,
      // Cross-currency: hay que decir cuánto llegó realmente del otro lado
      // (regla del Sprint 1) — no se reconvierte con la tasa de hoy.
      amount: 700, to_amount: 100, savings_goal_id: meta.id, savings_flow: 'aporte',
    }))
    const tx = resAG.transaction
    ok('el aporte cross-currency se guarda', !!tx?.id, JSON.stringify(resAG))
    ok('el lado que entra se congela aparte', tx?.to_amount_usd != null, JSON.stringify(tx))
    const accs = (await json(await api('/accounts'))).accounts
    const apartadoUsd = accs.find(a => a.id === usd.id)?.savings_balance
    ok('lo apartado en la cuenta destino coincide con lo que entró',
       Math.abs(round2(apartadoUsd) - round2(tx.to_amount ?? tx.amount)) < 0.02,
       `apartado ${apartadoUsd} vs entró ${tx.to_amount}`)
    eq('la cuenta de origen no aparta nada', accs.find(a => a.id === bs.id)?.savings_balance, 0)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AH · archivar y borrar cuentas que alojan ahorros
  //
  // Ninguna cuenta "es de ahorro", así que nada avisa que una cuenta cualquiera
  // guarda plata apartada. Archivarla o borrarla no puede hacer desaparecer
  // ese saldo en silencio.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AH · archivar/borrar una cuenta con ahorros dentro')
  {
    const c = await cuenta('AH Cuenta')
    const meta = await ahorro('AH Meta')
    await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: c.id, amount: 120,
      savings_goal_id: meta.id, savings_flow: 'aporte',
    })

    eq('borrar una cuenta con movimientos sigue siendo 409',
       (await api(`/accounts/${c.id}`, { method: 'DELETE' })).status, 409)

    const arch = await patch(`/accounts/${c.id}`, { archived: true })
    eq('archivarla sí se puede', arch.status, 200)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('el saldo del ahorro no desaparece al archivar su cuenta', g.balance_usd, 120)

    const accs = (await json(await api('/accounts'))).accounts
    const archivada = accs.find(a => a.id === c.id)
    ok('la cuenta archivada sigue reportando su alcancía',
       archivada?.savings_balance === 120,
       `savings_balance = ${archivada?.savings_balance}`)

    await patch(`/accounts/${c.id}`, { archived: false })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AI · la moneda de un ahorro se congela con el primer movimiento
  //
  // Pedido del usuario: editable mientras no haya movimientos. `has_movements`
  // es lo que la pantalla usa para habilitar el selector — si mintiera, el
  // formulario ofrecería algo que el servidor rechaza.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AI · moneda editable hasta el primer movimiento')
  {
    const c = await cuenta('AI Cuenta')
    const meta = await ahorro('AI Meta')

    let g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('un ahorro nuevo no tiene movimientos', g.has_movements, false)
    eq('y se le puede cambiar la moneda',
       (await patch(`/savings-goals/${meta.id}`, { currency: 'BOB' })).status, 200)

    await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: c.id, amount: 10,
      savings_goal_id: meta.id, savings_flow: 'aporte',
    })

    g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('con un aporte encima, has_movements se enciende', g.has_movements, true)
    eq('y la moneda queda congelada → 409',
       (await patch(`/savings-goals/${meta.id}`, { currency: 'USD' })).status, 409)
    eq('pero el resto se sigue editando',
       (await patch(`/savings-goals/${meta.id}`, { name: 'AI Meta renombrada' })).status, 200)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AJ · un fijo cuya meta se archivó
  //
  // Clase b08fdb4: archivar algo no puede congelar lo que lo referencia. El
  // fijo tiene que poder pausarse y editarse; lo que no debería es seguir
  // aportando a un ahorro que el usuario dio por cerrado.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AJ · fijo con la meta archivada')
  {
    const org = await cuenta('AJ Origen')
    const dst = await cuenta('AJ Destino', { initial_balance: 0 })
    const meta = await ahorro('AJ Meta')
    const fijo = (await json(await post('/recurring', {
      name: 'AJ Fijo', amount: 15, currency: 'USD', savings_goal_id: meta.id,
      to_account_id: dst.id, starts_on: HOY, day_of_month: Number(HOY.slice(8, 10)),
    }))).recurring

    await patch(`/savings-goals/${meta.id}`, { archived: true })

    eq('el fijo se sigue pudiendo pausar', (await patch(`/recurring/${fijo.id}`, { active: false })).status, 200)
    eq('y reactivar', (await patch(`/recurring/${fijo.id}`, { active: true })).status, 200)
    eq('y renombrar', (await patch(`/recurring/${fijo.id}`, { name: 'AJ Fijo v2' })).status, 200)

    const reg = await post(`/recurring/${fijo.id}/register`, {
      account_id: org.id, to_account_id: dst.id, date: HOY,
    })
    const cuerpo = await json(reg)
    // Elegir un ahorro archivado para un movimiento NUEVO ya se rechaza en
    // POST /transactions (`assertSavingsGoal` sin `allowArchived`). Registrar
    // un fijo crea un movimiento nuevo: tiene que aplicar el mismo criterio, o
    // la plata entra a un ahorro que la pantalla de Ahorros ni siquiera lista.
    eq('registrar un fijo contra un ahorro archivado → 400', reg.status, 400)
    ok('y el error dice qué hacer, no solo que no se puede',
       typeof cuerpo?.error === 'string' && /archivad/i.test(cuerpo.error),
       JSON.stringify(cuerpo))

    await patch(`/savings-goals/${meta.id}`, { archived: false })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AK · el cajón de sastre y las metas ya cumplidas
  //
  // La regla que el usuario pidió: "no quiero que haya un sin asignar, quiero
  // que el restante quede como ahorro de patrimonio". El cajón absorbe el
  // resto AUNQUE ya haya llegado a su meta, y no necesita reparto propio.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AK · el cajón absorbe todo lo que sobra')
  {
    // Se archiva lo vivo para que la propuesta sea determinística.
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await patch(`/savings-goals/${g.id}`, { archived: true })
    }

    const patrimonio = (await json(await post('/savings-goals', {
      name: 'AK Patrimonio', currency: 'USD', is_catchall: true,
    }))).goal
    ok('un cajón de sastre se crea sin reparto propio', !!patrimonio?.id, JSON.stringify(patrimonio))

    eq('pero un ahorro NORMAL sin reparto → 400',
       (await post('/savings-goals', { name: 'AK Sin reparto', currency: 'USD' })).status, 400)

    const fijo = (await json(await post('/savings-goals', {
      name: 'AK Fijo', currency: 'USD', allocation_type: 'fixed',
      allocation_value: 20, target_amount: 20,
    }))).goal

    const c = await cuenta('AK Cuenta')
    const mesPasado = addMonths(MES, -1)
    await adminFetch(`/rest/v1/fin_savings_goals?id=in.(${patrimonio.id},${fijo.id})`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPasado}T00:00:00Z` }),
    })
    await post('/transactions', { type: 'ingreso', date: `${mesPasado.slice(0, 7)}-15`, account_id: c.id, amount: 300 })

    const prop = await json(await api('/savings-goals/close'))
    eq('el mes pasado queda pendiente', prop.pending_period, mesPasado)
    eq('no queda nada sin asignar', prop.unassigned_usd, 0)
    const delFijo = prop.proposal.find(l => l.goal_id === fijo.id)
    const delCajon = prop.proposal.find(l => l.goal_id === patrimonio.id)
    eq('el fijo pide sus 20', delFijo?.amount_usd, 20)
    // Contra el sobrante que el server calcula, no contra un número fijo:
    // secciones anteriores del probe también dejaron plata en ese mes.
    eq('y el cajón absorbe todo el resto', delCajon?.amount_usd, round2(prop.surplus_usd - 20))
    eq('entre los dos suman el sobrante entero',
       round2(prop.proposal.reduce((s, l) => s + l.amount_usd, 0)), round2(prop.surplus_usd))
  }

}

await setup()
try { await run() } finally {
  await adminFetch(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
  console.log('\nUsuario de probe eliminado.')
}
process.exit(summary() === 0 ? 0 : 1)
