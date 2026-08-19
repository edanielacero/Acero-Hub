import { computeBalances, withBalances, totalUsd } from './.fin/accounts.mjs'
import { toUsd, fromUsd, round2, roundFor, usdPerUnit, freezeRate, formatSigned, formatUSD, formatBOB, formatAmount, parseDecimalInput, amountFromInput, num, decimalsFor } from './.fin/money.mjs'
import { freezeConversion, validateInput, monthRange, todayISO, groupByDay, gastoUsd, ingresoUsd, lastMonths, availableFrom, consumesBalance, flowTypeFor, flowTypeOnEdit } from './.fin/transactions.mjs'
import { fetchQuotes, quotesAreStale, QUOTE_PAIRS, PAIRS_FOR_CURRENCY } from './.fin/quotes.mjs'
import { evenSplit, floorTo, myShare, shareBreakdown, debtState, isOpen, freezeDebtUsd, gastoBrutoUsd, repartidoUsd, gastoRealUsd, porCobrarUsd, daysBetween, groupByPerson, normalizeName } from './.fin/splits.mjs'
import { periodOf, statusOf, resolveSplits, sortRecurring, progress, validateTemplateSplits, pendingPeriods } from './.fin/recurring.mjs'
import { planTotal, equalInstallments, installmentDate, generateEqualPlan, planCerrado, planRollup } from './.fin/plans.mjs'
import { readSnapshot, writeSnapshot, clearSnapshots } from './.fin/snapshot.mjs'
import { readSessionClaims } from './.fin/session-claims.mjs'
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

/* ══════════════════════════════════════════════════════════════════════════
   SPRINT 2 · Compartidos y reembolsos
   ══════════════════════════════════════════════════════════════════════════ */

section('SPRINT 2 · división pareja (el que paga se come los centavos)')
{
  // Bs 350 entre 3: 116.6666… no cierra. Redondear hacia arriba daría 350.01.
  const bs = evenSplit(350, 3, 'BOB')
  eq('Bs 350 entre 3 → dos partes de 116.66', bs.shares, [116.66, 116.66])
  eq('y el resto queda de tu lado: 116.68', bs.mine, 116.68)
  eq('las partes NUNCA superan el total', bs.shares.reduce((a, b) => a + b, 0) + bs.mine, 350)

  const exacto = evenSplit(10, 2, 'USD')
  eq('división exacta no inventa resto: 10 entre 2', exacto.shares, [5])
  eq('tu parte también es 5', exacto.mine, 5)

  // 3.30 / 3 da 1.0999999999999999 en coma flotante. Un floor crudo lo bajaría
  // a 1.09 y regalaría un centavo por persona.
  const flotante = evenSplit(3.3, 3, 'USD')
  eq('el ruido de coma flotante no come un centavo', flotante.shares, [1.1, 1.1])
  eq('y tu parte cierra el total', flotante.mine, 1.1)

  const spotify = evenSplit(11.99, 4, 'USD')
  eq('Spotify $11.99 entre 4 → $2.99 cada amigo', spotify.shares, [2.99, 2.99, 2.99])
  eq('y vos ponés $3.02', spotify.mine, 3.02)

  const btc = evenSplit(0.00042195, 3, 'BTC')
  eq('BTC respeta 8 decimales', btc.shares, [0.00014065, 0.00014065])
  eq('y el resto en satoshis', btc.mine, 0.00014065)

  eq('un solo participante no reparte nada', evenSplit(100, 1, 'USD').shares, [])
  eq('monto en cero no rompe', evenSplit(0, 3, 'USD').shares, [])
}

section('SPRINT 2 · floorTo')
eq('trunca, no redondea: 116.669 → 116.66', floorTo(116.669, 'BOB'), 116.66)
eq('el epsilon salva 1.0999999999999999', floorTo(3.3 / 3, 'USD'), 1.1)
eq('BTC no se destruye a 2 decimales', floorTo(0.123456789, 'BTC'), 0.12345678)

section('SPRINT 2 · tu parte es la resta')
eq('11.99 menos tres partes de 2.99', myShare(11.99, [{ amount: 2.99 }, { amount: 2.99 }, { amount: 2.99 }], 'USD'), 3.02)
eq('sin reparto, tuyo es todo', myShare(35, [], 'BOB'), 35)
eq('reparto completo deja cero', myShare(10, [{ amount: 10 }], 'USD'), 0)

section('SPRINT 2 · estado derivado de dos punteros')
eq('sin nada → pendiente', debtState({ settled_tx_id: null, waived_at: null }), 'pendiente')
eq('con movimiento → cobrado', debtState({ settled_tx_id: 'tx-1', waived_at: null }), 'cobrado')
eq('con fecha de perdón → perdonado', debtState({ settled_tx_id: null, waived_at: '2026-08-18' }), 'perdonado')
eq('solo el pendiente está abierto', [
  isOpen({ settled_tx_id: null, waived_at: null }),
  isOpen({ settled_tx_id: 'tx-1', waived_at: null }),
  isOpen({ settled_tx_id: null, waived_at: '2026-08-18' }),
], [true, false, false])

section('SPRINT 2 · la parte hereda la tasa CONGELADA del gasto padre')
{
  // Gasto de Bs 350 registrado a 6.96 → factor 0.14367816.
  const factor = freezeRate('BOB', R)
  eq('el gasto entero da $50.29', round2(350 * factor), 50.29)
  eq('la parte de Ana (116.66) da $16.76', freezeDebtUsd(116.66, factor), 16.76)

  // Tres días después el dólar está a 7.50. La parte NO puede recalcularse.
  const hoy = freezeRate('BOB', { ...R, BOB: 7.5 })
  ok('con la tasa de hoy daría otra cosa', freezeDebtUsd(116.66, hoy) !== 16.76,
     `hoy daría ${freezeDebtUsd(116.66, hoy)}`)
  eq('pero la congelada no se mueve', freezeDebtUsd(116.66, factor), 16.76)

  // Tu parte en USD NO se congela por separado: es el resto. Congelar las tres
  // por su cuenta daría 16.76 × 3 = 50.28 contra un gasto de 50.29, y ese
  // centavo tiene que caer en algún lado. Cae del lado del que pagó, igual que
  // en la división pareja en moneda nativa.
  const ajenas = [116.66, 116.66].map(a => freezeDebtUsd(a, factor))
  eq('las dos partes ajenas suman $33.52', round2(ajenas[0] + ajenas[1]), 33.52)
  eq('tu parte en USD es el resto, y absorbe el centavo', round2(50.29 - 33.52), 16.77)
  ok('congelarla aparte daría un centavo menos', freezeDebtUsd(116.68, factor) === 16.76)

  // En moneda nativa no hay deriva: ahí sí cierra exacto.
  eq('en Bs el reparto cierra sin resto', round2(116.66 * 2 + 116.68), 350)
}

section('SPRINT 2 · normalizeName')
eq('recorta y baja', normalizeName('  Ana  '), 'ana')
eq('"ana" y "Ana" chocan', normalizeName('ana') === normalizeName('Ana'), true)

section('SPRINT 2 · flow_type separa consumo de movimiento')
{
  const gastoNormal = { type: 'gasto', flow_type: 'consumo', amount_usd: 50, debts: [] }
  const sueldo = { type: 'ingreso', flow_type: 'consumo', amount_usd: 900, debts: [] }
  const reembolso = { type: 'ingreso', flow_type: 'movimiento', amount_usd: 8.99, debts: [] }
  const transfer = { type: 'transferencia', flow_type: 'movimiento', amount_usd: 100, debts: [] }

  const todos = [gastoNormal, sueldo, reembolso, transfer]
  eq('un reembolso NO es ingreso del mes', ingresoUsd(todos), 900)
  eq('el gasto no lo tocan los movimientos', gastoUsd(todos), 50)

  // Una fila sin flow_type — de antes de la migración — es consumo.
  eq('fila vieja sin flow_type cuenta como consumo',
     ingresoUsd([{ type: 'ingreso', amount_usd: 100, debts: [] }]), 100)
}

section('FEATURE 11 · flowTypeFor — cuentas de inversión (movimiento nuevo)')
{
  const normal = { is_investment: false }
  const broker = { is_investment: true }

  eq('gasto en cuenta normal → consumo', flowTypeFor('gasto', normal), 'consumo')
  eq('ingreso en cuenta normal → consumo', flowTypeFor('ingreso', normal), 'consumo')
  eq('gasto en cuenta de inversión → movimiento', flowTypeFor('gasto', broker), 'movimiento')
  eq('ingreso en cuenta de inversión → movimiento', flowTypeFor('ingreso', broker), 'movimiento')
  // Una transferencia es movimiento pase lo que pase con la cuenta — la regla
  // vieja de Sprint 1 no puede quedar pisada por la nueva.
  eq('transferencia en cuenta normal → movimiento', flowTypeFor('transferencia', normal), 'movimiento')
  eq('transferencia en cuenta de inversión → movimiento', flowTypeFor('transferencia', broker), 'movimiento')
}

section('FEATURE 11 · flowTypeOnEdit — nunca degrada un movimiento existente')
{
  const normal = { is_investment: false }
  const broker = { is_investment: true }

  eq('gasto consumo que se pasa a cuenta de inversión → sube a movimiento',
     flowTypeOnEdit('gasto', broker, 'consumo'), 'movimiento')
  eq('gasto consumo que se queda en cuenta normal → sigue consumo',
     flowTypeOnEdit('gasto', normal, 'consumo'), 'consumo')

  // El caso que importa: un cobro de deuda (nace 'movimiento' en
  // /debts/settle, tipo 'ingreso') se edita acá — cambiar la descripción o la
  // fecha NO puede volverlo ingreso real solo porque su cuenta no es de
  // inversión. Bajar la clasificación sería adivinar por qué era movimiento.
  eq('un cobro de deuda en cuenta normal conserva movimiento al editarse',
     flowTypeOnEdit('ingreso', normal, 'movimiento'), 'movimiento')

  // Mismo criterio, ahora con la cuenta de inversión: sacarla no lo degrada.
  eq('un gasto de inversión al que le sacan la cuenta de inversión sigue movimiento',
     flowTypeOnEdit('gasto', normal, 'movimiento'), 'movimiento')

  // Y el otro sentido de la transferencia: precedente ya existente en Sprint 1,
  // no algo que esta feature cambie.
  eq('una transferencia que pasa a gasto en cuenta normal conserva movimiento',
     flowTypeOnEdit('gasto', normal, 'movimiento'), 'movimiento')
  eq('una transferencia que pasa a gasto en cuenta de inversión sigue movimiento',
     flowTypeOnEdit('gasto', broker, 'movimiento'), 'movimiento')
}

section('SPRINT 2 · gasto bruto, repartido y real')
{
  // Spotify $11.99 repartido entre 3 amigos a $2.99, uno de ellos perdonado.
  const spotify = {
    type: 'gasto', flow_type: 'consumo', amount_usd: 11.99,
    debts: [
      { amount_usd: 2.99, settled_tx_id: 'tx-c', waived_at: null },  // cobrado
      { amount_usd: 2.99, settled_tx_id: null, waived_at: null },    // pendiente
      { amount_usd: 2.99, settled_tx_id: null, waived_at: '2026-08-18' }, // perdonado
    ],
  }
  const comida = { type: 'gasto', flow_type: 'consumo', amount_usd: 50, debts: [] }
  const reembolso = { type: 'ingreso', flow_type: 'movimiento', amount_usd: 2.99, debts: [] }
  const mes = [spotify, comida, reembolso]

  eq('bruto: lo que salió del bolsillo', gastoBrutoUsd(mes), 61.99)
  eq('repartido descuenta cobrado Y pendiente, no perdonado', repartidoUsd(mes), 5.98)
  eq('gasto real', gastoRealUsd(mes), 56.01)

  // Perdonar es hacerse cargo: sin el perdonado, el real bajaría a 53.02.
  const sinPerdonar = [{ ...spotify, debts: spotify.debts.map(s => ({ ...s, waived_at: null })) }, comida, reembolso]
  eq('si nada estuviera perdonado, el real es menor', gastoRealUsd(sinPerdonar), 53.02)
  ok('perdonar SUBE el gasto real', gastoRealUsd(mes) > gastoRealUsd(sinPerdonar))
}

section('SPRINT 2 · lo que te deben es un saldo, no un flujo')
{
  const splits = [
    { amount_usd: 3, settled_tx_id: null, waived_at: null },
    { amount_usd: 2.5, settled_tx_id: null, waived_at: null },
    { amount_usd: 10, settled_tx_id: 'tx-1', waived_at: null },
    { amount_usd: 7, settled_tx_id: null, waived_at: '2026-03-01' },
  ]
  eq('solo suma lo pendiente', porCobrarUsd(splits), 5.5)
  eq('sin deudas da cero, no NaN', porCobrarUsd([]), 0)
}

section('SPRINT 2 · antigüedad de una deuda')
eq('13 días', daysBetween('2026-08-05', '2026-08-18'), 13)
eq('mismo día es cero', daysBetween('2026-08-18', '2026-08-18'), 0)
eq('cruza el cambio de mes', daysBetween('2026-07-31', '2026-08-01'), 1)
eq('cruza el cambio de año', daysBetween('2025-12-31', '2026-01-01'), 1)
// Con Date local y horario de verano, 24h no siempre son 24h; por eso se
// calcula en UTC a partir de los enteros de la fecha.
eq('un año entero', daysBetween('2025-08-18', '2026-08-18'), 365)

section('SPRINT 2 · agrupado por persona')
{
  // `incurred_on` es la fecha canónica: con gasto padre se hereda de él, y
  // suelta la pone el usuario. Ordenar y envejecer usan esa, no la del gasto.
  const mk = (id, person, usd, date) => ({
    id, person_id: person, amount_usd: usd, incurred_on: date, concept: null,
    person: { id: person, name: person, archived: false },
    transaction: { id: 't' + id, date, description: 'x', amount: usd, currency: 'USD', category_id: null },
    settled_tx_id: null, waived_at: null, amount: usd, currency: 'USD', transaction_id: 't' + id, note: null,
    state: 'pendiente',
  })
  const g = groupByPerson([
    mk('1', 'Ana', 3, '2026-08-05'),
    mk('2', 'Juan', 10, '2026-08-10'),
    mk('3', 'Ana', 2.5, '2026-07-01'),
  ], '2026-08-18')

  eq('una entrada por persona', g.length, 2)
  eq('ordenado por lo que más deben', g.map(x => x.person.name), ['Juan', 'Ana'])
  eq('Ana suma sus dos deudas', g[1].open_usd, 5.5)
  eq('y la antigüedad es la de la más vieja', g[1].oldest_days, 48)
  eq('las deudas de cada uno van de la más vieja a la más nueva',
     g[1].debts.map(s => s.incurred_on), ['2026-07-01', '2026-08-05'])

  // Una deuda SUELTA no tiene gasto padre. Antes esto era imposible de
  // representar; es la corrección del modelo del 2026-08-19.
  const suelta = { ...mk('4', 'Ana', 20, '2026-06-01'), transaction: null, transaction_id: null, concept: 'Le presté efectivo' }
  const conSueltas = groupByPerson([mk('1', 'Ana', 3, '2026-08-05'), suelta], '2026-08-18')
  eq('agrupa deudas sin gasto padre', conSueltas[0].open_usd, 23)
  eq('y envejece por la fecha de la deuda', conSueltas[0].oldest_days, 78)
}

/* ─── Snapshot del dispositivo ──────────────────────────────────────────────
   Lo que hace que abrir la app muestre el patrimonio real en el primer frame
   en vez de $0. Se prueba acá porque un fallo silencioso —una cookie que no se
   parsea— no rompe nada visible: simplemente vuelve el $0. */

const SUB = '9f8e7d6c-1111-2222-3333-444455556666'

// `currentUserId` salió de snapshot.ts hacia `readSessionClaims` en
// lib/session-claims.ts (ahora lo comparte el gate de acceso — ver el
// comentario al inicio de ese archivo). Este shim evita reescribir las ~15
// pruebas de abajo, que solo necesitaban el `sub`.
const currentUserId = () => readSessionClaims()?.sub ?? null
const REF = 'abcdef123456'

const almacen = new Map()
globalThis.window = {
  localStorage: {
    get length() { return almacen.size },
    key: i => [...almacen.keys()][i],
    getItem: k => almacen.get(k) ?? null,
    setItem: (k, v) => almacen.set(k, v),
    removeItem: k => almacen.delete(k),
  },
}
globalThis.document = { cookie: '' }

const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = claims => `${b64u({ alg: 'HS256' })}.${b64u(claims)}.firma`
const cookieDe = (claims, relleno = 0) => 'base64-' + Buffer.from(JSON.stringify({
  access_token: jwt(claims), refresh_token: 'x'.repeat(relleno),
})).toString('base64')
const NOMBRE = `sb-${REF}-auth-token`

section('SNAPSHOT · leer el usuario de la cookie de sesión')
document.cookie = ''
eq('sin cookie no hay usuario', currentUserId(), null)

document.cookie = `${NOMBRE}=${cookieDe({ sub: SUB })}`
eq('cookie simple', currentUserId(), SUB)

document.cookie = `otra=1; ${NOMBRE}=${cookieDe({ sub: SUB })}; ultima=2`
eq('entre otras cookies', currentUserId(), SUB)

// @supabase/ssr parte la cookie en `.0`, `.1`… cuando pasa los 3180 caracteres.
{
  const grande = cookieDe({ sub: SUB, email: 'acrosagency@gmail.com' }, 5000)
  const mitad = Math.ceil(grande.length / 2)
  document.cookie = `${NOMBRE}.0=${grande.slice(0, mitad)}; ${NOMBRE}.1=${grande.slice(mitad)}`
  eq('cookie partida en dos', currentUserId(), SUB)
}

document.cookie = `${NOMBRE}=${encodeURIComponent(JSON.stringify({ access_token: jwt({ sub: SUB }) }))}`
eq('cookie sin el prefijo base64', currentUserId(), SUB)

document.cookie = `${NOMBRE}=base64-esto no es base64 !!`
eq('cookie corrupta devuelve null en vez de romper', currentUserId(), null)

document.cookie = `${NOMBRE}=${cookieDe({ email: 'sin-sub@test.local' })}`
eq('token sin sub', currentUserId(), null)

section('SNAPSHOT · guardar y recuperar')
almacen.clear()
document.cookie = `${NOMBRE}=${cookieDe({ sub: SUB })}`
const UID = currentUserId()
const DATOS = {
  accounts: [{ id: 'a', balance: 500 }], total_usd: 1234.5, rates: { BOB: 11.5 },
  rate_list: [], categories: [], people: [], shared: {},
  tx: { 'limit=5': { transactions: [] } },
}

eq('sin nada guardado', readSnapshot(UID), null)
writeSnapshot(UID, DATOS)
eq('vuelve el patrimonio guardado', readSnapshot(UID).total_usd, 1234.5)
eq('y las consultas cacheadas', Object.keys(readSnapshot(UID).tx), ['limit=5'])

writeSnapshot(null, DATOS)
eq('sin usuario no escribe nada', almacen.size, 1)
eq('sin usuario no lee nada', readSnapshot(null), null)

// Lo importante de todo esto: RLS protege los datos reales, pero un caché mal
// llaveado le mostraría a otra cuenta el patrimonio de la anterior.
eq('otro usuario no ve este snapshot', readSnapshot('otro-uid-cualquiera'), null)

{
  const clave = [...almacen.keys()][0]
  const guardado = JSON.parse(almacen.get(clave))
  guardado.at = Date.now() - (7 * 24 * 60 * 60 * 1000 + 60_000)
  almacen.set(clave, JSON.stringify(guardado))
  eq('un patrimonio de más de una semana se descarta', readSnapshot(UID), null)
  eq('y se borra solo', almacen.size, 0)
}

almacen.set('fz:snap:1:roto', '{ esto no es json')
eq('json corrupto devuelve null', readSnapshot('roto'), null)

almacen.clear()
writeSnapshot(UID, DATOS)
almacen.set('fz:hidden', '1')
clearSnapshots()
ok('clearSnapshots borra los snapshots', ![...almacen.keys()].some(k => k.startsWith('fz:snap:')))
eq('y no toca las otras preferencias', almacen.get('fz:hidden'), '1')


/* ══════════════════════════════════════════════════════════════════════════
   SPRINT 3 · Fijos, y el margen al repartir
   ══════════════════════════════════════════════════════════════════════════ */

section('SPRINT 3 · repartir de más o de menos es una decisión, no un error')
{
  // Spotify cuesta 11.99 y les cobrás 4.50 a cada uno: ganás 1.51.

  const g = shareBreakdown(11.99, [{ amount: 4.5 }, { amount: 4.5 }, { amount: 4.5 }], 'USD')
  eq('tu parte queda negativa', g.mine, -1.51)
  eq('y se llama ganancia', g.kind, 'ganas')

  // Invitando vos una parte.
  const invitando = shareBreakdown(11.99, [{ amount: 2 }, { amount: 2 }], 'USD')
  eq('repartir de menos: ponés más vos', invitando.mine, 7.99)
  eq('y sigue siendo tu parte', invitando.kind, 'pagas')

  const justo = shareBreakdown(10, [{ amount: 10 }], 'USD')
  eq('reparto exacto: no ponés nada', justo.mine, 0)
  eq('y se nombra distinto', justo.kind, 'exacto')

}

section('SPRINT 3 · períodos')
{
  const mensual = { frequency: 'mensual', day_of_month: 5, month_of_year: null }
  eq('el mes de la fecha de referencia', periodOf(mensual, '2026-08-18'),
     { from: '2026-08-01', to: '2026-08-31', due: '2026-08-05' })

  // Un 31 configurado no se pierde ni se corre a marzo: cae el último día.
  const treintaYUno = { frequency: 'mensual', day_of_month: 31, month_of_year: null }
  eq('el 31 en febrero cae el 28', periodOf(treintaYUno, '2026-02-10').due, '2026-02-28')
  eq('el 31 en abril cae el 30', periodOf(treintaYUno, '2026-04-10').due, '2026-04-30')
  eq('y en enero es el 31 de verdad', periodOf(treintaYUno, '2026-01-10').due, '2026-01-31')

  const anual = { frequency: 'anual', day_of_month: 3, month_of_year: 3 }
  eq('el anual abarca el año entero', periodOf(anual, '2026-08-18'),
     { from: '2026-01-01', to: '2026-12-31', due: '2026-03-03' })
}

section('SPRINT 3 · estado derivado, nunca guardado')
{
  // `starts_on` siempre existe: la columna es NOT NULL con default. Acá se fija
  // viejo para que el período de agosto esté dentro del rango del fijo.
  const r = { frequency: 'mensual', day_of_month: 5, month_of_year: null, active: true, starts_on: '2026-08-01' }

  eq('sin movimiento y antes de la fecha: pendiente',
     statusOf(r, [], '2026-08-02').status, 'pendiente')
  eq('sin movimiento y pasada la fecha: vencido',
     statusOf(r, [], '2026-08-18').status, 'vencido')
  eq('con los días de atraso contados',
     statusOf(r, [], '2026-08-18').days_late, 13)
  eq('con un movimiento del mes: registrado',
     statusOf(r, ['2026-08-05'], '2026-08-18').status, 'registrado')

  // Un movimiento de OTRO mes no cuenta: cada período se resuelve solo.
  eq('el de julio no registra agosto',
     statusOf(r, ['2026-07-05'], '2026-08-18').status, 'vencido')
  // Con el fijo arrancando en julio, ese mismo movimiento sí lo cierra.
  const desdeJulio = { ...r, starts_on: '2026-07-01' }
  eq('pero sí registra julio',
     statusOf(desdeJulio, ['2026-07-05'], '2026-07-20').status, 'registrado')

  eq('pausado no reclama nada',
     statusOf({ ...r, active: false }, [], '2026-08-18').status, 'pausado')
  // Pausado gana sobre registrado: "Listo" en un pausado se lee como activo.
  eq('y sigue diciendo pausado aunque el período esté registrado',
     statusOf({ ...r, active: false }, ['2026-08-05'], '2026-08-18').status, 'pausado')

  // El día justo todavía no está vencido.
  eq('el mismo día de vencimiento sigue pendiente',
     statusOf(r, [], '2026-08-05').status, 'pendiente')
}

section('SPRINT 3 · el reparto se recalcula con el precio de cada mes')
{
  const parejo = [{ person_id: 'a', amount: null }, { person_id: 'b', amount: null }, { person_id: 'c', amount: null }]

  const agosto = resolveSplits(parejo, 11.99, 'USD')
  eq('Spotify a $11.99 entre 4', agosto.map(s => s.amount), [2.99, 2.99, 2.99])

  // Sube el precio y el reparto se ajusta SOLO: con montos congelados en la
  // plantilla les seguirías cobrando de menos sin enterarte.
  const septiembre = resolveSplits(parejo, 12.99, 'USD')
  eq('a $12.99 les toca más, sin tocar nada', septiembre.map(s => s.amount), [3.24, 3.24, 3.24])

  // Montos fijos mandan tal cual: son los que te dejan cobrar de más.
  const fijos = [{ person_id: 'a', amount: 4.5 }, { person_id: 'b', amount: 4.5 }]
  eq('los montos fijos no se recalculan', resolveSplits(fijos, 11.99, 'USD').map(s => s.amount), [4.5, 4.5])

  // Mezcla: lo comprometido sale antes de dividir el resto.
  const mixto = [{ person_id: 'a', amount: 5 }, { person_id: 'b', amount: null }]
  const m = resolveSplits(mixto, 11, 'USD')
  eq('el fijo se respeta y el resto se divide', m.map(s => s.amount), [5, 3])

  eq('sin reparto no devuelve nada', resolveSplits([], 11.99, 'USD'), [])
}

section('SPRINT 3 · orden y progreso de la lista')
{
  const mk = (id, status, due, active = true) => ({ id, status, due, active })
  const orden = sortRecurring([
    mk('1', 'registrado', '2026-08-05'),
    mk('2', 'vencido', '2026-08-12'),
    mk('3', 'pendiente', '2026-08-25'),
    mk('4', 'pausado', '2026-08-01', false),
    mk('5', 'vencido', '2026-08-03'),
  ])
  eq('vencidos primero, después pendientes, y los pausados al final',
     orden.map(r => r.id), ['5', '2', '3', '1', '4'])

  eq('el progreso ignora los pausados', progress(orden), { done: 1, total: 4, pending: 3 })
  eq('sin fijos no divide por cero', progress([]), { done: 0, total: 0, pending: 0 })
}

section('SPRINT 3 · validación del reparto de una plantilla')
{
  const conocidas = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Juan' }]

  eq('sin reparto es válido', validateTemplateSplits([], conocidas).ok, true)
  eq('undefined también', validateTemplateSplits(undefined, conocidas).ok, true)

  // `null` es válido acá y significa "parte pareja" — es la diferencia con el
  // reparto de un movimiento.
  eq('una parte pareja (null) es válida',
     validateTemplateSplits([{ person_id: 'p1', amount: null }], conocidas).ok, true)
  eq('y una con monto también',
     validateTemplateSplits([{ person_id: 'p1', amount: 4.5 }], conocidas).ok, true)

  eq('cero no', validateTemplateSplits([{ person_id: 'p1', amount: 0 }], conocidas).ok, false)
  eq('negativo tampoco', validateTemplateSplits([{ person_id: 'p1', amount: -3 }], conocidas).ok, false)

  eq('la misma persona dos veces',
     validateTemplateSplits([{ person_id: 'p1', amount: null }, { person_id: 'p1', amount: null }], conocidas).ok, false)

  // El caso que antes solo detectaba la base, con un error ilegible.
  const cruzado = validateTemplateSplits(
    [{ person_id: 'p1', amount: null }, { person_name: 'ana', amount: null }], conocidas)
  eq('por id Y por nombre son la misma persona', cruzado.ok, false)
  ok('con un mensaje que se puede leer', !cruzado.error.includes('constraint'), cruzado.error)

  eq('una parte sin persona', validateTemplateSplits([{ amount: 5 }], conocidas).ok, false)
  eq('dos personas distintas sí',
     validateTemplateSplits([{ person_id: 'p1', amount: null }, { person_name: 'Carlos', amount: null }], conocidas).ok, true)
}

section('SPRINT 3 · desde cuándo corre un fijo')
{
  const base = { frequency: 'mensual', day_of_month: 5, month_of_year: null, active: true }

  // Arranca el mes que viene: no está atrasado, todavía no le toca.
  const futuro = { ...base, starts_on: '2026-09-01' }
  eq('un fijo que empieza después no reclama nada',
     statusOf(futuro, [], '2026-08-18').status, 'programado')
  eq('y muestra cuándo arranca', statusOf(futuro, [], '2026-08-18').due, '2026-09-05')
  eq('sin períodos pendientes', statusOf(futuro, [], '2026-08-18').pending, [])

  // Cargado tarde: hay meses que recuperar.
  const atrasado = { ...base, starts_on: '2026-06-01' }
  eq('lista junio, julio y agosto',
     pendingPeriods(atrasado, [], '2026-08-18'), ['2026-06-05', '2026-07-05', '2026-08-05'])
  eq('propone el MÁS VIEJO primero', statusOf(atrasado, [], '2026-08-18').due, '2026-06-05')
  eq('y lo marca vencido', statusOf(atrasado, [], '2026-08-18').status, 'vencido')

  eq('lo ya registrado sale de la lista',
     pendingPeriods(atrasado, ['2026-06-05', '2026-07-05'], '2026-08-18'), ['2026-08-05'])
  eq('con todo al día, no queda nada',
     pendingPeriods(atrasado, ['2026-06-05', '2026-07-05', '2026-08-05'], '2026-08-18'), [])
  eq('y el estado pasa a registrado',
     statusOf(atrasado, ['2026-06-05', '2026-07-05', '2026-08-05'], '2026-08-18').status, 'registrado')

  // Un starts_on absurdo no genera una lista infinita.
  ok('el tope corta en 24 períodos',
     pendingPeriods({ ...base, starts_on: '2019-01-01' }, [], '2026-08-18').length === 24)

  // Anual.
  const anual = { frequency: 'anual', day_of_month: 3, month_of_year: 3, active: true, starts_on: '2025-01-01' }
  eq('un anual lista un período por año',
     pendingPeriods(anual, [], '2026-08-18'), ['2025-03-03', '2026-03-03'])

  eq('pausado sigue ganando sobre todo',
     statusOf({ ...atrasado, active: false }, [], '2026-08-18').status, 'pausado')
}

section('SPRINT 3 · los programados no cuentan en el progreso')
{
  const mk = (id, status, active = true) => ({ id, status, due: '2026-08-05', active })
  eq('2 de 3, y el programado afuera',
     progress([mk('1', 'registrado'), mk('2', 'registrado'), mk('3', 'vencido'), mk('4', 'programado')]),
     { done: 2, total: 3, pending: 1 })
}

section('SPRINT 4 · fin_debt_plans — interés y reparto de cuotas')
{
  eq('sin interés, el total es el capital tal cual', planTotal(100, null, 'USD'), 100)
  eq('interés en cero también es "solo capital"', planTotal(100, 0, 'USD'), 100)
  eq('10% simple sobre 100 da 110', planTotal(100, 10, 'USD'), 110)
  eq('el interés es simple, no compuesto: una sola vez sobre el capital', planTotal(957, 5, 'USD'), 1004.85)

  eq('100 entre 3 cuotas iguales: el resto va a la ÚLTIMA',
     equalInstallments(100, 3, 'USD'), [33.33, 33.33, 33.34])
  eq('la suma nunca se pasa del total', equalInstallments(100, 3, 'USD').reduce((s, n) => s + n, 0), 100)
  eq('957 entre 10 (los $957 reales, sin interés)',
     equalInstallments(planTotal(957, null, 'USD'), 10, 'USD'),
     [95.7, 95.7, 95.7, 95.7, 95.7, 95.7, 95.7, 95.7, 95.7, 95.7])
  eq('110 entre 2 cuotas iguales de un plan con 10% de interés',
     equalInstallments(planTotal(100, 10, 'USD'), 2, 'USD'), [55, 55])
  eq('una sola cuota es el total entero', equalInstallments(250, 1, 'USD'), [250])
  eq('sin capital no hay cuotas', equalInstallments(0, 3, 'USD'), [])
}

section('SPRINT 4 · fechas de cada cuota')
{
  eq('mensual: enero 31 → febrero 28 (no hay 31 en febrero)',
     installmentDate('2026-01-31', 'mensual', 1), '2026-02-28')
  eq('mensual: enero 31 → marzo 31 (marzo sí tiene 31)',
     installmentDate('2026-01-31', 'mensual', 2), '2026-03-31')
  eq('mensual: cuota 0 es la fecha de arranque', installmentDate('2026-09-05', 'mensual', 0), '2026-09-05')
  eq('mensual cruza de año', installmentDate('2026-11-15', 'mensual', 3), '2027-02-15')

  eq('quincenal suma 15 días por cuota', installmentDate('2026-08-05', 'quincenal', 1), '2026-08-20')
  eq('quincenal cruza de mes', installmentDate('2026-08-20', 'quincenal', 1), '2026-09-04')

  eq('semanal suma 7 días por cuota', installmentDate('2026-08-05', 'semanal', 1), '2026-08-12')
  eq('semanal cuota 0', installmentDate('2026-08-05', 'semanal', 0), '2026-08-05')
}

section('SPRINT 4 · generateEqualPlan — el calendario completo')
{
  const plan = generateEqualPlan(957, null, 10, 'mensual', '2026-09-05', 'USD')
  eq('genera 10 cuotas', plan.length, 10)
  eq('suman exactamente el capital (sin interés)',
     Math.round(plan.reduce((s, c) => s + c.amount, 0) * 100) / 100, 957)
  eq('la primera cuota vence en la fecha de arranque', plan[0].incurred_on, '2026-09-05')
  eq('la segunda un mes después', plan[1].incurred_on, '2026-10-05')

  const conInteres = generateEqualPlan(100, 10, 2, 'mensual', '2026-09-01', 'USD')
  eq('con interés, cada cuota ya lo incluye', conInteres.map(c => c.amount), [55, 55])
}

section('SPRINT 4 · plan cerrado y sus totales — derivados, nunca guardados')
{
  const cuota = (state, amount_usd) => ({
    amount_usd,
    state,
    settled_tx_id: state === 'cobrado' ? 'tx-1' : null,
    waived_at: state === 'perdonado' ? '2026-08-18' : null,
  })

  eq('todas cobradas o perdonadas: cerrado', planCerrado([cuota('cobrado', 100), cuota('perdonado', 57)]), true)
  eq('una sola pendiente alcanza para no estar cerrado',
     planCerrado([cuota('cobrado', 100), cuota('pendiente', 57)]), false)
  eq('sin cuotas no está "cerrado": no hay nada que cerrar', planCerrado([]), false)

  const rollup = planRollup([cuota('cobrado', 100), cuota('pendiente', 300), cuota('perdonado', 57)])
  eq('total_usd suma todo', rollup.total_usd, 457)
  eq('pagado_usd solo lo cobrado', rollup.pagado_usd, 100)
  eq('pendiente_usd solo lo pendiente', rollup.pendiente_usd, 300)
  eq('perdonado_usd solo lo condonado', rollup.perdonado_usd, 57)
}

process.exit(summary() === 0 ? 0 : 1)
