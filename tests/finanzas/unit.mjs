import { computeBalances, withBalances, totalUsd } from './.fin/accounts.mjs'
import { toUsd, fromUsd, round2, roundFor, usdPerUnit, freezeRate, formatSigned, formatUSD, formatBOB, formatAmount, parseDecimalInput, amountFromInput, num, decimalsFor } from './.fin/money.mjs'
import { freezeConversion, validateInput, monthRange, todayISO, groupByDay, gastoUsd, ingresoUsd, lastMonths, availableFrom, consumesBalance } from './.fin/transactions.mjs'
import { fetchQuotes, quotesAreStale, QUOTE_PAIRS, PAIRS_FOR_CURRENCY } from './.fin/quotes.mjs'
import { eq, ok, section, summary } from './harness.mjs'

/** Tasas de referencia usadas por todas las pruebas. */
const R = { BOB: 6.96, USDT: 1, USDC: 1, BTC: 68000 }

/** Simula tipear tecla por tecla en el input controlado. */
function typeInto(text, opts) {
  let v = ''
  for (const k of text) v = parseDecimalInput(v + k, opts)
  return v
}

section('BUG REPORTADO · separador decimal')
eq('punto: 5.03', typeInto('5.03'), '5.03')
eq('COMA: 5,03 → antes daba "503"', typeInto('5,03'), '5.03')
eq('coma en monto grande: 1234,56', typeInto('1234,56'), '1234.56')
eq('coma sola arranca decimal: ,5', typeInto(',5'), '.5')
eq('Number() de coma tipeada', amountFromInput(typeInto('5,03')), 5.03)
eq('35,50 Bs no se vuelve 3550', amountFromInput(typeInto('35,50')), 35.5)

section('parseDecimalInput · casos borde')
eq('vacío', parseDecimalInput(''), '')
eq('solo separador', parseDecimalInput(','), '.')
eq('dos separadores: 5.0.3', parseDecimalInput('5.0.3'), '5.03')
eq('mezcla punto y coma: 5.0,3', parseDecimalInput('5.0,3'), '5.03')
eq('corta al tercer decimal', parseDecimalInput('5.038'), '5.03')
eq('descarta letras', parseDecimalInput('12a.b5'), '12.5')
eq('descarta símbolos', parseDecimalInput('$1.500'), '1.50')
eq('sin negativos por defecto', parseDecimalInput('-25'), '25')
eq('negativo cuando se permite', parseDecimalInput('-25.5', { allowNegative: true }), '-25.5')
eq('coma negativa', parseDecimalInput('-25,5', { allowNegative: true }), '-25.5')
eq('amountFromInput de vacío es NaN', Number.isNaN(amountFromInput('')), true)
eq('amountFromInput de solo separador es NaN', Number.isNaN(amountFromInput(',')), true)
eq('saldo inicial negativo conserva signo', amountFromInput('-1500,25', { allowNegative: true }), -1500.25)

section('conversión de moneda')
eq('USD no se toca', toUsd(100, 'USD', R), 100)
eq('35 Bs a 6.96', toUsd(35, 'BOB', R), 5.03)
eq('35 Bs a 7.50', toUsd(35, 'BOB', { ...R, BOB: 7.5 }), 4.67)
eq('300 Bs (pasanaku) a 6.96', toUsd(300, 'BOB', R), 43.1)
eq('ida y vuelta USD→BOB', fromUsd(43.1, 'BOB', R), 299.98)
eq('round2 de flotante sucio', round2(0.1 + 0.2), 0.3)
eq('num() de string', num('1299.50'), 1299.5)
eq('num() de null cae al default', num(null, 0), 0)

section('ACTIVOS NUEVOS · USDT, USDC y BTC')
eq('USDT vale 1:1 con el dólar', toUsd(30, 'USDT', R), 30)
eq('USDC vale 1:1 con el dólar', toUsd(250, 'USDC', R), 250)
eq('BTC se multiplica por su precio', toUsd(0.0132, 'BTC', R), 897.6)
eq('un satoshi no desaparece', toUsd(0.00000001, 'BTC', R), 0)
eq('0.01 BTC a 68k', toUsd(0.01, 'BTC', R), 680)

eq('el precio del BTC se guarda directo', usdPerUnit('BTC', R), 68000)
eq('la tasa del Bs se guarda invertida', Math.round(usdPerUnit('BOB', R) * 1e8) / 1e8, 0.14367816)
eq('USD es la referencia y siempre vale 1', usdPerUnit('USD', R), 1)
eq('sin tasa cargada cae al default de la moneda', usdPerUnit('BTC', {}), 68000)

eq('BTC redondea a 8 decimales', roundFor(0.123456789, 'BTC'), 0.12345679)
eq('el fiat sigue en 2', roundFor(5.037, 'USD'), 5.04)
eq('el input de BTC admite 8 decimales', parseDecimalInput('0,00042195', { decimals: 8 }), '0.00042195')
eq('el input de BTC con coma también', amountFromInput('0,0132', { decimals: 8 }), 0.0132)
eq('el input de fiat sigue cortando en 2', parseDecimalInput('5.038', { decimals: 2 }), '5.03')
eq('decimalsFor conoce cada moneda', [decimalsFor('USD'), decimalsFor('BOB'), decimalsFor('USDT'), decimalsFor('BTC')], [2, 2, 2, 8])

eq('el BTC se formatea con su código detrás', formatAmount(0.0132, 'BTC'), '0.0132 BTC')
eq('USDT también', formatAmount(30, 'USDT'), '30.00 USDT')
eq('el dólar mantiene el símbolo delante', formatAmount(30, 'USD'), '$30.00')
eq('el boliviano también', formatAmount(30, 'BOB'), 'Bs 30.00')

section('patrimonio con los cinco activos')
const cartera = [
  { id: 'airtm', name: 'Airtm', currency: 'USD',  initial_balance: 1041,   initial_balance_date: '2026-08-01', sort_order: 0, archived: false },
  { id: 'bnb',   name: 'BNB',   currency: 'BOB',  initial_balance: 696,    initial_balance_date: '2026-08-01', sort_order: 1, archived: false },
  { id: 'usdt',  name: 'USDT',  currency: 'USDT', initial_balance: 30,     initial_balance_date: '2026-08-01', sort_order: 2, archived: false },
  { id: 'usdc',  name: 'USDC',  currency: 'USDC', initial_balance: 120,    initial_balance_date: '2026-08-01', sort_order: 3, archived: false },
  { id: 'btc',   name: 'BTC',   currency: 'BTC',  initial_balance: 0.0132, initial_balance_date: '2026-08-01', sort_order: 4, archived: false },
]
// 1041 + 100 + 30 + 120 + 897.60
eq('suma las cinco monedas', totalUsd(withBalances(cartera, [], R)), 2188.6)
eq('si el BTC sube a 80k el patrimonio sube solo',
   totalUsd(withBalances(cartera, [], { ...R, BTC: 80000 })), 2347)
eq('el saldo en BTC conserva sus decimales',
   withBalances(cartera, [], R).find(a => a.id === 'btc').balance, 0.0132)

section('transferencia con comisión entre stablecoins')
// El caso que justificó hacerlas monedas propias: salen 50 USD y llegan 48.75
// USDT. La diferencia es la comisión, y queda registrada.
const conComision = computeBalances(cartera, [
  { type: 'transferencia', account_id: 'airtm', to_account_id: 'usdt', amount: 50, to_amount: 48.75 },
])
eq('sale lo que salió', conComision.get('airtm'), 991)
eq('llega lo que llegó, no lo que "debería"', conComision.get('usdt'), 78.75)
ok('el patrimonio baja exactamente la comisión',
   Math.abs(totalUsd(withBalances(cartera, [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'usdt', amount: 50, to_amount: 48.75 }], R)) - (2188.6 - 1.25)) < 0.01)

section('compra de BTC entre monedas distintas')
const compra = computeBalances(cartera, [
  { type: 'transferencia', account_id: 'airtm', to_account_id: 'btc', amount: 680, to_amount: 0.00998 },
])
eq('salen 680 USD', compra.get('airtm'), 361)
eq('entran 0.00998 BTC reales', compra.get('btc'), 0.02318)

section('saldos derivados')
const accounts = [
  { id: 'airtm',    name: 'Airtm',    currency: 'USD', initial_balance: 1299, initial_balance_date: '2026-08-01', sort_order: 0, archived: false },
  { id: 'broker',   name: 'Broker',   currency: 'USD', initial_balance: 980,  initial_balance_date: '2026-08-01', sort_order: 1, archived: false },
  { id: 'btc',      name: 'Bitcoin',  currency: 'USD', initial_balance: 900,  initial_balance_date: '2026-08-01', sort_order: 2, archived: false },
  { id: 'usdt',     name: 'USDT',     currency: 'USD', initial_balance: 30,   initial_balance_date: '2026-08-01', sort_order: 3, archived: false },
  { id: 'efectivo', name: 'Efectivo', currency: 'BOB', initial_balance: 0,    initial_balance_date: '2026-08-01', sort_order: 4, archived: false },
  { id: 'banco',    name: 'Bancos',   currency: 'BOB', initial_balance: 0,    initial_balance_date: '2026-08-01', sort_order: 5, archived: false },
]
const byId = new Map(accounts.map(a => [a.id, a]))

eq('patrimonio inicial = 3209', totalUsd(withBalances(accounts, [], R)), 3209)
eq('gasto baja el saldo',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'efectivo', to_account_id: null, amount: 35, to_amount: null }]).get('efectivo'), -35)
eq('ingreso sube el saldo',
   computeBalances(accounts, [{ type: 'ingreso', account_id: 'airtm', to_account_id: null, amount: 900, to_amount: null }]).get('airtm'), 2199)

const tr = [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'broker', amount: 100, to_amount: null }]
eq('transferencia no mueve el patrimonio', totalUsd(withBalances(accounts, tr, R)), 3209)

const cross = computeBalances(accounts, [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'efectivo', amount: 50, to_amount: 348 }])
eq('cross-currency: sale 50 USD', cross.get('airtm'), 1249)
eq('cross-currency: entran 348 Bs reales', cross.get('efectivo'), 348)

eq('editar 35→50 no acumula',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'efectivo', to_account_id: null, amount: 50, to_amount: null }]).get('efectivo'), -50)
eq('cuenta archivada no suma al patrimonio',
   totalUsd(withBalances(accounts.map(a => a.id === 'btc' ? { ...a, archived: true } : a), [], R)), 2309)
eq('movimiento de cuenta inexistente no rompe',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'fantasma', to_account_id: null, amount: 10, to_amount: null }]).get('airtm'), 1299)

section('patrimonio con BOB usa la tasa de HOY')
const conBs = [...accounts.slice(0, 4), { ...accounts[4], initial_balance: 696 }, accounts[5]]
eq('696 Bs a 6.96 suman 100 USD', totalUsd(withBalances(conBs, [], R)), 3309)
eq('los mismos 696 Bs a 7.50 suman 92.80', totalUsd(withBalances(conBs, [], { ...R, BOB: 7.5 })), 3301.8)

section('congelado de la conversión')
ok('el factor congelado del Bs es 1/6.96 USD por unidad',
   Math.abs(freezeConversion(35, 'BOB', R).exchange_rate - 1 / 6.96) < 1e-9,
   `obtenido: ${freezeConversion(35, 'BOB', R).exchange_rate}`)
eq('y amount_usd = monto × factor', freezeConversion(35, 'BOB', R).amount_usd, 5.03)
eq('en USD el factor es 1', freezeConversion(100, 'USD', R), { exchange_rate: 1, amount_usd: 100 })

section('validación de forma')
const base = { date: '2026-08-18', account_id: 'airtm' }
eq('gasto válido', validateInput({ ...base, type: 'gasto', amount: 10 }, byId).ok, true)
eq('monto cero falla', validateInput({ ...base, type: 'gasto', amount: 0 }, byId).ok, false)
eq('monto NaN falla', validateInput({ ...base, type: 'gasto', amount: NaN }, byId).ok, false)
eq('monto negativo falla', validateInput({ ...base, type: 'gasto', amount: -5 }, byId).ok, false)
eq('fecha mal formada falla', validateInput({ type: 'gasto', date: '18/08/2026', account_id: 'airtm', amount: 5 }, byId).ok, false)
eq('cuenta inexistente falla', validateInput({ ...base, type: 'gasto', account_id: 'nope', amount: 5 }, byId).ok, false)
eq('tipo inválido falla', validateInput({ ...base, type: 'inversion', amount: 5 }, byId).ok, false)
eq('gasto con destino falla', validateInput({ ...base, type: 'gasto', to_account_id: 'broker', amount: 5 }, byId).ok, false)
eq('transferencia sin destino falla', validateInput({ ...base, type: 'transferencia', amount: 5 }, byId).ok, false)
eq('transferencia a sí misma falla', validateInput({ ...base, type: 'transferencia', to_account_id: 'airtm', amount: 5 }, byId).ok, false)
eq('transferencia con categoría falla', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', category_id: 'c1', amount: 5 }, byId).ok, false)
eq('transferencia misma moneda sin to_amount pasa', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', amount: 5 }, byId).ok, true)
eq('transferencia misma moneda CON to_amount falla', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', to_amount: 5, amount: 5 }, byId).ok, false)
eq('cross-currency sin to_amount falla', validateInput({ ...base, type: 'transferencia', to_account_id: 'efectivo', amount: 50 }, byId).ok, false)
eq('cross-currency con to_amount pasa', validateInput({ ...base, type: 'transferencia', to_account_id: 'efectivo', to_amount: 348, amount: 50 }, byId).ok, true)
ok('el mensaje de cross-currency nombra la cuenta destino',
   validateInput({ ...base, type: 'transferencia', to_account_id: 'efectivo', amount: 50 }, byId).error.includes('Efectivo'))

section('TRANSFERENCIA ENTRE MONEDAS · sugerencia y comisión')
// La sugerencia es origen → USD → destino, con las tasas de hoy.
const sugerir = (monto, de, a) => fromUsd(toUsd(monto, de, R), a, R)

eq('USD → BOB a 6.96', sugerir(50, 'USD', 'BOB'), 348)
eq('BOB → USD vuelve al origen', sugerir(348, 'BOB', 'USD'), 50)
eq('USD → USDT es casi 1:1', sugerir(50, 'USD', 'USDT'), 50)
eq('USD → BTC a 68000', sugerir(680, 'USD', 'BTC'), 0.01)
eq('BTC → USD', sugerir(0.01, 'BTC', 'USD'), 680)
eq('BOB → BTC cruza dos tasas', sugerir(6960, 'BOB', 'BTC'), 0.01470588)
eq('la sugerencia respeta los decimales del destino',
   String(sugerir(1, 'USD', 'BTC')).split('.')[1].length <= 8, true)

// Lo que se guarda es lo que llegó, no la sugerencia: ahí está la comisión.
const comision = (sale, de, llega, a) => round2(toUsd(llega, a, R) - toUsd(sale, de, R))
eq('conversión perfecta no deja diferencia', comision(50, 'USD', 348, 'BOB'), 0)
eq('Airtm → USDT con comisión de 1.25', comision(50, 'USD', 48.75, 'USDT'), -1.25)
eq('una tasa mejor que la referencia queda a favor', comision(50, 'USD', 360, 'BOB'), 1.72)
eq('comprar BTC con comisión', comision(680, 'USD', 0.0098, 'BTC'), -13.6)

// El saldo refleja lo que realmente pasó, no la sugerencia.
const trCom = computeBalances(accounts, [
  { type: 'transferencia', account_id: 'airtm', to_account_id: 'efectivo', amount: 50, to_amount: 340 },
])
eq('sale lo que salió', trCom.get('airtm'), 1249)
eq('entra lo que entró, no lo sugerido', trCom.get('efectivo'), 340)
ok('y el patrimonio baja la comisión',
   Math.abs(totalUsd(withBalances(accounts, [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'efectivo', amount: 50, to_amount: 340 }], R)) - (3209 - 1.15)) < 0.02)

// El tope aplica al monto que SALE, no al que llega.
eq('el disponible se mide en la moneda de origen', availableFrom(1299, null, 'airtm'), 1299)

section('TOPE DE SALDO · qué se puede gastar')
eq('un gasto consume saldo', consumesBalance('gasto'), true)
eq('una transferencia también', consumesBalance('transferencia'), true)
eq('un ingreso no', consumesBalance('ingreso'), false)

eq('sin edición, el disponible es el saldo', availableFrom(1299, null, 'airtm'), 1299)
eq('sin cuenta, el disponible es el saldo', availableFrom(1299, { type: 'gasto', account_id: 'airtm', amount: 35 }, undefined), 1299)

// El caso que hace falta corregir: editar un gasto hacia arriba.
// Saldo 0 con un gasto de 35 ya aplicado ⇒ se puede subir hasta 35.
eq('editando un gasto, se devuelve lo que ese gasto ya restó',
   availableFrom(0, { type: 'gasto', account_id: 'efectivo', amount: 35 }, 'efectivo'), 35)
eq('editando una transferencia, igual',
   availableFrom(100, { type: 'transferencia', account_id: 'airtm', amount: 50 }, 'airtm'), 150)
// Pasar de ingreso a gasto: el saldo tenía el ingreso sumado, hay que restarlo.
eq('editando un ingreso, se descuenta lo que ese ingreso sumó',
   availableFrom(900, { type: 'ingreso', account_id: 'airtm', amount: 900 }, 'airtm'), 0)
eq('si la cuenta cambió, no se corrige nada',
   availableFrom(500, { type: 'gasto', account_id: 'efectivo', amount: 35 }, 'airtm'), 500)

eq('un saldo negativo deja disponible negativo', availableFrom(-20, null, 'x'), -20)
eq('en BTC el disponible conserva decimales',
   availableFrom(0.0132, { type: 'gasto', account_id: 'btc', amount: 0.0002 }, 'btc'), 0.0134)

section('totales del período · gasto real vs movimiento')
const periodo = [
  { type: 'gasto',          amount_usd: 5.03 },
  { type: 'gasto',          amount_usd: 2.15 },
  { type: 'ingreso',        amount_usd: 900 },
  { type: 'transferencia',  amount_usd: 100 },
]
eq('solo suma gastos', gastoUsd(periodo), 7.18)
eq('solo suma ingresos', ingresoUsd(periodo), 900)
ok('la transferencia no entra en ninguno', gastoUsd(periodo) + ingresoUsd(periodo) === 907.18)

section('fechas')
eq('agosto 2026', monthRange(new Date(2026, 7, 18)), { from: '2026-08-01', to: '2026-08-31' })
eq('febrero bisiesto 2028', monthRange(new Date(2028, 1, 5)), { from: '2028-02-01', to: '2028-02-29' })
eq('febrero normal 2027', monthRange(new Date(2027, 1, 5)), { from: '2027-02-01', to: '2027-02-28' })
eq('diciembre no se desborda', monthRange(new Date(2026, 11, 31)), { from: '2026-12-01', to: '2026-12-31' })
ok('todayISO tiene formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(todayISO()))
eq('agrupa por día, más reciente primero',
   groupByDay([{ date: '2026-08-01' }, { date: '2026-08-18' }, { date: '2026-08-01' }]).map(d => [d.date, d.items.length]),
   [['2026-08-18', 1], ['2026-08-01', 2]])

section('REGRESIÓN · lastMonths no puede perder meses')
// El bug original: d.setMonth(d.getMonth()-1) parado un 29/30/31 cae en un día
// inexistente y Date rebota al mes siguiente. La lista repetía un mes y se
// comía otro, y ese mes perdido quedaba imposible de filtrar desde la UI.
for (const [etiqueta, ref] of [
  ['18 de agosto', new Date(2026, 7, 18)],
  ['29 de agosto', new Date(2026, 7, 29)],
  ['30 de agosto', new Date(2026, 7, 30)],
  ['31 de agosto', new Date(2026, 7, 31)],
  ['31 de marzo',  new Date(2026, 2, 31)],
  ['31 de mayo',   new Date(2026, 4, 31)],
  ['29 de febrero bisiesto', new Date(2028, 1, 29)],
]) {
  const meses = lastMonths(12, ref).map(m => m.value)
  ok(`${etiqueta}: 12 meses distintos`, new Set(meses).size === 12, meses.join(' '))
  // Cada entrada debe ser exactamente un mes anterior a la previa.
  const consecutivos = meses.every((m, i) => {
    if (i === 0) return true
    const [y1, m1] = meses[i - 1].split('-').map(Number)
    const [y0, m0] = m.split('-').map(Number)
    return y1 * 12 + m1 - (y0 * 12 + m0) === 1
  })
  ok(`${etiqueta}: consecutivos sin saltos`, consecutivos, meses.join(' '))
}
eq('el mes actual va primero', lastMonths(3, new Date(2026, 7, 31))[0].value, '2026-08')
eq('cruza el año hacia atrás', lastMonths(3, new Date(2026, 0, 31)).map(m => m.value), ['2026-01', '2025-12', '2025-11'])
eq('la etiqueta arranca en mayúscula', lastMonths(1, new Date(2026, 7, 18))[0].label, 'Agosto de 2026')

section('COTIZACIONES · frescura')
const ahora = () => new Date().toISOString()
const haceMin = m => new Date(Date.now() - m * 60000).toISOString()
const todas = extra => Object.fromEntries(QUOTE_PAIRS.map(p => [p, { pair: p, rate: 1, source: 's', fetched_at: extra ?? ahora() }]))

eq('todo fresco no está vencido', quotesAreStale(todas()), false)
eq('todo viejo está vencido', quotesAreStale(todas(haceMin(45))), true)
eq('vacío está vencido', quotesAreStale({}), true)
{
  const falta = todas()
  delete falta.BTC_USD
  eq('si falta un par, está vencido', quotesAreStale(falta), true)
}
{
  const uno = todas()
  uno.BTC_USD = { ...uno.BTC_USD, fetched_at: haceMin(45) }
  eq('un solo par viejo alcanza para refrescar', quotesAreStale(uno), true)
}
eq('el TTL es configurable', quotesAreStale(todas(haceMin(10)), 5 * 60000), true)

section('COTIZACIONES · parseo de cada fuente')
const realFetch = globalThis.fetch
function mockFetch(handler) {
  globalThis.fetch = async url => {
    const body = handler(String(url))
    if (body === null) throw new Error('caída')
    return { ok: true, json: async () => body }
  }
}
const OFICIAL  = { moneda: 'USD', casa: 'oficial', compra: 11.5, venta: 11.55 }
const PARALELO = { timestamp: ahora(), buy: 11.64, sell: 11.6, median: 11.62 }
const CRIPTO   = { tether: { usd: 0.999409 }, 'usd-coin': { usd: 0.999711 }, bitcoin: { usd: 64711 } }
const todoOk = u => u.includes('dolarapi') ? OFICIAL : u.includes('paralelo') ? PARALELO : CRIPTO

mockFetch(todoOk)
{
  const q = await fetchQuotes()
  const byPair = Object.fromEntries(q.map(x => [x.pair, x.rate]))
  eq('trae los 5 pares', q.length, 5)
  eq('el oficial usa la venta', byPair.BOB_USD, 11.55)
  eq('el paralelo usa la mediana', byPair.BOB_USDT, 11.62)
  eq('USDT desde CoinGecko', byPair.USDT_USD, 0.999409)
  eq('USDC desde CoinGecko', byPair.USDC_USD, 0.999711)
  eq('BTC desde CoinGecko', byPair.BTC_USD, 64711)
  ok('cada par declara su fuente', q.every(x => typeof x.source === 'string' && x.source.length > 0))
}

mockFetch(u => u.includes('paralelo') ? null : todoOk(u))
{
  const q = await fetchQuotes()
  eq('una fuente caída no tumba al resto', q.length, 4)
  ok('y el par afectado simplemente no viene', !q.some(x => x.pair === 'BOB_USDT'))
}

mockFetch(() => null)
eq('si se cae todo devuelve vacío en vez de explotar', (await fetchQuotes()).length, 0)

mockFetch(u => u.includes('dolarapi') ? { venta: 'no-es-un-numero' } : u.includes('paralelo') ? {} : CRIPTO)
{
  const q = await fetchQuotes()
  ok('descarta un valor no numérico', !q.some(x => x.pair === 'BOB_USD'))
  ok('descarta una respuesta sin los campos esperados', !q.some(x => x.pair === 'BOB_USDT'))
  eq('pero conserva las que sí sirven', q.length, 3)
}

mockFetch(u => u.includes('dolarapi') ? { venta: 0 } : u.includes('paralelo') ? { median: -5 } : CRIPTO)
{
  const q = await fetchQuotes()
  ok('descarta una tasa en cero', !q.some(x => x.pair === 'BOB_USD'))
  ok('descarta una tasa negativa', !q.some(x => x.pair === 'BOB_USDT'))
}
globalThis.fetch = realFetch

section('COTIZACIONES · qué puede seguir cada moneda')
eq('el Bs es el único con dos opciones', PAIRS_FOR_CURRENCY.BOB, ['BOB_USD', 'BOB_USDT'])
eq('el BTC sigue solo su par', PAIRS_FOR_CURRENCY.BTC, ['BTC_USD'])
eq('USD no sigue ninguno', PAIRS_FOR_CURRENCY.USD, undefined)

section('formato de montos')
eq('gasto con menos U+2212', formatSigned(5.03, 'USD', 'gasto'), '−$5.03')
eq('ingreso con más', formatSigned(900, 'USD', 'ingreso'), '+$900.00')
eq('transferencia sin signo', formatSigned(100, 'USD', 'transferencia'), '$100.00')
eq('BOB con prefijo', formatSigned(35, 'BOB', 'gasto'), '−Bs 35.00')
eq('miles con separador', formatUSD(3209), '$3,209.00')
eq('siempre 2 decimales', formatUSD(5.1), '$5.10')
eq('negativo en USD', formatUSD(-42.5), '−$42.50')
eq('BOB con miles', formatBOB(1234.5), 'Bs 1,234.50')

process.exit(summary() === 0 ? 0 : 1)
