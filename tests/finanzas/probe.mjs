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

/**
 * Aportar a un ahorro por el único camino manual que queda desde la Ronda 8:
 * un fijo de ahorro registrado. Aportar es una decisión de plan (fijo o
 * cierre de mes), no el registro de algo que pasó, así que el quick-add ya
 * no puede hacerlo.
 */
const aportar = async ({ goalId, fromId, toId, amount, currency = 'USD', date = HOY }) => {
  const fijo = (await json(await post('/recurring', {
    name: `Aporte ${Math.random().toString(36).slice(2, 8)}`, amount, currency,
    savings_goal_id: goalId, to_account_id: toId,
    starts_on: date, day_of_month: Number(date.slice(8, 10)),
  }))).recurring
  const reg = await json(await post(`/recurring/${fijo.id}/register`, {
    account_id: fromId, to_account_id: toId, date,
  }))
  return { transaction: reg?.transaction, recurring_id: fijo?.id, error: reg?.error }
}

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

  section('F · Registrar un fijo de ahorro descuenta del sobrante del mes')
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

    const prop = await json(await api('/savings-goals'))
    eq('el mes pasado queda pendiente', prop.pending_period, prev)
    // Antes daba 300: el aporte es una transferencia (`movimiento`) y no lo
    // miraban ni ingresoUsd ni gastoUsd, así que el reparto pedía repartir de
    // nuevo los 50 que el fijo ya había guardado.
    eq('el sobrante es 400 − 100 − 50 ya guardados por el fijo', prop.pending_surplus_usd, 250)
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
    await aportar({ goalId: g.id, fromId: org.id, toId: dst.id, amount: 10, currency: 'BOB' })
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

    // Se apartan 200 en esa cuenta, por el camino real: un fijo de ahorro.
    await aportar({ goalId: meta.id, fromId: org.id, toId: cta.id, amount: 200 })

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

    // Y desde el piso de ahorro (26/8), tampoco se puede retirar de una cuenta
    // donde ese ahorro no tiene nada apartado: no se saca lo que no se puso.
    // El quick-add ni siquiera ofrece el toggle en ese caso.
    eq('retirar de una cuenta sin nada apartado → 400', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: cta.id, amount: 10,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })).status, 400)

    // Con un aporte encima, el retiro sí entra.
    const fondo = await cuenta('Z fondo', { initial_balance: 200 })
    await aportar({ goalId: meta.id, fromId: fondo.id, toId: cta.id, amount: 40 })
    eq('con plata apartada y motivo, se guarda', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: cta.id, amount: 10,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })).status, 201)
  }

  section('AA · Ronda 8 · por Movimientos un ahorro solo puede SALIR')
  {
    const org = await cuenta('AA origen', { initial_balance: 500 })
    const dst = await cuenta('AA destino', { initial_balance: 0 })
    const meta = await ahorro('AA meta')

    // Una transferencia es solo plata cambiando de billetera. No pregunta
    // nada, y no se le puede pegar un ahorro por acá: para mover un ahorro de
    // cuenta está el traslado, en la pantalla de Ahorros.
    eq('transferir sin tagear → 201', (await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: dst.id, amount: 50,
    })).status, 201)

    const tageada = await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: org.id, to_account_id: dst.id,
      amount: 50, savings_goal_id: meta.id, savings_flow: 'aporte',
    })
    eq('tagear una transferencia → 400', tageada.status, 400)
    ok('y el error manda a la pantalla correcta',
       /Mover de cuenta/i.test((await json(tageada))?.error ?? ''), 'sin la referencia')

    // Un ingreso tampoco aporta: la plata entra a un ahorro con un fijo o en
    // el cierre de mes, que son decisiones de plan y no registros de hechos.
    const ing = await post('/transactions', {
      type: 'ingreso', date: HOY, account_id: dst.id, amount: 50, savings_goal_id: meta.id,
    })
    eq('marcar un ingreso como aporte → 400', ing.status, 400)
    ok('y el error nombra los dos caminos reales',
       /fijo de ahorro/i.test((await json(ing))?.error ?? ''), 'sin la referencia')

    // Lo que SÍ vive acá: romper un ahorro con un gasto, siempre con motivo.
    await aportar({ goalId: meta.id, fromId: org.id, toId: dst.id, amount: 50 })

    eq('un gasto tageado sin motivo → 400', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: dst.id, amount: 20, savings_goal_id: meta.id,
    })).status, 400)

    const retiro = await json(await post('/transactions', {
      type: 'gasto', date: HOY, account_id: dst.id, amount: 20,
      savings_goal_id: meta.id, savings_reason: 'cambio_planes',
    }))
    eq('con motivo, se guarda como retiro', retiro.transaction?.savings_flow, 'retiro')

    // Declarar una dirección que el tipo contradice se sigue rechazando en
    // vez de pisarla en silencio.
    eq('un gasto declarado como aporte → 400', (await post('/transactions', {
      type: 'gasto', date: HOY, account_id: dst.id, amount: 5,
      savings_goal_id: meta.id, savings_flow: 'aporte', savings_reason: 'otro',
    })).status, 400)

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('el saldo del ahorro: 50 aportados − 20 retirados', g.balance_usd, 30)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // §AM · el traslado — la tercera dirección
  //
  // Mover plata YA ahorrada entre dos cuentas propias no cambia cuánto tenés
  // ahorrado, solo dónde está. Era el hueco documentado en §4.9: como aporte
  // se contaba dos veces, como retiro salía del ahorro.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AM · mover un ahorro de cuenta')
  {
    const org = await cuenta('AM origen', { initial_balance: 500 })
    const a = await cuenta('AM A', { initial_balance: 0 })
    const b = await cuenta('AM B', { initial_balance: 0 })
    const meta = await ahorro('AM meta')
    const otra = await ahorro('AM otra')

    await aportar({ goalId: meta.id, fromId: org.id, toId: a.id, amount: 120 })
    await aportar({ goalId: otra.id, fromId: org.id, toId: a.id, amount: 80 })

    const move = payload => post(`/savings-goals/${meta.id}/move`, payload)

    // El tope es lo que hay DE ESTE AHORRO en esa cuenta (120), no lo apartado
    // en la cuenta (200, porque ahí también viven 80 del otro ahorro).
    const pasado = await move({ from_account_id: a.id, to_account_id: b.id, amount: 150 })
    eq('mover más de lo que este ahorro tiene ahí → 400', pasado.status, 400)
    ok('y el error dice cuánto hay de ESTE ahorro',
       /120/.test((await json(pasado))?.error ?? ''), 'sin el monto')

    eq('desde una cuenta donde este ahorro no tiene nada → 400',
       (await move({ from_account_id: b.id, to_account_id: a.id, amount: 10 })).status, 400)
    eq('a la misma cuenta → 400',
       (await move({ from_account_id: a.id, to_account_id: a.id, amount: 10 })).status, 400)

    const movido = await json(await move({ from_account_id: a.id, to_account_id: b.id, amount: 50 }))
    eq('la dirección es traslado', movido.transaction?.savings_flow, 'traslado')
    eq('y no lleva motivo: no se rompe nada', movido.transaction?.savings_reason, null)
    eq('es un movimiento, no gasto ni ingreso real', movido.transaction?.flow_type, 'movimiento')

    const metas = (await json(await api('/savings-goals'))).goals
    eq('el saldo del ahorro no se movió un peso', metas.find(x => x.id === meta.id)?.balance_usd, 120)
    eq('el otro ahorro sigue intacto', metas.find(x => x.id === otra.id)?.balance_usd, 80)
    eq('pero ahora vive en dos cuentas', metas.find(x => x.id === meta.id)?.by_account.length, 2)

    const ctas = (await json(await api('/accounts'))).accounts
    eq('la cuenta de origen aparta 200 − 50', ctas.find(x => x.id === a.id)?.savings_balance, 150)
    eq('y la de destino los 50 que llegaron', ctas.find(x => x.id === b.id)?.savings_balance, 50)
    eq('el saldo real también se movió', ctas.find(x => x.id === b.id)?.balance, 50)

    // Cross-currency: el formulario manda lo que REALMENTE llegó, igual que
    // cualquier transferencia, en vez de que el server lo derive de la tasa.
    const enOtraMoneda = await cuenta('AM Bs', { currency: 'BOB', initial_balance: 0 })
    const cruzado = await json(await move({
      from_account_id: a.id, to_account_id: enOtraMoneda.id, amount: 20, to_amount: 140,
    }))
    eq('un traslado cross-currency congela el lado que llega', cruzado.transaction?.to_amount, 140)
    const ctasCruz = (await json(await api('/accounts'))).accounts
    eq('y aparta en la cuenta destino lo que llegó, no lo que salió',
       ctasCruz.find(x => x.id === enOtraMoneda.id)?.savings_balance, 140)
    eq('el saldo del ahorro sigue sin moverse',
       (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)?.balance_usd, 120)

    // Un traslado no puede llevarse plata que ya no está: lo apartado es un
    // dato derivado, no una caja aparte.
    await post('/transactions', {
      type: 'gasto', date: HOY, account_id: b.id, amount: 50,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })
    eq('con la plata ya gastada, no se puede trasladar de vuelta',
       (await move({ from_account_id: b.id, to_account_id: a.id, amount: 10 })).status, 400)
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
    const fuente = await cuenta('AB Fuente', { initial_balance: 1000 })
    const caja = await cuenta('AB Caja', { initial_balance: 300 })
    const banco = await cuenta('AB Banco', { initial_balance: 0 })
    const meta = await ahorro('AB Meta')

    // Un aporte aparta plata en la cuenta que la RECIBE.
    await aportar({ goalId: meta.id, fromId: fuente.id, toId: caja.id, amount: 200 })
    let accs = (await json(await api('/accounts'))).accounts
    eq('el aporte aparta plata en la cuenta destino',
       accs.find(a => a.id === caja.id)?.savings_balance, 200)
    eq('y no toca la de origen', accs.find(a => a.id === fuente.id)?.savings_balance, 0)
    eq('ni a las demás', accs.find(a => a.id === banco.id)?.savings_balance, 0)

    // Un traslado mueve lo apartado de una cuenta a otra sin tocar el ahorro.
    await post(`/savings-goals/${meta.id}/move`, {
      from_account_id: caja.id, to_account_id: banco.id, amount: 100,
    })
    accs = (await json(await api('/accounts'))).accounts
    eq('un traslado saca lo apartado del origen', accs.find(a => a.id === caja.id)?.savings_balance, 100)
    eq('y lo pone en el destino', accs.find(a => a.id === banco.id)?.savings_balance, 100)

    // Un retiro baja lo apartado de la cuenta de donde sale.
    await post('/transactions', {
      type: 'gasto', date: HOY, account_id: caja.id, amount: 50,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })
    accs = (await json(await api('/accounts'))).accounts
    eq('un retiro baja lo apartado de su cuenta', accs.find(a => a.id === caja.id)?.savings_balance, 50)

    // El invariante: el saldo del ahorro es la suma de las alcancías.
    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    const caja50 = accs.find(a => a.id === caja.id)?.savings_balance
    const banco100 = accs.find(a => a.id === banco.id)?.savings_balance
    eq('el saldo del ahorro cuadra con la suma de las alcancías',
       g.balance_usd, round2(caja50 + banco100))

    // Retirar más de lo apartado no llega ni a escribirse: el piso lo corta.
    const exceso = await post('/transactions', {
      type: 'gasto', date: HOY, account_id: caja.id, amount: 900,
      savings_goal_id: meta.id, savings_reason: 'otro',
    })
    eq('retirar más de lo apartado → 400', exceso.status, 400)
    accs = (await json(await api('/accounts'))).accounts
    eq('y lo apartado queda como estaba', accs.find(a => a.id === caja.id)?.savings_balance, 50)
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
    const fuente = await cuenta('AC Fuente', { initial_balance: 500 })
    // Con plata libre además del ahorro: desetiquetar un retiro lo vuelve un
    // gasto común, y un gasto común no puede comerse lo apartado.
    const c = await cuenta('AC Cuenta', { initial_balance: 100 })
    const meta = await ahorro('AC Meta')

    // Primero hay que apartar: desde el piso de ahorro no se puede retirar de
    // una cuenta donde ese ahorro no tiene nada.
    const aporte = await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 100 })

    const retiro = (await json(await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 30,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    }))).transaction

    // Desetiquetar tiene que limpiar dirección y motivo, o el CHECK lo rechaza.
    const destag = await json(await patch(`/transactions/${retiro.id}`, { savings_goal_id: null }))
    ok('el desetiquetado no falla', !!destag.transaction, JSON.stringify(destag))
    eq('desetiquetar deja la etiqueta en null', destag.transaction?.savings_goal_id, null)
    eq('y también la dirección', destag.transaction?.savings_flow, null)
    eq('y el motivo', destag.transaction?.savings_reason, null)

    // Volver a etiquetarlo: la dirección se deduce del tipo (gasto → retiro).
    const retag = await json(await patch(`/transactions/${retiro.id}`, {
      savings_goal_id: meta.id, savings_reason: 'otro',
    }))
    eq('re-etiquetar deduce la dirección del tipo', retag.transaction?.savings_flow, 'retiro')

    // La puerta de atrás cerrada (Ronda 8): cambiarle el tipo a ingreso lo
    // convertía en un APORTE hecho desde Movimientos, que es justo lo que la
    // ronda sacó. El camino de entrada es el fijo o el cierre de mes.
    const flip = await patch(`/transactions/${retiro.id}`, { type: 'ingreso' })
    eq('convertir un retiro en aporte editándolo → 400', flip.status, 400)
    ok('con el mensaje que manda al camino correcto',
       /fijo de ahorro/i.test((await json(flip))?.error ?? ''), 'sin la referencia')

    // Pero editar el aporte que creó el fijo sigue funcionando: archivar o
    // cambiar una regla no congela la historia.
    const editado = await json(await patch(`/transactions/${aporte.transaction.id}`, {
      description: 'Aporte de agosto',
    }))
    eq('editar la descripción de un aporte ya existente', editado.transaction?.description, 'Aporte de agosto')
    eq('y conserva su etiqueta', editado.transaction?.savings_goal_id, meta.id)
    eq('y su dirección', editado.transaction?.savings_flow, 'aporte')

    const g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('el saldo del ahorro: 100 − 30', g.balance_usd, 70)
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
    const fuente = await cuenta('AD Fuente', { initial_balance: 300 })
    const c = await cuenta('AD Cuenta', { initial_balance: 0 })
    const meta = await ahorro('AD Meta')
    const aporte = await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 80 })
    const tx = aporte.transaction

    // El fijo que lo alimenta lo bloquea a propósito; primero se saca.
    eq('mientras un fijo lo use, no se borra',
       (await api(`/savings-goals/${meta.id}`, { method: 'DELETE' })).status, 409)
    await api(`/recurring/${aporte.recurring_id}`, { method: 'DELETE' })

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

    // Un fijo en Bs que aporta a una cuenta en USD: el lado que sale y el que
    // entra se congelan por separado, o lo apartado en la cuenta destino no
    // coincidiría con lo que realmente llegó.
    const aporte = await aportar({ goalId: meta.id, fromId: bs.id, toId: usd.id, amount: 700, currency: 'BOB' })
    const tx = aporte.transaction
    ok('el aporte cross-currency se guarda', !!tx?.id, JSON.stringify(aporte))
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
    const fuente = await cuenta('AH Fuente', { initial_balance: 500 })
    const c = await cuenta('AH Cuenta', { initial_balance: 0 })
    const meta = await ahorro('AH Meta')
    await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 120 })

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
    const fuente = await cuenta('AI Fuente', { currency: 'BOB', initial_balance: 500 })
    const c = await cuenta('AI Cuenta', { currency: 'BOB', initial_balance: 0 })
    const meta = await ahorro('AI Meta')

    let g = (await json(await api('/savings-goals'))).goals.find(x => x.id === meta.id)
    eq('un ahorro nuevo no tiene movimientos', g.has_movements, false)
    eq('y se le puede cambiar la moneda',
       (await patch(`/savings-goals/${meta.id}`, { currency: 'BOB' })).status, 200)

    await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 10, currency: 'BOB' })

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

    // El reparto dejó de ser una ruta: `proposeAllocation` lo calcula del lado
    // del cliente sobre el sobrante que viaja con los ahorros, y su aritmética
    // (incluido el cajón que absorbe el resto) la cubre `unit.mjs`. Lo que le
    // toca probar acá es que el servidor entregue los dos insumos y que el
    // cajón se pueda fondear de verdad.
    const prop = await json(await api('/savings-goals'))
    eq('el mes pasado queda pendiente', prop.pending_period, mesPasado)
    ok('y llega el sobrante para repartir', prop.pending_surplus_usd > 0, String(prop.pending_surplus_usd))
    const cajonEnPayload = prop.goals.find(g => g.id === patrimonio.id)
    eq('el cajón viaja marcado', cajonEnPayload?.is_catchall, true)
    eq('y sin reparto propio: se lleva lo que sobre', cajonEnPayload?.allocation_type, null)

    eq('el fijo se puede fondear con su monto',
       (await post(`/savings-goals/${fijo.id}/save`, {
         period: mesPasado, from_account_id: c.id, amount: 20,
       })).status, 201)
    eq('y el cajón con el resto',
       (await post(`/savings-goals/${patrimonio.id}/save`, {
         period: mesPasado, from_account_id: c.id, amount: 30,
       })).status, 201)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AL · el piso de ahorro, en TODOS los caminos
  //
  // Pedido del usuario (26/8): "creo que debería estar en toda la app para que
  // ahorrar tenga sentido". Antes lo aplicaba solo el quick-add, así que
  // registrar un fijo o aportar a un pasanaku se comía lo apartado sin avisar.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AL · lo apartado no se toca desde ningún camino')
  {
    const fuente = await cuenta('AL Fuente', { initial_balance: 500 })
    const c = await cuenta('AL Cuenta', { initial_balance: 300 })
    const otra = await cuenta('AL Otra', { initial_balance: 0 })
    const meta = await ahorro('AL Meta')

    // 300 propios + 200 aportados = 500 de saldo, 200 apartados → 300 libres.
    await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 200 })
    let accs = (await json(await api('/accounts'))).accounts
    eq('la cuenta tiene 500 de saldo', accs.find(a => a.id === c.id)?.balance, 500)
    eq('y 200 apartados', accs.find(a => a.id === c.id)?.savings_balance, 200)

    // 1. Quick-add: un gasto común llega hasta 300, no hasta 500.
    const excede = await post('/transactions', { type: 'gasto', date: HOY, account_id: c.id, amount: 350 })
    eq('un gasto común que se comería los ahorros → 400', excede.status, 400)
    const msg = (await json(excede))?.error ?? ''
    ok('y el error dice que hay plata apartada', /apartad/i.test(msg), msg)

    eq('justo hasta el límite libre sí entra',
       (await post('/transactions', { type: 'gasto', date: HOY, account_id: c.id, amount: 300 })).status, 201)

    // Con lo libre en cero, un gasto de 1 ya no entra aunque haya 200 en la cuenta.
    eq('sin plata libre, ni un peso más', 
       (await post('/transactions', { type: 'gasto', date: HOY, account_id: c.id, amount: 1 })).status, 400)

    // 2. Pero un retiro DECLARADO sí puede: para eso está la alcancía.
    const retiro = await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 150,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })
    eq('un retiro declarado gasta de la alcancía', retiro.status, 201)

    // ...y tampoco puede pasarse de lo apartado (quedan 50).
    const pasado = await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 80,
      savings_goal_id: meta.id, savings_reason: 'otro',
    })
    eq('un retiro por más de lo apartado → 400', pasado.status, 400)
    ok('con el mensaje de la alcancía', /apartados en ahorros/i.test((await json(pasado))?.error ?? ''), '')

    // 3. Registrar un FIJO respeta el mismo piso.
    const fijo = (await json(await post('/recurring', {
      name: 'AL Fijo', amount: 60, currency: 'USD',
      starts_on: HOY, day_of_month: Number(HOY.slice(8, 10)),
      category_id: ((await json(await api('/categories'))).categories ?? []).find(x => !x.archived)?.id ?? null,
    }))).recurring
    const regFijo = await post(`/recurring/${fijo.id}/register`, { account_id: c.id, date: HOY })
    eq('registrar un fijo que se comería los ahorros → 400', regFijo.status, 400)
    ok('y lo dice', /apartad/i.test((await json(regFijo))?.error ?? ''), '')

    // 4. Un aporte de PASANAKU también.
    const pas = (await json(await post('/pasanaku', {
      name: 'AL Pasanaku', account_id: c.id, currency: 'USD', contribution_amount: 60,
      total_slots: 4, my_slot: 2, start_date: HOY,
    }))).pasanaku
    const aportePas = await post(`/pasanaku/${pas.id}/aporte`, { account_id: c.id, amount: 60, date: HOY })
    eq('aportar a un pasanaku comiéndose los ahorros → 400', aportePas.status, 400)

    // 5. Una TRANSFERENCIA común tampoco se los lleva a otra cuenta.
    const transf = await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: c.id, to_account_id: otra.id, amount: 40,
    })
    eq('transferir lo apartado a otra cuenta → 400', transf.status, 400)

    // 6. Y una cuota de DEUDA cobrada no toca nada: es plata que ENTRA.
    accs = (await json(await api('/accounts'))).accounts
    eq('lo apartado sigue intacto tras todos los rechazos',
       accs.find(a => a.id === c.id)?.savings_balance, 50)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AN · el sobrante descuenta lo que los fijos ya guardaron
  //
  // Sin esto el reparto pedía ahorrar plata ya ahorrada: un aporte es una
  // transferencia (`movimiento`), así que ingreso/gasto real ni lo miran, y el
  // sobrante del mes seguía incluyendo lo que el fijo se había llevado.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AN · el sobrante no cuenta dos veces lo ahorrado')
  {
    // Se archiva lo vivo para que la propuesta sea determinística.
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await patch(`/savings-goals/${g.id}`, { archived: true })
    }

    const mesPasado = addMonths(MES, -1)
    const dia = d => `${mesPasado.slice(0, 7)}-${String(d).padStart(2, '0')}`

    const cta = await cuenta('AN Cuenta', { initial_balance: 2000 })
    const guarda = await cuenta('AN Guarda', { initial_balance: 0 })
    const meta = (await json(await post('/savings-goals', {
      name: 'AN Meta', currency: 'USD', is_catchall: true,
    }))).goal
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${meta.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPasado}T00:00:00Z` }),
    })

    // Secciones anteriores del probe también dejaron plata en ese mes, así que
    // todo se mide contra la línea de base, no contra números absolutos.
    const sobrante = async () => (await json(await api('/savings-goals'))).pending_surplus_usd

    await post('/transactions', { type: 'ingreso', date: dia(3), account_id: cta.id, amount: 1000 })
    await post('/transactions', { type: 'gasto', date: dia(8), account_id: cta.id, amount: 600, category_id: comida })

    const bruto = await json(await api('/savings-goals'))
    eq('el mes pasado queda pendiente', bruto.pending_period, mesPasado)
    const base = bruto.pending_surplus_usd

    // Un fijo de ahorro se lleva 100 DENTRO de ese mismo mes.
    await aportar({ goalId: meta.id, fromId: cta.id, toId: guarda.id, amount: 100, date: dia(15) })
    const neto = await json(await api('/savings-goals'))
    eq('el fijo descuenta sus 100 del sobrante', neto.pending_surplus_usd, round2(base - 100))

    // Un TRASLADO no ahorra nada nuevo: no puede tocar el sobrante.
    await post(`/savings-goals/${meta.id}/move`, {
      from_account_id: guarda.id, to_account_id: cta.id, amount: 40, date: dia(20),
    })
    eq('un traslado no mueve el sobrante', await sobrante(), round2(base - 100))

    // Y un aporte de OTRO mes tampoco toca este.
    await aportar({ goalId: meta.id, fromId: cta.id, toId: guarda.id, amount: 250, date: HOY })
    eq('un aporte de este mes no toca el sobrante del pasado', await sobrante(), round2(base - 100))

    // OJO — consecuencia deliberada: `meta` ya recibió el aporte del fijo en
    // ese mes, así que su botón "Ahorrar" está apagado para ese período. Un
    // plan con fijo se financia por el fijo; el sobrante va a los demás.
    eq('un plan que ya recibió el aporte de su fijo no vuelve a guardar ese mes',
       (await post(`/savings-goals/${meta.id}/save`, {
         period: mesPasado, from_account_id: cta.id, amount: 25,
       })).status, 409)

    // Guardar por el camino nuevo tampoco descuenta dos veces: el aporte del
    // reparto no lleva `recurring_id`, así que no entra en la resta.
    const otroPlan = await ahorro('AN Otro')
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${otroPlan.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPasado}T00:00:00Z` }),
    })
    const antesDeGuardar = await sobrante()
    const guardadoAN = await post(`/savings-goals/${otroPlan.id}/save`, {
      period: mesPasado, from_account_id: cta.id, amount: 25,
    })
    eq('un plan sin fijo sí guarda del reparto', guardadoAN.status, 201)
    eq('y no vuelve a bajar el sobrante del mes', await sobrante(), antesDeGuardar)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AO · "Ahorrar" — el reparto plan por plan (Ronda 9)
  //
  // Reemplaza al cierre global. Lo que hay que probar es lo que cambió: que el
  // origen salga de dónde quedó la plata DEL MES, que se pueda guardar sin
  // mover de cuenta, y que el botón se apague una vez por mes y por plan.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AO · ahorrar plan por plan')
  {
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await patch(`/savings-goals/${g.id}`, { archived: true })
    }

    const mesPasado = addMonths(MES, -1)
    const dia = d => `${mesPasado.slice(0, 7)}-${String(d).padStart(2, '0')}`

    const banco = await cuenta('AO Banco', { initial_balance: 0 })
    const otra = await cuenta('AO Otra', { initial_balance: 0 })
    const enBs = await cuenta('AO Bs', { currency: 'BOB', initial_balance: 0 })
    const metaUsd = await ahorro('AO Meta USD')
    const metaBs = await ahorro('AO Meta Bs', { currency: 'BOB' })
    await adminFetch(`/rest/v1/fin_savings_goals?id=in.(${metaUsd.id},${metaBs.id})`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPasado}T00:00:00Z` }),
    })

    // Ese mes entraron 500 a Banco y 300 a la cuenta en Bs; de Banco salieron 100.
    await post('/transactions', { type: 'ingreso', date: dia(3), account_id: banco.id, amount: 500 })
    await post('/transactions', { type: 'gasto', date: dia(9), account_id: banco.id, amount: 100, category_id: comida })
    await post('/transactions', { type: 'ingreso', date: dia(4), account_id: enBs.id, amount: 300 })

    const payload = await json(await api('/savings-goals'))
    eq('el mes pendiente es el que terminó', payload.pending_period, mesPasado)

    // De dónde se puede sacar: lo LIBRE de cada cuenta (saldo menos apartado),
    // no "lo que ese mes dejó ahí". Ver §AP para por qué.
    const fondos = payload.available_funds ?? []
    eq('Banco ofrece sus 500 − 100 libres', fondos.find(f => f.account_id === banco.id)?.available, 400)
    eq('y la cuenta en Bs sus 300', fondos.find(f => f.account_id === enBs.id)?.available, 300)
    ok('una cuenta sin saldo no aparece', !fondos.some(f => f.account_id === otra.id),
       JSON.stringify(fondos))

    const guardar = (goalId, body) => post(`/savings-goals/${goalId}/save`, body)

    // La moneda del plan manda: un ahorro en USD no se alimenta con bolivianos.
    const cruzada = await guardar(metaUsd.id, {
      period: mesPasado, from_account_id: enBs.id, amount: 50,
    })
    eq('guardar en un plan en USD desde una cuenta en Bs → 400', cruzada.status, 400)
    ok('y lo dice por la moneda', /USD/.test((await json(cruzada))?.error ?? ''), '')

    // No se puede guardar más de lo que hay libre en esa cuenta.
    const pasado = await guardar(metaUsd.id, {
      period: mesPasado, from_account_id: banco.id, amount: 450,
    })
    eq('guardar más de lo libre en la cuenta → 400', pasado.status, 400)

    // El mes en curso todavía no terminó.
    eq('guardar el mes en curso → 400',
       (await guardar(metaUsd.id, { period: MES, from_account_id: banco.id, amount: 10 })).status, 400)

    // Sin cuenta destino, se guarda en la MISMA cuenta: el saldo no se mueve,
    // solo pasa a estar apartado.
    const antes = (await json(await api('/accounts'))).accounts.find(a => a.id === banco.id)
    const guardado = await json(await guardar(metaUsd.id, {
      period: mesPasado, from_account_id: banco.id, amount: 250,
    }))
    ok('se guarda en la misma cuenta', !!guardado.transaction?.id, JSON.stringify(guardado))
    eq('con el período del mes que organiza', guardado.transaction.savings_period?.slice(0, 10), mesPasado)
    eq('y es un aporte', guardado.transaction.savings_flow, 'aporte')
    eq('origen y destino son la misma cuenta', guardado.transaction.to_account_id, banco.id)

    const despues = (await json(await api('/accounts'))).accounts.find(a => a.id === banco.id)
    eq('el saldo de la cuenta no se movió', despues.balance, antes.balance)
    eq('pero ahora tiene 250 apartados', despues.savings_balance, 250)

    const conSaldo = (await json(await api('/savings-goals'))).goals.find(g => g.id === metaUsd.id)
    eq('el ahorro subió 250', conSaldo.balance_usd, 250)
    ok('y el mes queda marcado como guardado', conSaldo.saved_periods.includes(mesPasado),
       JSON.stringify(conSaldo.saved_periods))

    // Una vez por mes y por plan.
    eq('guardar dos veces el mismo mes en el mismo plan → 409',
       (await guardar(metaUsd.id, { period: mesPasado, from_account_id: banco.id, amount: 10 })).status, 409)

    // Pero OTRO plan sigue pudiendo guardar ese mismo mes.
    const otroPlan = await guardar(metaBs.id, {
      period: mesPasado, from_account_id: enBs.id, amount: 120,
    })
    eq('otro plan sí puede guardar el mismo mes', otroPlan.status, 201)

    // Y lo ya guardado deja de estar disponible para el siguiente: pasó de
    // libre a apartado dentro de la misma cuenta.
    const fondosTras = (await json(await api('/savings-goals'))).available_funds
    eq('lo guardado ya no figura como disponible',
       fondosTras.find(f => f.account_id === banco.id)?.available, 150)

    // Guardar en OTRA cuenta sí mueve la plata.
    const movido = await json(await guardar(metaUsd.id, {
      period: addMonths(mesPasado, 0) === mesPasado ? mesPasado : mesPasado, // mismo mes, ya usado
      from_account_id: banco.id, to_account_id: otra.id, amount: 10,
    }))
    ok('el mismo plan y mes ya no acepta un segundo aporte', !movido.transaction, JSON.stringify(movido))
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AP · el callejón sin salida de "la plata de ESE mes"
  //
  // Reportado desde la cuenta demo: "acabo de cambiar 1000 Bs a USDT pero aun
  // no me deja ingresar el ahorro. Incluso veo que ya tenía saldo disponible
  // en Binance USDT que podía poner al ahorro."
  //
  // El origen se topeaba contra lo que el mes PENDIENTE había dejado en cada
  // cuenta. Dos consecuencias, las dos malas:
  //   · una cuenta con plata libre hoy no aparecía si ese mes no la había
  //     tocado;
  //   · el propio consejo del sheet —"convertí y volvé a registrar"— era
  //     imposible de seguir: la conversión pasa HOY, que cae en el mes en
  //     curso, no en el que se está organizando.
  // La plata es fungible: el sobrante del mes es un monto, no un lugar.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AP · convertir a la moneda del plan y poder ahorrar')
  {
    for (const g of (await json(await api('/savings-goals'))).goals) {
      if (!g.archived) await patch(`/savings-goals/${g.id}`, { archived: true })
    }

    const mesPrevio = addMonths(MES, -1)
    const diaP = d => `${mesPrevio.slice(0, 7)}-${String(d).padStart(2, '0')}`

    const bs = await cuenta('AP Bs', { currency: 'BOB', initial_balance: 0 })
    const usdt = await cuenta('AP USDT', { currency: 'USDT', initial_balance: 0 })
    const meta = await ahorro('AP Meta', { currency: 'USDT' })
    await adminFetch(`/rest/v1/fin_savings_goals?id=eq.${meta.id}`, {
      method: 'PATCH', body: JSON.stringify({ created_at: `${mesPrevio}T00:00:00Z` }),
    })

    // Todo el sobrante de ese mes entró en bolivianos. La cuenta en USDT no
    // vio un peso durante el período.
    await post('/transactions', { type: 'ingreso', date: diaP(5), account_id: bs.id, amount: 7000 })

    const antes = await json(await api('/savings-goals'))
    eq('el mes pendiente es el que terminó', antes.pending_period, mesPrevio)
    ok('la cuenta en USDT todavía no ofrece nada',
       !(antes.available_funds ?? []).some(f => f.account_id === usdt.id),
       JSON.stringify(antes.available_funds))

    eq('guardar en un plan en USDT desde la cuenta en Bs → 400',
       (await post(`/savings-goals/${meta.id}/save`, {
         period: mesPrevio, from_account_id: bs.id, amount: 100,
       })).status, 400)

    // El usuario hace lo que el sheet le dice: convierte HOY, no en el mes que
    // está organizando.
    const conversion = await post('/transactions', {
      type: 'transferencia', date: HOY, account_id: bs.id, to_account_id: usdt.id,
      amount: 1000, to_amount: 143,
    })
    eq('la conversión se registra', conversion.status, 201)

    const despues = await json(await api('/savings-goals'))
    const enUsdt = (despues.available_funds ?? []).find(f => f.account_id === usdt.id)
    ok('ahora la cuenta en USDT sí ofrece lo convertido', !!enUsdt,
       JSON.stringify(despues.available_funds))
    eq('con lo que realmente llegó', enUsdt?.available, 143)

    const guardado = await json(await post(`/savings-goals/${meta.id}/save`, {
      period: mesPrevio, from_account_id: usdt.id, amount: 143,
    }))
    ok('y el ahorro se puede registrar', !!guardado.transaction?.id, JSON.stringify(guardado))

    const conSaldo = (await json(await api('/savings-goals'))).goals.find(g => g.id === meta.id)
    ok('el plan queda con saldo', conSaldo.balance > 0, String(conSaldo.balance))
    ok('y el mes marcado', conSaldo.saved_periods.includes(mesPrevio),
       JSON.stringify(conSaldo.saved_periods))
  }


  // ─────────────────────────────────────────────────────────────────────────
  // §AQ · los módulos que NO toqué, pero que dependen de lo que sí
  //
  // El piso de ahorro vive en `assertBalance`, por donde pasan cinco caminos;
  // y `monthSurplusUsd` cambió. Presupuesto, Deudas y Pasanaku no se editaron,
  // así que si algo se rompió ahí fue de rebote — que es justo lo que no se
  // ve al mirar los archivos que uno tocó.
  // ─────────────────────────────────────────────────────────────────────────
  section('§AQ · presupuesto, deudas y pasanaku con ahorros de por medio')
  {
    const fuente = await cuenta('AQ Fuente', { initial_balance: 1000 })
    const c = await cuenta('AQ Cuenta', { initial_balance: 500 })
    const meta = await ahorro('AQ Meta')
    const persona = (await json(await post('/people', { name: 'AQ Socio' }))).person

    await aportar({ goalId: meta.id, fromId: fuente.id, toId: c.id, amount: 300 })
    // 500 propios + 300 aportados = 800 de saldo, 300 apartados → 500 libres.

    // ── Presupuesto ────────────────────────────────────────────────────────
    const linea = await json(await post('/budgets', {
      category_ids: [comida], name: 'AQ Comida', currency: 'USD', amount: 200,
    }))
    ok('se puede crear una línea de presupuesto', !!linea.line?.id, JSON.stringify(linea).slice(0, 120))

    const gastoOk = await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 120, category_id: comida,
    })
    eq('un gasto dentro del presupuesto y de lo libre entra', gastoOk.status, 201)

    const presu = await json(await api('/budgets'))
    const conLinea = (presu.categories ?? []).find(l => l.name === 'AQ Comida')
    ok('el presupuesto lo cuenta', conLinea && conLinea.spent_usd >= 120,
       JSON.stringify(conLinea).slice(0, 160))

    // Un retiro de ahorro tipo gasto CON categoría también es gasto real: tiene
    // que pesar en el presupuesto, no colarse por ser "de ahorro".
    const retiroConCat = await post('/transactions', {
      type: 'gasto', date: HOY, account_id: c.id, amount: 40, category_id: comida,
      savings_goal_id: meta.id, savings_reason: 'emergencia',
    })
    eq('un retiro de ahorro con categoría se registra', retiroConCat.status, 201)
    const presu2 = await json(await api('/budgets'))
    const conLinea2 = (presu2.categories ?? []).find(l => l.name === 'AQ Comida')
    ok('y suma al presupuesto como cualquier gasto',
       conLinea2 && round2(conLinea2.spent_usd) >= round2((conLinea?.spent_usd ?? 0) + 40),
       `antes ${conLinea?.spent_usd} · después ${conLinea2?.spent_usd}`)

    // ── Deudas ─────────────────────────────────────────────────────────────
    // Cobrar una cuota es un INGRESO: no consume saldo, así que el piso de
    // ahorro no debería tocarla ni cuando la cuenta está toda apartada.
    const deuda = await json(await post('/debts', {
      person_id: persona.id, concept: 'AQ Préstamo', amount: 80, currency: 'USD', incurred_on: HOY,
    }))
    const seco = await cuenta('AQ Seco', { initial_balance: 0 })
    await aportar({ goalId: meta.id, fromId: fuente.id, toId: seco.id, amount: 100 })
    const cobrar = await post('/debts/settle', {
      split_ids: [deuda.debt.id], account_id: seco.id, amount: 80, date: HOY,
    })
    eq('cobrar una deuda en una cuenta 100% apartada entra igual', cobrar.status, 201)
    const ctasTrasCobro = (await json(await api('/accounts'))).accounts
    eq('el saldo sube con el cobro', ctasTrasCobro.find(a => a.id === seco.id)?.balance, 180)
    eq('y lo apartado no se mueve', ctasTrasCobro.find(a => a.id === seco.id)?.savings_balance, 100)

    // ── Pasanaku ───────────────────────────────────────────────────────────
    const pas = (await json(await post('/pasanaku', {
      name: 'AQ Pasanaku', account_id: c.id, currency: 'USD',
      contribution_amount: 30, total_slots: 4, my_slot: 2, start_date: HOY,
    }))).pasanaku
    eq('un aporte que cabe en lo libre entra',
       (await post(`/pasanaku/${pas.id}/aporte`, { account_id: c.id, amount: 30, date: HOY })).status, 201)
    eq('uno que se comería los ahorros, no',
       (await post(`/pasanaku/${pas.id}/aporte`, { account_id: c.id, amount: 900, date: HOY })).status, 400)

    // Recibir el turno es plata que ENTRA: no la toca el piso.
    const recibir = await post(`/pasanaku/${pas.id}/recibir`, { account_id: seco.id, date: HOY })
    ok('recibir el turno en una cuenta apartada entra', recibir.status < 400,
       `HTTP ${recibir.status} ${JSON.stringify(await json(recibir)).slice(0, 120)}`)
  }

}

await setup()
try { await run() } finally {
  await adminFetch(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
  console.log('\nUsuario de probe eliminado.')
}
process.exit(summary() === 0 ? 0 : 1)
