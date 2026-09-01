import { computeBalances, withBalances, totalUsd } from './.fin/accounts.mjs'
import { toUsd, fromUsd, round2, roundFor, usdPerUnit, freezeRate, displayRate, formatSigned, formatUSD, formatBOB, formatAmount, parseDecimalInput, amountFromInput, num, decimalsFor, crossCurrencySuggestion } from './.fin/money.mjs'
import { freezeConversion, validateInput, monthRange, todayISO, groupByDay, gastoUsd, ingresoUsd, lastMonths, availableFrom, consumesBalance, flowTypeFor, flowTypeOnEdit, isInvestmentAdjustment, valueUpdateDelta, isValidDate, transferFeeUsd } from './.fin/transactions.mjs'
import { fetchQuotes, quotesAreStale, QUOTE_PAIRS, PAIRS_FOR_CURRENCY } from './.fin/quotes.mjs'
import { evenSplit, floorTo, myShare, shareBreakdown, debtState, isOpen, freezeDebtUsd, gastoBrutoUsd, repartidoUsd, gastoRealUsd, porCobrarUsd, daysBetween, groupByPerson, normalizeName, debtsNeedingAttention } from './.fin/splits.mjs'
import { periodOf, statusOf, resolveSplits, sortRecurring, progress, validateTemplateSplits, pendingPeriods, fieldsFromDate, dateFromFields, needsAttentionSoon } from './.fin/recurring.mjs'
import { planTotal, equalInstallments, installmentDate, generateEqualPlan, planCerrado, planRollup } from './.fin/plans.mjs'
import { addMonthsClamped, aportePendiente, canAportar, currentAporteDue, currentRound, expectedTurnDate, nextAporteDue, pasanakuRounds, roundsOf, validatePasanaku } from './.fin/pasanaku.mjs'
import {
  periodStart, periodRange, nextPeriod, previousPeriod, resolvePeriod, montoEfectivo, effectiveFromFor,
  gastoRealCategoria, comprometido, carriedInto, disponible, dayOfPeriod, needsClosure,
  validateBudgetAmount, isValidPeriod, toNative, budgetBarView,
} from './.fin/budgets.mjs'
import { readSnapshot, writeSnapshot, clearSnapshots } from './.fin/snapshot.mjs'
import {
  avisosDeFijos, avisosDePresupuesto, avisosDeAhorro, avisosDeDeudas,
  avisoDeAnotar, tocaRecordatorio, diasEntre, mesLargo, UMBRALES,
} from './.fin/notifications.mjs'
import { budgetReservedUsd, savableUsd } from './.fin/savings.mjs'
import { isSavingsRecurring } from './.fin/types.mjs'
import { readSessionClaims } from './.fin/session-claims.mjs'
import {
  surplusUsd, pendingSavingsPeriod, canSaveForPeriod, goalReached, computeGoalBalancesUsd, computeSavingsByAccountUsd,
  proposeAllocation, validateGoalName, validateAllocation, validateTargetAmount,
} from './.fin/savings.mjs'
import { savingsFlowForType, isValidSavingsFlow, isValidSavingsReason } from './.fin/transactions.mjs'
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

section('displayRate · el inverso de freezeRate, como lo muestra Ajustes')
{
  // BOB se congela invertido (USD por Bs); mostrarlo tiene que devolverlo a
  // "Bs por 1 USD", el mismo número que ve el usuario en Ajustes.
  const factorBob = freezeRate('BOB', R)
  eq('displayRate(BOB) deshace la inversión', Math.round(displayRate('BOB', factorBob) * 100) / 100, 6.96)

  // BTC y USDT se congelan directo (USD por unidad): no hay nada que deshacer.
  const factorBtc = freezeRate('BTC', R)
  eq('displayRate(BTC) es el mismo número', displayRate('BTC', factorBtc), 68000)
  eq('displayRate(USDT) es el mismo número', displayRate('USDT', freezeRate('USDT', R)), 1)

  // Tres días después el Bs está a 7.50: la tasa MOSTRADA sigue siendo la
  // congelada, no la de hoy — mismo principio que la deuda del sprint 2.
  const hoy = freezeRate('BOB', { ...R, BOB: 7.5 })
  ok('con la tasa de hoy daría otro número', displayRate('BOB', hoy) !== displayRate('BOB', factorBob))
  eq('pero la tasa congelada no se mueve', Math.round(displayRate('BOB', factorBob) * 100) / 100, 6.96)
}

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
// Misma moneda CON to_amount ya es válido: sirve para anotar la comisión que
// se comió el banco. Antes se rechazaba, y no había dónde registrar que
// mandaste 100 y llegaron 98.
eq('transferencia misma moneda con to_amount igual pasa', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', to_amount: 5, amount: 5 }, byId).ok, true)
eq('misma moneda con comisión pasa', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', to_amount: 4.8, amount: 5 }, byId).ok, true)
eq('misma moneda no puede recibir MÁS de lo que salió', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', to_amount: 6, amount: 5 }, byId).ok, false)
eq('misma moneda con recibido en cero falla', validateInput({ ...base, type: 'transferencia', to_account_id: 'broker', to_amount: 0, amount: 5 }, byId).ok, false)
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

section('FEATURE 11.1 · isInvestmentAdjustment — a qué sheet manda "Editar" (§7.2)')
{
  const broker = { is_investment: true }
  const normal = { is_investment: false }

  eq('gasto movimiento en cuenta de inversión → sí',
     isInvestmentAdjustment({ type: 'gasto', flow_type: 'movimiento' }, broker), true)
  eq('ingreso movimiento en cuenta de inversión → sí',
     isInvestmentAdjustment({ type: 'ingreso', flow_type: 'movimiento' }, broker), true)

  // La única causa posible para un gasto movimiento es la cuenta de
  // inversión — sin ella, no es una actualización de valor.
  eq('gasto movimiento en cuenta normal → no (sería otra cosa, no debería pasar)',
     isInvestmentAdjustment({ type: 'gasto', flow_type: 'movimiento' }, normal), false)

  // Un ingreso movimiento en cuenta normal es un reembolso/cobro de deuda,
  // no una actualización de valor — la cuenta es lo que desambigua.
  eq('ingreso movimiento en cuenta normal → no (es reembolso/cobro de deuda)',
     isInvestmentAdjustment({ type: 'ingreso', flow_type: 'movimiento' }, normal), false)

  // Un consumo real nunca es una actualización de valor, ni en cuenta de inversión.
  eq('gasto consumo en cuenta de inversión → no (todavía no se ajustó nada)',
     isInvestmentAdjustment({ type: 'gasto', flow_type: 'consumo' }, broker), false)

  // Una transferencia nunca es una actualización de valor, sea cual sea la cuenta.
  eq('transferencia movimiento en cuenta de inversión → no',
     isInvestmentAdjustment({ type: 'transferencia', flow_type: 'movimiento' }, broker), false)

  eq('sin cuenta (no cargó todavía) → no', isInvestmentAdjustment({ type: 'gasto', flow_type: 'movimiento' }, undefined), false)
}

section('FEATURE 11.1 · valueUpdateDelta — "Actualizar valor" (§7.2)')
{
  // Alta nueva (sin `editing`): la referencia es directo el saldo actual.
  eq('valor subió → ingreso por la diferencia',
     valueUpdateDelta(1000, 1045.20, 'USD'), { type: 'ingreso', amount: 45.20 })
  eq('valor bajó → gasto por la diferencia',
     valueUpdateDelta(1000, 940, 'USD'), { type: 'gasto', amount: 60 })
  eq('sin cambio → null, no hay nada que guardar',
     valueUpdateDelta(1000, 1000, 'USD'), null)

  // Valores en cero y negativos — permitidos a propósito (§4 de la charla de
  // diseño): una inversión liquidada, o una cuenta apalancada en rojo.
  eq('a cero → gasto por todo el saldo', valueUpdateDelta(500, 0, 'USD'), { type: 'gasto', amount: 500 })
  eq('a negativo → gasto por más de lo que había', valueUpdateDelta(500, -80, 'USD'), { type: 'gasto', amount: 580 })
  eq('ya estaba en cero y sigue en cero → null', valueUpdateDelta(0, 0, 'USD'), null)
  eq('viene de negativo y sube (sigue negativo) → ingreso', valueUpdateDelta(-80, -30, 'USD'), { type: 'ingreso', amount: 50 })

  // Redondeo con la precisión de la MONEDA (roundFor), no a 2 decimales fijos
  // — el bug real que esto reemplaza: `round2` truncaba un ajuste en BTC a
  // centavos y le comía toda la magnitud.
  eq('BTC conserva los 8 decimales en la diferencia',
     valueUpdateDelta(0.5, 0.50042195, 'BTC'), { type: 'ingreso', amount: 0.00042195 })
  eq('un cambio de BTC más chico que un centavo de USD no desaparece',
     valueUpdateDelta(0.5, 0.50000001, 'BTC'), { type: 'ingreso', amount: 0.00000001 })
  eq('BTC sin cambio real (por debajo de los 8 decimales) → null',
     valueUpdateDelta(0.5, 0.500000001, 'BTC'), null)

  // Modo edición: `editing` es la entrada que se está reemplazando — su
  // propio efecto se resta de la referencia antes de medir.
  const editingIngreso = { type: 'ingreso', amount: 45.20 }
  eq('editar sin tocar el valor reproduce la MISMA entrada (saldo actual = 1045.20, que ya la incluye)',
     valueUpdateDelta(1045.20, 1045.20, 'USD', editingIngreso), { type: 'ingreso', amount: 45.20 })
  eq('editar para subir más: crece el ingreso',
     valueUpdateDelta(1045.20, 1100, 'USD', editingIngreso), { type: 'ingreso', amount: 100 })
  eq('editar y bajar del todo: cambia de signo a gasto',
     valueUpdateDelta(1045.20, 950, 'USD', editingIngreso), { type: 'gasto', amount: 50 })
  eq('editar hasta el valor de referencia exacto (antes de esta entrada) → null',
     valueUpdateDelta(1045.20, 1000, 'USD', editingIngreso), null)

  const editingGasto = { type: 'gasto', amount: 60 }
  eq('editar una entrada que era gasto, sin tocar el valor, la reproduce igual',
     valueUpdateDelta(940, 940, 'USD', editingGasto), { type: 'gasto', amount: 60 })
  eq('editar una entrada que era gasto y ahora resulta ingreso',
     valueUpdateDelta(940, 1050, 'USD', editingGasto), { type: 'ingreso', amount: 50 })
}

section('SPRINT 2 · gasto bruto, repartido y real')
{
  // Spotify $11.99 repartido entre 3 amigos a $2.99, uno de ellos perdonado.
  // `principal_usd` = `amount_usd` en las tres: nadie repartió por encima de
  // lo que costó, así que no hay margen que probar acá (ver más abajo).
  const spotify = {
    type: 'gasto', flow_type: 'consumo', amount_usd: 11.99,
    debts: [
      { amount_usd: 2.99, principal_usd: 2.99, settled_tx_id: 'tx-c', waived_at: null },  // cobrado
      { amount_usd: 2.99, principal_usd: 2.99, settled_tx_id: null, waived_at: null },    // pendiente
      { amount_usd: 2.99, principal_usd: 2.99, settled_tx_id: null, waived_at: '2026-08-18' }, // perdonado
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

section('Home (revisión) · debtsNeedingAttention — la alerta de "Te deben"')
{
  const hoy = '2026-08-18'
  const suelta = { plan_installment_no: null, incurred_on: '2026-01-01', amount_usd: 20 } // sin fecha propia: cuenta siempre
  const cuotaVencida = { plan_installment_no: 2, incurred_on: '2026-08-10', amount_usd: 100 } // ya venció
  const cuotaProxima = { plan_installment_no: 3, incurred_on: '2026-08-24', amount_usd: 50 } // vence en 6 días
  const cuotaLejana = { plan_installment_no: 4, incurred_on: '2026-09-20', amount_usd: 999 } // recién en un mes

  const relevantes = debtsNeedingAttention([suelta, cuotaVencida, cuotaProxima, cuotaLejana], hoy)
  eq('la suelta, la vencida y la próxima cuentan — la lejana no',
     relevantes.map(d => d.amount_usd).sort((a, b) => a - b), [20, 50, 100])
  ok('la cuota lejana queda afuera', !relevantes.includes(cuotaLejana))

  eq('sin nada que atender, lista vacía', debtsNeedingAttention([cuotaLejana], hoy), [])
  eq('el límite de 7 días es inclusive', debtsNeedingAttention([{ plan_installment_no: 1, incurred_on: '2026-08-25', amount_usd: 1 }], hoy).length, 1)
  eq('8 días ya no entra', debtsNeedingAttention([{ plan_installment_no: 1, incurred_on: '2026-08-26', amount_usd: 1 }], hoy).length, 0)
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

// Desde el Sprint 8 la clave incluye el perfil: el mismo usuario tiene un
// snapshot por cajón.
const PERFIL = 'perfil-personal'
const PERFIL_2 = 'perfil-empresa'

eq('sin nada guardado', readSnapshot(UID, PERFIL), null)
writeSnapshot(UID, PERFIL, DATOS)
eq('vuelve el patrimonio guardado', readSnapshot(UID, PERFIL).total_usd, 1234.5)
eq('y las consultas cacheadas', Object.keys(readSnapshot(UID, PERFIL).tx), ['limit=5'])

// El corazón del cambio: sin esto, cambiar de perfil pintaba el primer frame
// con el patrimonio del anterior — un número de otro cajón, no un "cargando".
eq('otro perfil del MISMO usuario no ve este snapshot', readSnapshot(UID, PERFIL_2), null)
writeSnapshot(UID, PERFIL_2, { ...DATOS, total_usd: 99 })
eq('cada perfil guarda el suyo', readSnapshot(UID, PERFIL_2).total_usd, 99)
eq('y el primero queda intacto', readSnapshot(UID, PERFIL).total_usd, 1234.5)

almacen.clear()
writeSnapshot(UID, PERFIL, DATOS)

writeSnapshot(null, PERFIL, DATOS)
eq('sin usuario no escribe nada', almacen.size, 1)
eq('sin usuario no lee nada', readSnapshot(null, PERFIL), null)

// Lo importante de todo esto: RLS protege los datos reales, pero un caché mal
// llaveado le mostraría a otra cuenta el patrimonio de la anterior.
eq('otro usuario no ve este snapshot', readSnapshot('otro-uid-cualquiera', PERFIL), null)

{
  const clave = [...almacen.keys()][0]
  const guardado = JSON.parse(almacen.get(clave))
  guardado.at = Date.now() - (7 * 24 * 60 * 60 * 1000 + 60_000)
  almacen.set(clave, JSON.stringify(guardado))
  eq('un patrimonio de más de una semana se descarta', readSnapshot(UID, PERFIL), null)
  eq('y se borra solo', almacen.size, 0)
}

almacen.set('fz:snap:1:roto:x', '{ esto no es json')
eq('json corrupto devuelve null', readSnapshot('roto', 'x'), null)

almacen.clear()
writeSnapshot(UID, PERFIL, DATOS)
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

section('FIX · un anual que todavía no vence está PROGRAMADO, no "Listo"')
{
  // `pendingPeriods` saltea a propósito el año en curso hasta que llega su
  // fecha — reclamar en agosto una renovación de noviembre no tiene sentido.
  // Pero "no falta nada" caía en `registrado`, y la pantalla lo pintaba como
  // pagado algo que nunca se pagó. Los mensuales nunca tuvieron el problema:
  // su período en curso entra en la lista aunque falten días para vencer.
  const dominio = {
    frequency: 'anual', day_of_month: 15, month_of_year: 11,
    active: true, starts_on: '2026-01-01',
  }

  eq('meses antes de vencer: programado, no registrado',
     statusOf(dominio, [], '2026-08-23').status, 'programado')
  eq('el día anterior sigue programado',
     statusOf(dominio, [], '2026-11-14').status, 'programado')
  eq('pasada la fecha sin registrar: vencido',
     statusOf(dominio, [], '2026-11-16').status, 'vencido')
  eq('registrado en su año: listo de verdad',
     statusOf(dominio, ['2026-11-15'], '2026-11-20').status, 'registrado')
  eq('enero del año siguiente vuelve a programado — el ciclo se reinicia',
     statusOf(dominio, ['2026-11-15'], '2027-01-10').status, 'programado')

  // El mensual no cambia: su mes en curso sí está pendiente antes de vencer.
  const mensual = {
    frequency: 'mensual', day_of_month: 5, month_of_year: null,
    active: true, starts_on: '2026-08-01',
  }
  eq('mensual antes de vencer sigue pendiente',
     statusOf(mensual, [], '2026-08-03').status, 'pendiente')
  eq('mensual pasado el día, vencido',
     statusOf(mensual, [], '2026-08-09').status, 'vencido')
  eq('mensual ya registrado, listo',
     statusOf(mensual, ['2026-08-05'], '2026-08-09').status, 'registrado')
}

section('FIX · un solo picker de fecha (Mes/Día ya no se piden aparte)')
{
  // fieldsFromDate: el día se guarda TAL CUAL se eligió, sin transformarlo.
  eq('mensual: el día y el starts_on salen directo de la fecha',
     fieldsFromDate('2026-06-15', 'mensual'),
     { day_of_month: 15, month_of_year: null, starts_on: '2026-06-15' })
  eq('anual: además manda el mes de la fecha en month_of_year',
     fieldsFromDate('2026-03-10', 'anual'),
     { day_of_month: 10, month_of_year: 3, starts_on: '2026-03-10' })
  eq('el 31 se guarda literal, sin ningún caso especial',
     fieldsFromDate('2026-01-31', 'mensual'),
     { day_of_month: 31, month_of_year: null, starts_on: '2026-01-31' })
  eq('el 30 también se guarda literal — NO se "sube" a 31',
     fieldsFromDate('2026-09-30', 'mensual'),
     { day_of_month: 30, month_of_year: null, starts_on: '2026-09-30' })
  eq('el 28 de febrero igual, literal',
     fieldsFromDate('2026-02-28', 'mensual'),
     { day_of_month: 28, month_of_year: null, starts_on: '2026-02-28' })

  // dateFromFields: el inverso, para reconstruir el picker al editar.
  eq('un día normal se reconstruye igual',
     dateFromFields({ frequency: 'mensual', day_of_month: 10, month_of_year: null, starts_on: '2026-05-01' }),
     '2026-05-10')
  eq('día 31 guardado en un mes de arranque más corto se topa a su último día real',
     dateFromFields({ frequency: 'mensual', day_of_month: 31, month_of_year: null, starts_on: '2026-04-05' }),
     '2026-04-30')
  eq('anual usa month_of_year para el mes, no el de starts_on',
     dateFromFields({ frequency: 'anual', day_of_month: 15, month_of_year: 7, starts_on: '2026-03-01' }),
     '2026-07-15')

  // Ida y vuelta: lo que arma `fieldsFromDate` tiene que reconstruirse igual
  // con `dateFromFields` — así una plantilla guardada y reabierta muestra la
  // misma fecha que el usuario tipeó.
  for (const fecha of ['2026-01-31', '2026-09-30', '2026-02-28', '2026-06-15']) {
    const guardado = { frequency: 'mensual', ...fieldsFromDate(fecha, 'mensual') }
    eq(`ida y vuelta conserva ${fecha}`, dateFromFields(guardado), fecha)
  }

  /*
   * El caso concreto que motivó este fix: un mensual registrado el 30 de
   * septiembre. Como el 30 se guarda literal (no "sube" a 31), en octubre y
   * noviembre —que también tienen día 30— cae en el 30 de verdad; solo
   * febrero, que no llega a 30, lo topa a su último día real.
   */
  const treinta = { frequency: 'mensual', ...fieldsFromDate('2026-09-30', 'mensual') }
  eq('30 de septiembre → octubre cobra el 30, no el 31',
     periodOf(treinta, '2026-10-05').due, '2026-10-30')
  eq('→ noviembre también el 30 (también lo tiene)',
     periodOf(treinta, '2026-11-05').due, '2026-11-30')
  eq('→ febrero se topa al 28 (no tiene día 30)',
     periodOf(treinta, '2027-02-05').due, '2027-02-28')

  // El 31, en cambio, es el único día que de verdad "llega siempre al final":
  // no hace falta ningún caso especial para eso, sale gratis de `periodOf`
  // porque no existe mes con más de 31 días.
  const treintaYUno = { frequency: 'mensual', ...fieldsFromDate('2026-01-31', 'mensual') }
  eq('31 de enero → abril cae el 30 (no existe el 31)',
     periodOf(treintaYUno, '2026-04-05').due, '2026-04-30')
  eq('→ febrero se topa al 28',
     periodOf(treintaYUno, '2027-02-05').due, '2027-02-28')
  eq('→ marzo sí es el 31 de verdad (existe)',
     periodOf(treintaYUno, '2026-03-05').due, '2026-03-31')
}

section('FIX · el día elegido rueda por los 12 meses, capado a cada largo real')
{
  const pad2 = n => String(n).padStart(2, '0')
  const LARGOS_2026 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // no bisiesto
  const LARGOS_2028 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // bisiesto

  // Debido esperado en cada uno de los 12 meses de `year`, para un día dado.
  const dueEsperado = (day, year, largos) => largos.map((len, i) => `${year}-${pad2(i + 1)}-${pad2(Math.min(day, len))}`)
  // Debido REAL que da `periodOf` en cada uno de los 12 meses de `year`.
  const dueReal = (r, year) => Array.from({ length: 12 }, (_, i) => periodOf(r, `${year}-${pad2(i + 1)}-10`).due)

  // 31 (arrancado el 31 de enero): cae el ÚLTIMO día real de cada mes — el
  // único caso que "siempre llega al final", gratis, sin ningún caso especial.
  {
    const r = { frequency: 'mensual', ...fieldsFromDate('2026-01-31', 'mensual') }
    eq('día 31: último día real de los 12 meses de 2026', dueReal(r, 2026), dueEsperado(31, 2026, LARGOS_2026))
  }

  // 30 (arrancado el 30 de septiembre): día 30 en todos lados salvo febrero
  // (topa a 28) — NO sube a 31 en los meses que sí lo tienen.
  {
    const r = { frequency: 'mensual', ...fieldsFromDate('2026-09-30', 'mensual') }
    eq('día 30: 30 en todos lados salvo febrero (topa a 28)', dueReal(r, 2026), dueEsperado(30, 2026, LARGOS_2026))
  }

  // 29, arrancado en un año bisiesto (2028-02-29 es una fecha real y válida):
  // dentro de ESE año no se topa en ningún mes...
  {
    const r = { frequency: 'mensual', ...fieldsFromDate('2028-02-29', 'mensual') }
    eq('día 29 arrancado en bisiesto: no se topa en ningún mes de ese año',
       dueReal(r, 2028), dueEsperado(29, 2028, LARGOS_2028))
    // ...pero al año siguiente, no bisiesto, febrero SÍ se topa a 28.
    eq('día 29: al año siguiente (no bisiesto) febrero se topa a 28',
       dueReal(r, 2029), dueEsperado(29, 2029, LARGOS_2026))
  }

  // 28: existe en todos los meses de cualquier año — nunca se topa.
  {
    const r = { frequency: 'mensual', ...fieldsFromDate('2026-02-28', 'mensual') }
    eq('día 28: nunca se topa, en ningún mes', dueReal(r, 2026), dueEsperado(28, 2026, LARGOS_2026))
  }

  // Día "normal" (1-27): sanity check — nada especial pasa nunca.
  {
    const r = { frequency: 'mensual', ...fieldsFromDate('2026-06-15', 'mensual') }
    eq('día 15: normal, igual en los 12 meses', dueReal(r, 2026), dueEsperado(15, 2026, LARGOS_2026))
  }
}

section('FIX · anual: el mes queda fijo, solo febrero varía entre años')
{
  // Un anual con día 29 y mes=febrero (creado en un año bisiesto) es
  // leap-year-aware SIN necesitar ningún caso especial: `periodOf` recalcula
  // el largo de febrero contra el año de CADA cobro, no contra el de creación.
  const r29feb = { frequency: 'anual', ...fieldsFromDate('2028-02-29', 'anual') }
  eq('anual 29/feb en un año bisiesto: cae el 29', periodOf(r29feb, '2028-06-01').due, '2028-02-29')
  eq('anual 29/feb al año siguiente (no bisiesto): cae el 28', periodOf(r29feb, '2029-06-01').due, '2029-02-28')
  eq('anual 29/feb en el próximo bisiesto: vuelve al 29', periodOf(r29feb, '2032-06-01').due, '2032-02-29')

  // month_of_year queda fijo aunque cambien los años — un 30 de abril anual
  // no varía nunca, porque abril siempre tiene 30 días.
  const rAbril = { frequency: 'anual', ...fieldsFromDate('2026-04-30', 'anual') }
  eq('anual 30/abril: siempre el 30, todos los años', periodOf(rAbril, '2030-01-01').due, '2030-04-30')

  // Un día normal en anual: se respeta tal cual, todos los años.
  const rMarzo = { frequency: 'anual', ...fieldsFromDate('2026-03-10', 'anual') }
  eq('anual 10/marzo: se respeta todos los años', periodOf(rMarzo, '2031-01-01').due, '2031-03-10')
}

section('FIX · integración con statusOf/pendingPeriods (no solo periodOf en aislado)')
{
  // Un fijo mensual con día 30, para confirmar que el pipeline completo que
  // usan las pantallas (no solo `periodOf` en aislado) también da octubre=30
  // y febrero=28.
  const r = { frequency: 'mensual', ...fieldsFromDate('2026-10-30', 'mensual'), active: true }

  eq('29 de octubre: todavía no venció', statusOf(r, [], '2026-10-29').status, 'pendiente')
  eq('30 de octubre: el día que vence, todavía no está vencido', statusOf(r, [], '2026-10-30').status, 'pendiente')
  eq('31 de octubre: recién ahí está vencido', statusOf(r, [], '2026-10-31').status, 'vencido')
  eq('con un movimiento el 30, queda registrado',
     statusOf(r, ['2026-10-30'], '2026-10-31').status, 'registrado')

  // En febrero, con los meses previos ya registrados, vence el 28 — no se
  // corre a marzo buscando un día 30 que no existe.
  const previos = ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-30']
  eq('en febrero (previos registrados): todavía no venció el 27',
     statusOf(r, previos, '2027-02-27').status, 'pendiente')
  eq('...el due de ese período es el 28, no un 30 inexistente',
     statusOf(r, previos, '2027-02-27').due, '2027-02-28')
  eq('1 de marzo, sin registrar febrero: vencido',
     statusOf(r, previos, '2027-03-01').status, 'vencido')
  eq('...y el due sigue siendo el 28 de febrero, no se corrió a marzo',
     statusOf(r, previos, '2027-03-01').due, '2027-02-28')
}

section('FIX · reconstruir el picker de datos viejos (pre-fix) sin romper nada')
{
  // Dato "viejo": un mensual con día_of_month=31 pero `starts_on` en un mes
  // corto (ej. UI anterior, donde "Mes" y "Día" eran selects independientes).
  // El picker tiene que mostrar una fecha VÁLIDA igual, sin explotar.
  const viejoMensual = { frequency: 'mensual', day_of_month: 31, month_of_year: null, starts_on: '2026-04-05' }
  eq('día 31 con starts_on en abril (30 días) se muestra como 30 de abril',
     dateFromFields(viejoMensual), '2026-04-30')

  // Dato "viejo" anual: `month_of_year` manda sobre el mes de `starts_on`
  // (que en versiones previas del formulario podía no coincidir).
  const viejoAnual = { frequency: 'anual', day_of_month: 31, month_of_year: 4, starts_on: '2026-01-01' }
  eq('anual: usa month_of_year (abril) e ignora el mes de starts_on (enero)',
     dateFromFields(viejoAnual), '2026-04-30')

  // Ninguno de los dos casos rompe periodOf: se sigue topando bien.
  eq('el dato viejo sigue funcionando en periodOf (topa a 30 en abril)',
     periodOf(viejoMensual, '2026-04-10').due, '2026-04-30')
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

section('Home (revisión) · needsAttentionSoon — la alerta de "Gastos Fijos"')
{
  const hoy = '2026-08-18'
  const mk = (id, status, due, active = true) => ({ id, status, due, active })

  ok('un vencido siempre necesita atención',
     needsAttentionSoon([mk('1', 'vencido', '2026-08-01')], hoy))
  ok('un pendiente que vence hoy mismo cuenta',
     needsAttentionSoon([mk('1', 'pendiente', hoy)], hoy))
  ok('un pendiente que vence en 3 días cuenta',
     needsAttentionSoon([mk('1', 'pendiente', '2026-08-21')], hoy))
  ok('uno que recién vence en 20 días todavía no es urgente',
     !needsAttentionSoon([mk('1', 'pendiente', '2026-09-07')], hoy))
  ok('un pausado no cuenta aunque figure vencido',
     !needsAttentionSoon([mk('1', 'vencido', '2026-08-01', false)], hoy))
  ok('registrado no necesita nada', !needsAttentionSoon([mk('1', 'registrado', hoy)], hoy))
  ok('sin fijos, sin alerta', !needsAttentionSoon([], hoy))
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

section('SPRINT 5 · addMonthsClamped')
{
  eq('suma meses simples', addMonthsClamped('2026-08-05', 3), '2026-11-05')
  eq('cruza de año', addMonthsClamped('2026-11-15', 3), '2027-02-15')
  eq('topa el 31 contra febrero', addMonthsClamped('2026-01-31', 1), '2026-02-28')
  eq('topa el 31 contra abril (30 días)', addMonthsClamped('2026-01-31', 3), '2026-04-30')
  eq('0 meses devuelve la misma fecha', addMonthsClamped('2026-08-05', 0), '2026-08-05')
}

section('SPRINT 5 · expectedTurnDate — cuándo te toca recibir')
{
  eq('puesto 1 recibe en start_date',
     expectedTurnDate({ start_date: '2026-08-05', my_slot: 1 }), '2026-08-05')
  eq('puesto 4 recibe tres meses después',
     expectedTurnDate({ start_date: '2026-08-05', my_slot: 4 }), '2026-11-05')
  eq('puesto lejano cruza de año',
     expectedTurnDate({ start_date: '2026-11-30', my_slot: 4 }), '2027-02-28')
}

section('SPRINT 5 (revisión) · nextAporteDue — cuándo cae el próximo aporte')
{
  eq('todavía no llegó el día este mes: el próximo es este mes',
     nextAporteDue('2026-05-05', '2026-08-03'), '2026-08-05')
  eq('ya pasó el día este mes: el próximo es el mes que viene',
     nextAporteDue('2026-05-05', '2026-08-21'), '2026-09-05')
  eq('hoy es justo el día: cuenta como el próximo, no como el que viene',
     nextAporteDue('2026-05-05', '2026-08-05'), '2026-08-05')
  eq('el mismo mes de arranque: el próximo es ese mismo mes',
     nextAporteDue('2026-08-05', '2026-08-01'), '2026-08-05')
  eq('topa el 31 contra febrero', nextAporteDue('2026-01-31', '2026-02-20'), '2026-02-28')
}

section('SPRINT 5 (revisión) · currentRound — en qué ronda vamos, para la barra de progreso')
{
  eq('el mismo día de arranque es la ronda 1', currentRound('2026-08-05', '2026-08-05'), 1)
  eq('todavía dentro del primer mes, sigue en ronda 1', currentRound('2026-08-05', '2026-08-25'), 1)
  eq('un mes calendario después es la ronda 2', currentRound('2026-08-05', '2026-09-01'), 2)
  eq('tres meses después es la ronda 4', currentRound('2026-08-05', '2026-11-20'), 4)
  eq('nunca da menos de 1, ni antes de arrancar', currentRound('2026-08-05', '2026-06-01'), 1)
}

section('SPRINT 5 (revisión) · pasanakuRounds — la tabla de meses del ciclo')
{
  const p = { start_date: '2026-05-10', total_slots: 4, my_slot: 2 }

  eq('una fila por puesto', pasanakuRounds(p, []).length, 4)
  eq('los meses salen de start_date, uno por ronda',
     pasanakuRounds(p, []).map(r => r.period), ['2026-05', '2026-06', '2026-07', '2026-08'])
  eq('sin aportes, ninguna ronda está pagada',
     pasanakuRounds(p, []).every(r => !r.paid && r.amount === 0), true)
  eq('marca tu turno en my_slot', pasanakuRounds(p, []).map(r => r.mine), [false, true, false, false])

  // Un aporte cuenta para el mes de SU fecha, no para el mes en que se cargó:
  // cargar hoy el de junio tiene que marcar junio.
  const conAportes = pasanakuRounds(p, [
    { date: '2026-05-10', amount: 300 },
    { date: '2026-06-28', amount: 300 },
  ])
  eq('marca los meses aportados', conAportes.map(r => r.paid), [true, true, false, false])
  eq('y deja el monto de cada mes', conAportes.map(r => r.amount), [300, 300, 0, 0])

  eq('dos aportes del mismo mes se suman en la fila',
     pasanakuRounds(p, [{ date: '2026-05-01', amount: 150 }, { date: '2026-05-20', amount: 150 }])[0].amount, 300)
  eq('un aporte fuera del ciclo no inventa filas ni se cuela',
     pasanakuRounds(p, [{ date: '2026-12-01', amount: 300 }]).some(r => r.paid), false)

  eq('el ciclo cruza de año sin saltarse un mes',
     pasanakuRounds({ start_date: '2026-11-30', total_slots: 3, my_slot: 1 }, []).map(r => r.period),
     ['2026-11', '2026-12', '2027-01'])
}

section('SPRINT 5 (revisión) · canAportar — el botón bloqueado hasta el día del aporte')
{
  const p = { start_date: '2026-05-10', total_slots: 4, my_slot: 2 }
  const rondas = (aportes = []) => pasanakuRounds(p, aportes)
  // Mayo y junio ya aportados: sin atrasos que destraben el botón por su cuenta.
  const alDia = rondas([{ date: '2026-05-10', amount: 300 }, { date: '2026-06-10', amount: 300 }])

  eq('el día del aporte del mes corriente, sin saltar al siguiente',
     currentAporteDue('2026-05-10', '2026-07-25'), '2026-07-10')
  eq('antes de arrancar el pasanaku, el día es el arranque mismo',
     currentAporteDue('2026-05-10', '2026-04-01'), '2026-05-10')
  eq('topa el 31 contra febrero, igual que nextAporteDue',
     currentAporteDue('2026-01-31', '2026-02-20'), '2026-02-28')

  eq('al día y todavía no llegó el día del mes: bloqueado',
     canAportar('2026-05-10', alDia, '2026-07-03'), false)
  eq('el día justo: habilitado', canAportar('2026-05-10', alDia, '2026-07-10'), true)
  eq('pasado el día: sigue habilitado', canAportar('2026-05-10', alDia, '2026-07-21'), true)
  eq('antes de que arranque el pasanaku: bloqueado',
     canAportar('2026-09-10', pasanakuRounds({ ...p, start_date: '2026-09-10' }, []), '2026-08-26'), false)

  // La excepción: un mes atrasado destraba el botón aunque el día de este mes
  // no haya llegado — si no, la deuda quedaba trabada hasta el mes siguiente.
  eq('con junio sin aportar, el 3 de julio ya se puede',
     canAportar('2026-05-10', rondas([{ date: '2026-05-10', amount: 300 }]), '2026-07-03'), true)
  eq('el mes corriente sin aportar NO cuenta como atraso antes de su día',
     canAportar('2026-05-10', alDia, '2026-07-09'), false)
}

section('SPRINT 5 (revisión) · aportePendiente — el aviso de la Home')
{
  const p = { start_date: '2026-05-10', total_slots: 4, my_slot: 2 }
  const rondas = (aportes = []) => pasanakuRounds(p, aportes)
  const alDia = rondas([{ date: '2026-05-10', amount: 300 }, { date: '2026-06-10', amount: 300 }])

  eq('llegó el día y no aportaste: pendiente',
     aportePendiente('2026-05-10', alDia, '2026-07-10'), true)
  eq('llegó el día y ya aportaste: nada pendiente',
     aportePendiente('2026-05-10', rondas([
       { date: '2026-05-10', amount: 300 }, { date: '2026-06-10', amount: 300 }, { date: '2026-07-10', amount: 300 },
     ]), '2026-07-15'),
     false)
  eq('al día y todavía no llegó el día del mes: nada pendiente',
     aportePendiente('2026-05-10', alDia, '2026-07-03'), false)
  eq('un mes viejo sin aportar pesa aunque el de este mes no venza',
     aportePendiente('2026-05-10', rondas([{ date: '2026-05-10', amount: 300 }]), '2026-07-03'), true)
  eq('ciclo entero aportado: nada pendiente, ni el último día',
     aportePendiente('2026-05-10', rondas([
       { date: '2026-05-10', amount: 300 }, { date: '2026-06-10', amount: 300 },
       { date: '2026-07-10', amount: 300 }, { date: '2026-08-10', amount: 300 },
     ]), '2026-08-31'),
     false)
  eq('terminado el ciclo, los meses de después no piden nada',
     aportePendiente('2026-05-10', rondas([
       { date: '2026-05-10', amount: 300 }, { date: '2026-06-10', amount: 300 },
       { date: '2026-07-10', amount: 300 }, { date: '2026-08-10', amount: 300 },
     ]), '2026-11-20'),
     false)
  eq('antes de que arranque el pasanaku no hay nada pendiente',
     aportePendiente('2026-09-10', pasanakuRounds({ ...p, start_date: '2026-09-10' }, []), '2026-08-26'), false)

  // roundsOf: la forma en que lo llaman las pantallas, con un pasanaku cargado.
  const cargado = {
    ...p,
    aportes: [{ id: 'a1', date: '2026-05-10', amount: 43.1, currency: 'USD', amount_in_currency: 300 }],
    historico: [{ id: 'h1', pasanaku_id: 'x', date: '2026-06-10', amount: 300, note: null }],
  }
  eq('roundsOf junta aportes reales e históricos',
     roundsOf(cargado).map(r => r.paid), [true, true, false, false])
  eq('y usa el monto ya convertido a la moneda del pasanaku',
     roundsOf(cargado)[0].amount, 300)
}

section('SPRINT 5 · validatePasanaku')
{
  // Sin account_id a propósito: la cuenta se elige al aportar/recibir, no al
  // crear (revisión del 2026-08-21, mismo patrón que fin_recurring).
  const base = {
    name: 'Pasanaku', currency: 'BOB', contribution_amount: 300,
    total_slots: 8, my_slot: 4, start_date: '2026-08-05',
  }
  eq('un pasanaku válido no da error', validatePasanaku(base), null)
  eq('sin nombre', validatePasanaku({ ...base, name: '' }), 'Ponle un nombre')
  eq('sin moneda', validatePasanaku({ ...base, currency: undefined }), 'Elige una moneda')
  eq('moneda fuera del enum', validatePasanaku({ ...base, currency: 'EUR' }), 'Elige una moneda')
  eq('aporte en cero', validatePasanaku({ ...base, contribution_amount: 0 }), 'El aporte debe ser mayor a cero')
  eq('un solo puesto no es una ronda', validatePasanaku({ ...base, total_slots: 1 }), 'Los puestos tienen que ser al menos 2')
  eq('puesto en cero', validatePasanaku({ ...base, my_slot: 0 }), 'Tu puesto tiene que ser 1 o más')
  eq('tu puesto no puede superar el total',
     validatePasanaku({ ...base, my_slot: 9 }), 'Tu puesto no puede ser mayor que el total de puestos')
  eq('el último puesto sí es válido', validatePasanaku({ ...base, my_slot: 8 }), null)
  eq('sin fecha de inicio', validatePasanaku({ ...base, start_date: '' }), 'Elige una fecha de inicio')
}

section('SPRINT 5 (revisión) · crossCurrencySuggestion — un solo lugar para no repetir el bug')
{
  eq('misma moneda: null, no hay nada que convertir', crossCurrencySuggestion(300, 'BOB', 'BOB', R), null)
  eq('300 Bs a USD, con la tasa 6.96', crossCurrencySuggestion(300, 'BOB', 'USD', R), 43.1)
  eq('43.10 USD de vuelta a Bs (ida y vuelta)', crossCurrencySuggestion(43.1, 'USD', 'BOB', R), 299.98)
  eq('300 Bs a BTC no se rompe con montos chicos', crossCurrencySuggestion(300, 'BOB', 'BTC', R) > 0, true)
}

section('SPRINT 6 · períodos (presupuesto)')
{
  eq('periodStart de una fecha cualquiera', periodStart('2026-08-17'), '2026-08-01')
  eq('periodStart de un día 1 se queda igual', periodStart('2026-08-01'), '2026-08-01')
  eq('periodRange de agosto', periodRange('2026-08-01'), { from: '2026-08-01', to: '2026-08-31' })
  eq('periodRange respeta febrero no bisiesto', periodRange('2026-02-01'), { from: '2026-02-01', to: '2026-02-28' })
  eq('nextPeriod dentro del año', nextPeriod('2026-08-01'), '2026-09-01')
  eq('nextPeriod cruza de año', nextPeriod('2026-12-01'), '2027-01-01')
  eq('previousPeriod dentro del año', previousPeriod('2026-08-01'), '2026-07-01')
  eq('previousPeriod cruza de año hacia atrás', previousPeriod('2026-01-01'), '2025-12-01')
}

section('SPRINT 6 · resolvePeriod y montoEfectivo')
{
  // Línea en Bs a 11.6 Bs/USD: exchange_rate es "USD por 1 Bs" (la
  // convención de freezeRate), o sea 1/11.6. El monto nativo es el que el
  // usuario escribió; el USD es lo derivado y congelado.
  const periods = [
    { id: 'p-jul', line_id: 'l1', period: '2026-07-01', amount: 928, amount_usd: 80, exchange_rate: 1 / 11.6 },
    { id: 'p-ago', line_id: 'l1', period: '2026-08-01', amount: 1073, amount_usd: 92.5, exchange_rate: 1 / 11.6 },
  ]
  eq('mes propio', resolvePeriod(periods, 'l1', '2026-08-01'), { periodRowId: 'p-ago', amount: 1073, amountUsd: 92.5 })
  eq('mes heredado del más reciente anterior',
     resolvePeriod(periods, 'l1', '2026-09-01'), { periodRowId: null, amount: 1073, amountUsd: 92.5 })
  eq('sin ningún período previo: null',
     resolvePeriod(periods, 'l1', '2026-06-01'), { periodRowId: null, amount: null, amountUsd: null })
  eq('línea sin ninguna fila: null',
     resolvePeriod(periods, 'l2', '2026-08-01'), { periodRowId: null, amount: null, amountUsd: null })

  const extensions = [
    { period_id: 'p-ago', amount: 174, amount_usd: 15 },
    { period_id: 'p-ago', amount: 93, amount_usd: 8 },
  ]
  eq('montoEfectivo suma las ampliaciones del período propio, en las dos denominaciones',
     montoEfectivo(periods, extensions, 'l1', '2026-08-01'), { amount: 1340, amountUsd: 115.5 })
  eq('un mes heredado no hereda ampliaciones ajenas',
     montoEfectivo(periods, extensions, 'l1', '2026-09-01'), { amount: 1073, amountUsd: 92.5 })
  eq('sin monto cargado: null, no cero', montoEfectivo(periods, [], 'l1', '2026-06-01'), null)
}

section('SPRINT 6 (revisión) · toNative — el derivado vuelve a la moneda de la línea')
{
  // `exchange_rate` = USD por 1 unidad nativa, así que volver a nativo divide.
  eq('Bs: 10 USD a 1/11.6 vuelven a 116 Bs', toNative(10, 1 / 11.6), 116)
  eq('USD: la tasa 1 no toca el número', toNative(42.5, 1), 42.5)
  eq('una tasa inválida no rompe: devuelve el USD tal cual', toNative(30, 0), 30)
}

section('SPRINT 6 · effectiveFromFor — retroactividad, una sola vez')
{
  const retro = { id: 'l1', created_on: '2026-08-15', retroactive: true }
  const fresh = { id: 'l2', created_on: '2026-08-15', retroactive: false }

  eq('retroactiva: el período de creación cuenta desde el día 1', effectiveFromFor(retro, '2026-08-01'), '2026-08-01')
  eq('no retroactiva: el período de creación cuenta desde created_on', effectiveFromFor(fresh, '2026-08-01'), '2026-08-15')
  eq('no retroactiva, pero un mes DISTINTO al de creación cuenta normal',
     effectiveFromFor(fresh, '2026-09-01'), '2026-09-01')
}

section('SPRINT 6 · gastoRealCategoria — bruto menos repartido')
{
  const usd = (id, cat, n, date) => ({ id, category_id: cat, amount: n, currency: 'USD', amount_usd: n, date })
  const txs = [
    usd('t1', 'comida', 20, '2026-08-05'),
    usd('t2', 'comida', 12, '2026-08-20'),
    usd('t3', 'ocio', 30, '2026-08-10'),
    usd('t4', 'comida', 50, '2026-07-31'), // fuera de rango
  ]
  const debts = [
    { transaction_id: 't1', amount: 8, currency: 'USD', amount_usd: 8, principal_usd: 8, waived_at: null },
    { transaction_id: 't2', amount: 3, currency: 'USD', amount_usd: 3, principal_usd: 3, waived_at: '2026-08-21' },
  ]

  eq('comida: bruto 32 − repartido 8 (el condonado no resta)',
     gastoRealCategoria(txs, debts, ['comida'], '2026-08-01', '2026-08-31').amountUsd, 24)
  eq('ocio: sin reparto', gastoRealCategoria(txs, debts, ['ocio'], '2026-08-01', '2026-08-31').amountUsd, 30)
  eq('respeta el rango: julio no entra',
     gastoRealCategoria(txs, debts, ['comida'], '2026-08-01', '2026-08-31').amountUsd, 24)
  eq('una línea con varias categorías suma las dos, sin duplicar nada',
     gastoRealCategoria(txs, debts, ['comida', 'ocio'], '2026-08-01', '2026-08-31').amountUsd, 54)
}

section('SPRINT 6 (revisión) · gastoRealCategoria — el nativo no pierde centavos')
{
  // El caso real que lo destapó: 10 Bs a 0.08605852 USD/Bs dan 0.8605852,
  // que se guardan redondeados a 0.86. Reconvertir 0.86 daba 9.99 — un
  // centavo de dólar son ~12 de Bs. Sumando el nativo, siguen siendo 10.
  const rate = 0.08605852
  const txs = [{ id: 't1', category_id: 'comida', amount: 10, currency: 'BOB', amount_usd: 0.86, date: '2026-08-23' }]

  const r = gastoRealCategoria(txs, [], ['comida'], '2026-08-01', '2026-08-31', 'BOB', rate)
  eq('el gasto en Bs se suma tal cual: 10, no 9.99', r.amount, 10)
  eq('y su USD sigue siendo el congelado', r.amountUsd, 0.86)

  // Un gasto en OTRA moneda sí se convierte: no hay alternativa.
  const mixto = [{ id: 't2', category_id: 'comida', amount: 5, currency: 'USD', amount_usd: 5, date: '2026-08-23' }]
  eq('un gasto en USD dentro de una línea en Bs se convierte con la tasa de la línea',
     gastoRealCategoria(mixto, [], ['comida'], '2026-08-01', '2026-08-31', 'BOB', rate).amount, 58.10)
}

section('Presupuesto en BTC · la precisión es la de la moneda, no siempre 2 decimales')
{
  // `round2` alcanzaba mientras todo presupuesto fuera fiat. En BTC (8
  // decimales) dejaba TODO en cero: 0,0025 BTC redondeado a 2 decimales es 0,
  // y la card decía "0 gastado" con la plata ya gastada.
  const rate = 68000 // USD por 1 BTC

  const txs = [{ id: 't1', category_id: 'cripto', amount: 0.0025, currency: 'BTC', amount_usd: 170, date: '2026-08-10' }]
  eq('el gasto en BTC no se redondea a cero',
     gastoRealCategoria(txs, [], ['cripto'], '2026-08-01', '2026-08-31', 'BTC', rate).amount, 0.0025)

  const fijos = [{ category_id: 'cripto', active: true, amount: 0.001, currency: 'BTC', amountUsd: 68, status: 'pendiente' }]
  eq('el comprometido en BTC tampoco', comprometido(fijos, ['cripto'], 'BTC', rate).amount, 0.001)

  const periods = [{ id: 'p1', line_id: 'l1', period: '2026-08-01', amount: 0.05, amount_usd: 3400 }]
  eq('el monto del mes conserva sus decimales',
     montoEfectivo(periods, [], 'l1', '2026-08-01', 'BTC').amount, 0.05)

  eq('toNative respeta los 8 decimales del BTC', toNative(170, rate, 'BTC'), 0.0025)
  eq('y sigue en 2 para el fiat de siempre', toNative(10, 0.08605852, 'BOB'), 116.20)
  eq('una moneda desconocida cae en 2 decimales en vez de romper', toNative(100, 2, 'XXX'), 50)
}

section('SPRINT 6 · comprometido — Fijos pendientes')
{
  const r = (cat, n, status, active = true) => ({
    category_id: cat, active, amount: n, currency: 'USD', amountUsd: n, status,
  })
  const recurring = [
    r('vivienda', 300, 'pendiente'),
    r('vivienda', 999, 'registrado'), // ya pagado: no cuenta
    r('suscripciones', 12, 'vencido'),
    r('suscripciones', 500, 'pendiente', false), // pausado: no cuenta
  ]
  eq('vivienda: solo lo pendiente', comprometido(recurring, ['vivienda']).amountUsd, 300)
  eq('suscripciones: vencido cuenta, pausado no', comprometido(recurring, ['suscripciones']).amountUsd, 12)
  eq('categoría sin fijos: 0', comprometido(recurring, ['ocio']).amountUsd, 0)
  eq('una línea con varias categorías suma los fijos de las dos',
     comprometido(recurring, ['vivienda', 'suscripciones']).amountUsd, 312)

  // Un fijo en Bs dentro de una línea en Bs no pasa por USD.
  const enBs = [{ category_id: 'comida', active: true, amount: 1420, currency: 'BOB', amountUsd: 122.2, status: 'pendiente' }]
  eq('el fijo en Bs suma su monto nativo exacto',
     comprometido(enBs, ['comida'], 'BOB', 0.08605852).amount, 1420)
}

section('SPRINT 6 · carriedInto — un solo salto hacia atrás, no una cadena')
{
  const closures = [
    { line_id: 'l1', period: '2026-07-01', carried: true, amount: 145, amount_usd: 12.5 },
    { line_id: 'l1', period: '2026-06-01', carried: true, amount: 9999, amount_usd: 999 }, // más viejo: no debería mirarse
    { line_id: 'l2', period: '2026-07-01', carried: false, amount: -46, amount_usd: -4 },
  ]
  eq('se lleva: el monto del cierre inmediato anterior, en las dos denominaciones',
     carriedInto(closures, 'l1', '2026-08-01'), { amount: 145, amountUsd: 12.5 })
  eq('no se lleva: no aporta nada aunque haya cierre',
     carriedInto(closures, 'l2', '2026-08-01'), { amount: 0, amountUsd: 0 })
  eq('sin cierre del mes anterior: 0',
     carriedInto(closures, 'l3', '2026-08-01'), { amount: 0, amountUsd: 0 })
}

section('SPRINT 6 · disponible')
{
  eq('caso normal', disponible({ montoEfectivoUsd: 100, gastoRealUsd: 40, comprometidoUsd: 10, carriedUsd: 5 }), 55)
  eq('sin monto cargado: null', disponible({ montoEfectivoUsd: null, gastoRealUsd: 40, comprometidoUsd: 0, carriedUsd: 0 }), null)
  eq('puede dar negativo (ya te pasaste)', disponible({ montoEfectivoUsd: 50, gastoRealUsd: 80, comprometidoUsd: 0, carriedUsd: 0 }), -30)
}

section('SPRINT 6 · día del período: para el tick de la barra')
{
  eq('mes en curso: día de hoy', dayOfPeriod('2026-08-01', '2026-08-22'), { day: 22, days: 31 })
  eq('mes ya cerrado: el último día, no hoy', dayOfPeriod('2026-07-01', '2026-08-22'), { day: 31, days: 31 })
}

section('SPRINT 6 (revisión) · budgetBarView — "gastado" vs "disponible"')
{
  // 40 de 100 gastados, día 10 de 30 — mismo escenario para los dos modos,
  // solo cambia cómo se lee.
  const base = {
    spentUsd: 40, availableUsd: 60, capacityUsd: 100, committedUsd: 0,
    spent: 40, available: 60, day: 10, days: 30,
  }
  const avanceDelMes = Math.round((10 / 30) * 10000) / 100

  const gastado = budgetBarView({ mode: 'gastado', ...base })
  eq('gastado: el número grande es lo gastado', gastado.value, 40)
  eq('la barra se llena con lo gastado', gastado.fillPct, 40)
  eq('el tick marca el avance del mes tal cual', gastado.tickPct, avanceDelMes)
  eq('lejos del tope: sin alerta', gastado.danger, false)

  const disponible = budgetBarView({ mode: 'disponible', ...base })
  eq('disponible: el número grande es lo que queda', disponible.value, 60)
  eq('la barra arranca llena y se descuenta lo gastado', disponible.fillPct, 60)
  // Antes acá el tick era `100 - avance`, o sea del lado contrario: a fin de
  // mes terminaba pegado al borde izquierdo, cuando lo que tiene que señalar
  // es que el presupuesto se está por acabar. Ahora es la MISMA marca en los
  // dos modos: la fracción del mes que ya pasó, avanzando hacia el tope.
  eq('el tick es el mismo avance del mes que en modo gastado',
     disponible.tickPct, avanceDelMes)
  eq('con 60% disponible, todavía no es alerta', disponible.danger, false)

  // Ya pasado del tope: alerta en los dos modos, y el disponible da negativo.
  const pasado = budgetBarView({
    mode: 'gastado', spentUsd: 120, availableUsd: -20, capacityUsd: 100, committedUsd: 0, spent: 120, available: -20, day: 30, days: 30,
  })
  ok('pasado el tope, alerta en modo gastado', pasado.danger)
  eq('la barra no pasa de 100%', pasado.fillPct, 100)

  const pasadoDisp = budgetBarView({
    mode: 'disponible', spentUsd: 120, availableUsd: -20, capacityUsd: 100, committedUsd: 0, spent: 120, available: -20, day: 30, days: 30,
  })
  ok('pasado el tope, alerta también en modo disponible', pasadoDisp.danger)
  eq('la barra no baja de 0%', pasadoDisp.fillPct, 0)
  eq('el valor grande sí muestra el negativo', pasadoDisp.value, -20)

  // Casi sin nada disponible (pero no pasado): alerta solo en modo disponible.
  const pocoDisponible = { spentUsd: 88, availableUsd: 12, capacityUsd: 100, committedUsd: 0, spent: 88, available: 12, day: 20, days: 30 }
  ok('en modo gastado, 88% todavía no es 85%... es más, así que sí alerta',
     budgetBarView({ mode: 'gastado', ...pocoDisponible }).danger)
  ok('en modo disponible, con solo 12% libre, también alerta',
     budgetBarView({ mode: 'disponible', ...pocoDisponible }).danger)

  // El tramo reservado: los fijos del mes que todavía no se pagaron. Va
  // pegado a la derecha del relleno y el número grande YA los descontó.
  const conFijos = {
    spentUsd: 20, availableUsd: 50, capacityUsd: 100, committedUsd: 30,
    spent: 20, available: 50, day: 10, days: 30,
  }
  const gFijos = budgetBarView({ mode: 'gastado', ...conFijos })
  eq('gastado: el relleno es lo gastado', gFijos.fillPct, 20)
  eq('y el reservado son los fijos pendientes, a su derecha', gFijos.reservedPct, 30)

  const dFijos = budgetBarView({ mode: 'disponible', ...conFijos })
  eq('disponible: el relleno es lo que queda, con los fijos ya descontados', dFijos.fillPct, 50)
  eq('y el reservado sigue siendo los mismos fijos', dFijos.reservedPct, 30)
  ok('relleno + reservado nunca desbordan la barra', dFijos.fillPct + dFijos.reservedPct <= 100)

  // Pasado el tope no queda barra donde dibujar el reservado: se recorta en
  // vez de estirarse fuera del carril.
  const sinLugar = budgetBarView({
    mode: 'gastado', spentUsd: 100, availableUsd: -30, capacityUsd: 100, committedUsd: 30,
    spent: 100, available: -30, day: 28, days: 30,
  })
  eq('con la barra llena, el reservado se recorta a cero', sinLugar.reservedPct, 0)

  eq('sin tope cargado, todo en cero sin romper',
     budgetBarView({ mode: 'gastado', spentUsd: 0, availableUsd: 0, capacityUsd: 0, committedUsd: 0, spent: 0, available: 0, day: 5, days: 30 }).fillPct, 0)
}

section('SPRINT 6 · needsClosure — la ausencia de fila es la pregunta pendiente')
{
  const line = { id: 'l1', created_on: '2026-06-10' }
  eq('sin ningún cierre: todos los meses ya terminados', needsClosure(line, [], '2026-08-22'),
     ['2026-06-01', '2026-07-01'])
  eq('con junio ya cerrado: solo falta julio',
     needsClosure(line, [{ line_id: 'l1', period: '2026-06-01' }], '2026-08-22'), ['2026-07-01'])
  eq('todo cerrado: nada pendiente',
     needsClosure(line, [{ line_id: 'l1', period: '2026-06-01' }, { line_id: 'l1', period: '2026-07-01' }], '2026-08-22'), [])
  eq('una línea creada este mismo mes no tiene nada que cerrar todavía',
     needsClosure({ id: 'l2', created_on: '2026-08-22' }, [], '2026-08-22'), [])
}

section('Transferencias · la comisión sale de los dos lados congelados')
{
  // 1624,10 USD salieron de Paypal y llegaron 1293,11 USDC: la diferencia es
  // lo que se comió Paypal, y tiene que seguir diciendo lo mismo dentro de un
  // año aunque el paralelo se haya movido.
  eq('comisión de una salida grande',
     transferFeeUsd({ type: 'transferencia', amount_usd: 1624.10, to_amount_usd: 1293.11 }), 330.99)
  eq('un P2P a buen precio da negativo: te fue a favor',
     transferFeeUsd({ type: 'transferencia', amount_usd: 25.74, to_amount_usd: 25.97 }), -0.23)
  eq('sin comisión, exactamente cero',
     transferFeeUsd({ type: 'transferencia', amount_usd: 100, to_amount_usd: 100 }), 0)
  eq('misma moneda: no aplica',
     transferFeeUsd({ type: 'transferencia', amount_usd: 100, to_amount_usd: null }), null)
  eq('un gasto no tiene comisión',
     transferFeeUsd({ type: 'gasto', amount_usd: 100, to_amount_usd: 50 }), null)
}

section('FIX · una fecha con forma válida pero imposible se rechaza')
{
  // El regex solo miraba la forma, así que 2026-02-30 llegaba hasta Postgres
  // y salía su mensaje crudo. En un plan de pagos era peor: alimentaba la
  // aritmética de cuotas desde un día que nunca existió.
  ok('una fecha real pasa', isValidDate('2026-08-24'))
  ok('29 de febrero bisiesto pasa', isValidDate('2028-02-29'))
  ok('30 de febrero NO', !isValidDate('2026-02-30'))
  ok('29 de febrero en año no bisiesto NO', !isValidDate('2027-02-29'))
  ok('mes 13 NO', !isValidDate('2026-13-01'))
  ok('día 45 NO', !isValidDate('2026-01-45'))
  ok('día 00 NO', !isValidDate('2026-01-00'))
  ok('31 de abril NO', !isValidDate('2026-04-31'))
  ok('formato libre NO', !isValidDate('24/08/2026'))
  ok('vacío NO', !isValidDate(''))
  ok('no-string NO', !isValidDate(20260824))
}

section('SPRINT 6 · validación')
{
  eq('monto válido', validateBudgetAmount(50), null)
  eq('monto en cero', validateBudgetAmount(0), 'El monto debe ser mayor a cero')
  eq('monto negativo', validateBudgetAmount(-10), 'El monto debe ser mayor a cero')
  eq('monto no numérico', validateBudgetAmount('abc'), 'El monto debe ser mayor a cero')
  ok('período válido', isValidPeriod('2026-08-01'))
  ok('rechaza un día que no es el 1', !isValidPeriod('2026-08-15'))
  ok('rechaza formato libre', !isValidPeriod('agosto 2026'))
}

section('SPRINT 7 (revisión 26/8) · el ahorro es una etiqueta, no una cuenta')
{
  const investment = { is_investment: true }
  const normal = { is_investment: false }

  // Ninguna cuenta es "de ahorro": el flag se eliminó. Un ingreso siempre es
  // ingreso real, caiga donde caiga.
  eq('un ingreso siempre cuenta como ingreso real', flowTypeFor('ingreso', normal), 'consumo')
  eq('un gasto sigue siendo consumo', flowTypeFor('gasto', normal), 'consumo')
  eq('una transferencia sigue siendo movimiento', flowTypeFor('transferencia', normal), 'movimiento')
  eq('inversión no cambió', flowTypeFor('gasto', investment), 'movimiento')

  // La DIRECCIÓN se declara. El tipo la fija solo donde no hay ambigüedad;
  // en una transferencia devuelve null y hay que preguntar — antes se deducía
  // de un motivo vacío, que confundía "es aporte" con "no puse motivo".
  eq('un gasto etiquetado siempre retira', savingsFlowForType('gasto'), 'retiro')
  eq('un ingreso etiquetado siempre aporta', savingsFlowForType('ingreso'), 'aporte')
  eq('una transferencia es ambigua: hay que preguntar', savingsFlowForType('transferencia'), null)

  ok('aporte es una dirección válida', isValidSavingsFlow('aporte'))
  ok('retiro también', isValidSavingsFlow('retiro'))
  ok('cualquier otra cosa no', !isValidSavingsFlow('quizas'))
  ok('y null tampoco: hay que declararla', !isValidSavingsFlow(null))

  ok('emergencia es un motivo válido', isValidSavingsReason('emergencia'))
  ok('cualquier cosa no lo es', !isValidSavingsReason('porque sí'))
}

section('SPRINT 7 (revisión 26/8) · saldo del ahorro según el motivo')
{
  const txs = [
    // Aporte del cierre: transferencia SIN motivo.
    { savings_goal_id: 'g1', type: 'transferencia', account_id: 'a', to_account_id: 'b', amount_usd: 100, to_amount_usd: 100, savings_flow: 'aporte' },
    // Aporte con comisión: cuenta lo que LLEGÓ.
    { savings_goal_id: 'g1', type: 'transferencia', account_id: 'a', to_account_id: 'b', amount_usd: 50, to_amount_usd: 48, savings_flow: 'aporte' },
    // Retiro gastado.
    { savings_goal_id: 'g1', type: 'gasto', account_id: 'b', to_account_id: null, amount_usd: 30, to_amount_usd: null, savings_flow: 'retiro' },
    // Retiro movido a otra cuenta: transferencia CON motivo.
    { savings_goal_id: 'g1', type: 'transferencia', account_id: 'b', to_account_id: 'a', amount_usd: 10, to_amount_usd: 10, savings_flow: 'retiro' },
  ]
  eq('100 + 48 − 30 − 10 = 108', computeGoalBalancesUsd(txs).get('g1'), 108)
}

section('SPRINT 7 (revisión 26/8) · cuánto de cada cuenta es ahorro')
{
  const txs = [
    { savings_goal_id: 'g1', type: 'transferencia', account_id: 'comun', to_account_id: 'ahorro', amount_usd: 100, to_amount_usd: 100, savings_flow: 'aporte' },
    { savings_goal_id: 'g1', type: 'transferencia', account_id: 'comun', to_account_id: 'ahorro', amount_usd: 50, to_amount_usd: 48, savings_flow: 'aporte' },
    { savings_goal_id: 'g1', type: 'gasto', account_id: 'ahorro', to_account_id: null, amount_usd: 30, to_amount_usd: null, savings_flow: 'retiro' },
    // Sin etiqueta no toca la porción apartada.
    { savings_goal_id: null, type: 'ingreso', account_id: 'ahorro', to_account_id: null, amount_usd: 900, to_amount_usd: null, savings_flow: 'aporte' },
  ]
  const porCuenta = computeSavingsByAccountUsd(txs)
  eq('la cuenta receptora tiene 100 + 48 − 30 apartados', porCuenta.get('ahorro'), 118)
  eq('aportar no deja a la de origen con ahorro negativo', porCuenta.get('comun') ?? 0, 0)
  eq('sin movimientos etiquetados, nada apartado', computeSavingsByAccountUsd([]).size, 0)
}

section('SPRINT 7 · surplusUsd — ingreso real menos gasto real')
{
  const txs = [
    { type: 'ingreso', amount_usd: 900, flow_type: 'consumo' },
    { type: 'ingreso', amount_usd: 50, flow_type: 'movimiento' }, // reembolso, no cuenta
    { type: 'gasto', amount_usd: 300, flow_type: 'consumo' },
    { type: 'gasto', amount_usd: 20, flow_type: 'movimiento' }, // ajuste de inversión, no cuenta
  ]
  eq('900 de ingreso real menos 300 de gasto real', surplusUsd(txs), 600)
  eq('sin movimientos, sobrante cero', surplusUsd([]), 0)
}

section('SPRINT 7 (Ronda 9) · pendingSavingsPeriod — el mes pasado, y solo ese')
{
  const g = (created_at, archived = false) => ({ created_at, archived })

  eq('sin ahorros todavía, nada pendiente', pendingSavingsPeriod([], '2026-08-24'), null)
  eq('con un ahorro que ya existía, el mes pendiente es el pasado',
     pendingSavingsPeriod([g('2026-06-10')], '2026-08-24'), '2026-07-01')
  eq('un ahorro creado este mismo mes no organiza el mes pasado',
     pendingSavingsPeriod([g('2026-08-24')], '2026-08-24'), null)
  eq('uno creado DENTRO del mes pasado sí lo organiza',
     pendingSavingsPeriod([g('2026-07-28')], '2026-08-24'), '2026-07-01')
  eq('los archivados no cuentan',
     pendingSavingsPeriod([g('2026-01-01', true)], '2026-08-24'), null)
  eq('pero alcanza con que UNO activo califique',
     pendingSavingsPeriod([g('2026-08-20'), g('2026-02-01')], '2026-08-24'), '2026-07-01')

  // BUG DE LA RONDA 9 (arreglado): antes esto salía de "el período más viejo
  // sin fila en fin_savings_closures", y esa tabla la escribía el reparto
  // global que la ronda reemplazó. Al no escribirse nunca más, el mes
  // pendiente quedaba clavado: guardabas en todos tus planes, los botones
  // desaparecían, y al mes siguiente la app seguía ofreciendo el MISMO mes
  // viejo. La feature dejaba de funcionar en silencio a los treinta días.
  eq('un ahorro de hace años sigue apuntando al mes pasado, no a 2024',
     pendingSavingsPeriod([g('2020-01-10')], '2026-08-24'), '2026-07-01')
  eq('en enero, el mes pasado es diciembre del año anterior',
     pendingSavingsPeriod([g('2025-05-01')], '2026-01-14'), '2025-12-01')
}

section('SPRINT 7 (Ronda 9) · canSaveForPeriod')
{
  const g = (created_at, saved_periods = [], archived = false) => ({ created_at, saved_periods, archived })

  eq('un plan que existía y no guardó, puede',
     canSaveForPeriod(g('2026-01-01'), '2026-07-01'), true)
  eq('si ya guardó ese mes, no',
     canSaveForPeriod(g('2026-01-01', ['2026-07-01']), '2026-07-01'), false)
  eq('haber guardado OTRO mes no lo bloquea',
     canSaveForPeriod(g('2026-01-01', ['2026-06-01']), '2026-07-01'), true)
  eq('archivado, no', canSaveForPeriod(g('2026-01-01', [], true), '2026-07-01'), false)
  eq('creado después del mes, no',
     canSaveForPeriod(g('2026-08-02'), '2026-07-01'), false)
  eq('creado dentro del mes, sí',
     canSaveForPeriod(g('2026-07-20'), '2026-07-01'), true)
}

section('SPRINT 7 · goalReached')
{
  eq('sin meta, nunca se alcanza', goalReached({ target_amount: null }, 500, null), false)
  eq('saldo por debajo de la meta, no se alcanzó', goalReached({ target_amount: 1000 }, 400, 500), false)
  eq('saldo justo igual al target en USD, sí se alcanzó', goalReached({ target_amount: 1000 }, 500, 500), true)
  eq('saldo por encima de la meta, se alcanzó', goalReached({ target_amount: 1000 }, 600, 500), true)
}

section('SPRINT 7 · proposeAllocation — la propuesta de reparto mensual')
{
  const rates = { BOB: 6.96, USDT: 1, USDC: 1, BTC: 68000 }
  const fijo = { id: 'f1', name: 'Emergencia', input_currency: 'USD', allocation_type: 'fixed', allocation_value: 50, target_amount: null, target_date: null, sort_order: 0, archived: false, balance: 0, balance_usd: 0, goal_reached: false }
  const pct30 = { id: 'p1', name: 'Viaje', input_currency: 'USD', allocation_type: 'percent', allocation_value: 30, target_amount: null, target_date: null, sort_order: 1, archived: false, balance: 0, balance_usd: 0, goal_reached: false }
  const pct20 = { id: 'p2', name: 'Crecimiento', input_currency: 'USD', allocation_type: 'percent', allocation_value: 20, target_amount: null, target_date: null, sort_order: 2, archived: false, balance: 0, balance_usd: 0, goal_reached: false }

  eq('sobrante cero: nada que proponer', proposeAllocation([fijo], 0, rates).proposal.length, 0)
  eq('sobrante negativo: nada que proponer', proposeAllocation([fijo], -50, rates).proposal.length, 0)

  // 245.60 de sobrante: $50 fijo + 30%/20% del resto (195.60) = 58.68 / 39.12, quedan 97.80 sin asignar
  const r = proposeAllocation([fijo, pct30, pct20], 245.60, rates)
  ok('no falta fondos para el fijo', !r.insufficientForFixed)
  eq('el fijo recibe exactamente su monto', r.proposal.find(l => l.goal_id === 'f1').amount_usd, 50)
  eq('30% del resto (195.60) es 58.68', r.proposal.find(l => l.goal_id === 'p1').amount_usd, 58.68)
  eq('20% del resto (195.60) es 39.12', r.proposal.find(l => l.goal_id === 'p2').amount_usd, 39.12)
  eq('el 50% sin repartir queda sin asignar', r.unassignedUsd, 97.80)

  // El sobrante no alcanza ni para el fijo de $50.
  const insuf = proposeAllocation([fijo, pct30], 30, rates)
  ok('no alcanza para los fijos', insuf.insufficientForFixed)
  ok('el fijo viaja marcado como pedido (capped), con su monto original', insuf.proposal.find(l => l.goal_id === 'f1').capped)
  eq('el fijo pide su monto completo, no prorrateado', insuf.proposal.find(l => l.goal_id === 'f1').amount_usd, 50)
  eq('el porcentual propone 0 hasta que se libere margen', insuf.proposal.find(l => l.goal_id === 'p1').amount_usd, 0)

  // Una meta ya alcanzada se excluye de la propuesta automática (§4.7).
  const cumplida = { ...fijo, id: 'f2', goal_reached: true }
  const conCumplida = proposeAllocation([fijo, cumplida], 200, rates)
  eq('solo el fijo activo entra en la propuesta', conCumplida.proposal.length, 1)
  eq('el fijo con meta cumplida no aparece', conCumplida.proposal.some(l => l.goal_id === 'f2'), false)

  // Un ahorro archivado tampoco entra.
  const archivado = { ...pct30, id: 'p3', archived: true }
  const conArchivado = proposeAllocation([fijo, archivado], 200, rates)
  eq('el archivado no entra en la propuesta', conArchivado.proposal.some(l => l.goal_id === 'p3'), false)
}

section('SPRINT 7 (revisión) · cajón de sastre y capeo por meta')
{
  const rates = { BOB: 6.96, USDT: 1, USDC: 1, BTC: 68000 }
  const g = (id, name, type, value, extra = {}) => ({
    id, name, input_currency: 'USD', allocation_type: type, allocation_value: value,
    target_amount: null, target_date: null, is_catchall: false, sort_order: 0, archived: false,
    balance: 0, balance_usd: 0, goal_reached: false, ...extra,
  })
  const usdDe = (r, id) => r.proposal.find(l => l.goal_id === id)?.amount_usd
  const patri = g('P', 'Patrimonio', 'percent', 1, { is_catchall: true })

  // "No quiero que haya un sin asignar" (decisión del usuario, 2026-08-24).
  const conCajon = proposeAllocation([g('1', 'Emergencia', 'fixed', 50), g('2', 'Viaje', 'fixed', 30), patri], 300, rates)
  eq('el cajón de sastre se lleva todo el resto', usdDe(conCajon, 'P'), 220)
  eq('y no queda nada sin asignar', conCajon.unassignedUsd, 0)
  eq('los fijos cobran lo suyo igual', usdDe(conCajon, '1'), 50)

  // Los % siguen calculándose sobre el resto DESPUÉS de los fijos.
  const conPct = proposeAllocation([g('1', 'Emergencia', 'fixed', 50), g('2', 'Viaje', 'percent', 30), patri], 300, rates)
  eq('el 30% se toma del resto (250), no del sobrante entero', usdDe(conPct, '2'), 75)
  eq('el cajón se lleva lo que sobra del reparto por %', usdDe(conPct, 'P'), 175)

  // Capeo: ningún aporte automático se pasa de la meta.
  const capFijo = proposeAllocation(
    [g('1', 'Viaje', 'fixed', 50, { target_amount: 1000, balance: 980, balance_usd: 980 }), patri], 300, rates)
  eq('un fijo de 50 al que le faltan 20 aporta solo 20', usdDe(capFijo, '1'), 20)
  eq('y los 30 que no puso van al cajón', usdDe(capFijo, 'P'), 280)

  const capPct = proposeAllocation(
    [g('1', 'Viaje', 'percent', 30, { target_amount: 1000, balance: 990, balance_usd: 990 }), patri], 300, rates)
  eq('un porcentual también se capea a lo que falta', usdDe(capPct, '1'), 10)
  eq('y el resto va al cajón', usdDe(capPct, 'P'), 290)

  // El cajón ignora su propia meta: si la respetara volvería a sobrar plata.
  const cajonCumplido = proposeAllocation([
    g('1', 'Emergencia', 'fixed', 50),
    g('P', 'Patrimonio', 'percent', 1, { is_catchall: true, target_amount: 100, balance: 100, balance_usd: 100, goal_reached: true }),
  ], 300, rates)
  eq('el cajón absorbe aunque su meta ya esté cumplida', usdDe(cajonCumplido, 'P'), 250)
  eq('sigue sin quedar nada sin asignar', cajonCumplido.unassignedUsd, 0)

  // Con TODOS los demás cumplidos, el cajón se lleva el sobrante entero.
  const todosCumplidos = proposeAllocation(
    [g('1', 'Emergencia', 'fixed', 50, { goal_reached: true }), patri], 300, rates)
  eq('con todos cumplidos, el cajón recibe todo', usdDe(todosCumplidos, 'P'), 300)

  // Sin ningún cajón marcado, el comportamiento anterior sigue vigente.
  const sinCajon = proposeAllocation([g('1', 'Emergencia', 'fixed', 50)], 300, rates)
  eq('sin cajón marcado, el resto queda sin asignar como antes', sinCajon.unassignedUsd, 250)

  // Un cajón archivado no cuenta: vuelve el fallback.
  const cajonArchivado = proposeAllocation(
    [g('1', 'Emergencia', 'fixed', 50), g('P', 'Patrimonio', 'percent', 1, { is_catchall: true, archived: true })], 300, rates)
  eq('un cajón archivado no absorbe nada', cajonArchivado.unassignedUsd, 250)

  // El monto nativo de un fijo NO capeado sigue siendo el que se escribió,
  // sin round-trip por USD.
  const bs = proposeAllocation([g('1', 'Bs', 'fixed', 696, { input_currency: 'BOB' })], 300, rates)
  eq('un fijo no capeado conserva su monto nativo exacto', bs.proposal[0].amount, 696)
}

section('SPRINT 7 · validación')
{
  eq('nombre válido', validateGoalName('Emergencia'), null)
  eq('nombre vacío', validateGoalName(''), 'El ahorro necesita un nombre')
  eq('nombre de solo espacios', validateGoalName('   '), 'El ahorro necesita un nombre')

  eq('reparto fijo válido', validateAllocation('fixed', 50), null)
  eq('reparto porcentual válido', validateAllocation('percent', 30), null)
  eq('reparto en cero', validateAllocation('fixed', 0), 'El reparto debe ser mayor a cero')
  eq('porcentaje mayor a 100', validateAllocation('percent', 150), 'Un porcentaje no puede superar 100')
  eq('tipo inválido', validateAllocation('mitad', 10), 'Tipo de reparto inválido')

  eq('sin meta es válido', validateTargetAmount(null), null)
  eq('meta positiva es válida', validateTargetAmount(500), null)
  eq('meta en cero es inválida', validateTargetAmount(0), 'La meta debe ser mayor a cero')
}

section('Fijos · el desglose que muestra el detalle (partes + tu parte)')
{
  // Lo que ve el usuario al tocar un fijo compartido: nombre y monto de cada
  // persona, más cuánto le queda a él. Es el mismo par de funciones que usa el
  // sheet de registrar, así que lo que se ve en el detalle es exactamente lo
  // que se va a generar al pagarlo.
  const conUno = [{ person_id: 'a', amount: null }]
  const partesUno = resolveSplits(conUno, 60, 'USD')
  eq('60 entre vos y una persona: 30 cada uno', partesUno.map(p => p.amount), [30])
  eq('y tu parte son los otros 30', shareBreakdown(60, partesUno, 'USD').mine, 30)

  // El centavo que no divide queda de TU lado, nunca del de ellos: es la regla
  // "el que paga se come los centavos" (§ evenSplit), la única que mantiene
  // Σ partes ≤ monto.
  const conDos = [{ person_id: 'a', amount: null }, { person_id: 'b', amount: null }]
  const partesDos = resolveSplits(conDos, 11.99, 'USD')
  eq('11,99 entre tres: a ellos 3,99 cada uno', partesDos.map(p => p.amount), [3.99, 3.99])
  eq('y el centavo que sobra lo pagás vos', shareBreakdown(11.99, partesDos, 'USD').mine, 4.01)

  // Reparto que se pasa del gasto: tu parte queda negativa y se llama ganancia.
  const cobrasDeMas = [{ person_id: 'a', amount: 40 }, { person_id: 'b', amount: 40 }]
  const bd = shareBreakdown(60, resolveSplits(cobrasDeMas, 60, 'USD'), 'USD')
  eq('repartir 80 sobre un gasto de 60 es ganancia', bd.kind, 'ganas')
  eq('de 20', Math.abs(bd.mine), 20)
}


/* ══════════════════════════════════════════════════════════════════════════
   SPRINT 8 · Guarda de código: toda llamada a la API lleva el perfil
   ══════════════════════════════════════════════════════════════════════════

   Esto no prueba una función: revisa el código fuente. Va acá porque el bug que
   previene no se puede atrapar de otra forma y ya se escapó una vez.

   Las rutas leen el perfil de `?profile=`, que pone `fzFetch`. Un `fetch()`
   pelado a /api/finanzas NO falla: escribe en el perfil default en silencio.
   Pasó de verdad — siete llamadas de crear/editar (cuentas, movimientos,
   deudas, fijos, ahorros, pasanaku y planes) quedaron sin envolver porque
   estaban escritas en varias líneas con un ternario:

       await fetch(
         editing ? `/api/finanzas/x/${id}` : '/api/finanzas/x',

   El resultado era que en cualquier perfil que no fuera el principal, nada de
   lo que creabas se guardaba ahí. Y la verificación original usaba el mismo
   patrón pegado que la conversión, así que tampoco lo vio.
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   SPRINT 9 · Qué merece un aviso
   ══════════════════════════════════════════════════════════════════════════ */

section('SPRINT 9 · fijos')
{
  const rates = { BOB: 6.96 }
  const base = {
    id: 'f1', name: 'Alquiler', amount: 2100, currency: 'BOB',
    status: 'pendiente', due: '2026-08-30', days_late: 0,
  }

  eq('un fijo pausado no avisa',
     avisosDeFijos([{ ...base, status: 'pausado' }], '2026-08-29', rates).length, 0)
  eq('uno ya registrado tampoco',
     avisosDeFijos([{ ...base, status: 'registrado' }], '2026-08-29', rates).length, 0)

  const lejos = avisosDeFijos([base], '2026-08-20', rates)
  eq('a 10 días todavía no avisa', lejos.length, 0)

  const cerca = avisosDeFijos([base], '2026-08-28', rates)
  eq('a 2 días sí', cerca.length, 1)
  eq('y dice cuánto falta', cerca[0].title, 'Alquiler vence en 2 días')
  eq('con el monto convertido a USD', cerca[0].body, '$301.72')

  const hoy = avisosDeFijos([base], '2026-08-30', rates)
  eq('el día que vence lo dice así', hoy[0].title, 'Alquiler vence hoy')

  const venc = avisosDeFijos([{ ...base, status: 'vencido' }], '2026-09-02', rates)
  eq('vencido avisa aparte', venc[0].title, 'Alquiler venció')
  ok('y dice qué día vencía', venc[0].body.includes('vencía el 30'), venc[0].body)

  // El corazón del anti-repetición: la clave lleva el período.
  const agosto = avisosDeFijos([base], '2026-08-28', rates)[0]
  const septiembre = avisosDeFijos([{ ...base, due: '2026-09-30' }], '2026-09-28', rates)[0]
  ok('la clave cambia de mes a mes', agosto.dedupeKey !== septiembre.dedupeKey,
     `${agosto.dedupeKey} vs ${septiembre.dedupeKey}`)
  eq('pero es la misma dos veces en el mismo mes',
     avisosDeFijos([base], '2026-08-29', rates)[0].dedupeKey, agosto.dedupeKey)
  ok('y distingue vencido de por-vencer',
     venc[0].dedupeKey !== agosto.dedupeKey)
}

section('SPRINT 9 · presupuesto')
{
  const linea = (over) => ({
    line_id: 'l1', name: 'Comida', category_names: ['Comida'],
    amount_usd: 320, extended_usd: 0, carried_usd: 0, spent_usd: over,
  })
  const payload = (spent) => ({ categories: [linea(spent)], pending_closures: [] })

  eq('al 50% no avisa', avisosDePresupuesto(payload(160), '2026-08').length, 0)
  eq('al 89% tampoco', avisosDePresupuesto(payload(284.8), '2026-08').length, 0)

  const al90 = avisosDePresupuesto(payload(290), '2026-08')
  eq('al 90% sí', al90.length, 1)
  eq('y dice cuánto queda', al90[0].body, 'Te quedan $30.00 de $320.00')

  const pasado = avisosDePresupuesto(payload(358), '2026-08')
  eq('pasarse avisa distinto', pasado[0].title, 'Te pasaste en Comida')
  eq('con cuánto de más', pasado[0].body, '$38.00 por encima de $320.00')
  ok('y con otra clave, para que no lo tape el aviso del 90%',
     pasado[0].dedupeKey !== al90[0].dedupeKey)

  eq('una línea sin monto cargado no avisa',
     avisosDePresupuesto({ categories: [{ ...linea(999), amount_usd: null }], pending_closures: [] }, '2026-08').length, 0)

  const cierre = avisosDePresupuesto({ categories: [], pending_closures: [{ period: '2026-07-01' }] }, '2026-08')
  eq('un cierre sin responder avisa', cierre[0].title, 'Julio quedó sin cerrar')
}

section('SPRINT 9 · ahorro')
{
  const meta = { id: 'g1', name: 'Viaje', balance_usd: 1200, goal_reached: true, archived: false }

  const sobrante = avisosDeAhorro([], '2026-07-01', 214)
  eq('el sobrante sin repartir avisa', sobrante[0].title, 'Te sobraron $214.00 en Julio')

  eq('un sobrante de cero no avisa', avisosDeAhorro([], '2026-07-01', 0).length, 0)
  eq('ni uno negativo', avisosDeAhorro([], '2026-07-01', -50).length, 0)
  eq('ni si no hay período pendiente', avisosDeAhorro([], null, 300).length, 0)

  const cumplida = avisosDeAhorro([meta], null, 0)
  eq('una meta cumplida avisa', cumplida[0].title, 'Viaje llegó a su meta')
  eq('una meta archivada no', avisosDeAhorro([{ ...meta, archived: true }], null, 0).length, 0)
  eq('ni una sin cumplir', avisosDeAhorro([{ ...meta, goal_reached: false }], null, 0).length, 0)

  // Una meta se cumple una vez: su clave NO lleva período.
  ok('la clave de la meta no depende del mes', cumplida[0].dedupeKey === 'meta:g1')
}

section('SPRINT 9 · deudas')
{
  const p = (dias, usd) => ({ person: { id: 'p1', name: 'Ana' }, oldest_days: dias, open_usd: usd })

  eq('a 29 días no avisa', avisosDeDeudas([p(29, 20)]).length, 0)
  const vieja = avisosDeDeudas([p(30, 20)])
  eq('a 30 sí', vieja.length, 1)
  eq('con el texto completo', vieja[0].title, 'Ana te debe hace 30 días')
  eq('sin deuda abierta no avisa', avisosDeDeudas([p(60, 0)]).length, 0)
  eq('sin fecha tampoco', avisosDeDeudas([p(null, 20)]).length, 0)

  // Si la clave llevara los días exactos avisaría TODOS los días.
  eq('la clave no cambia al pasar los días',
     avisosDeDeudas([p(45, 20)])[0].dedupeKey, vieja[0].dedupeKey)
}

section('SPRINT 9 · recordatorio de anotar')
{
  ok('justo a la hora, toca', tocaRecordatorio('14:00', '14:00'))
  ok('a los 14 minutos todavía toca', tocaRecordatorio('14:14', '14:00'))
  ok('a los 15 ya no', !tocaRecordatorio('14:15', '14:00'))
  ok('antes de la hora, no', !tocaRecordatorio('13:59', '14:00'))
  ok('una hora después, no', !tocaRecordatorio('15:00', '14:00'))

  // La ventana tiene que cruzar la medianoche. Con una resta simple, un
  // recordatorio a las 23:50 no se disparaba nunca: la corrida de las 23:45
  // daba −5 y la de las 00:00 daba −1430, porque el reloj vuelve a cero.
  ok('23:50 se dispara en la corrida de las 00:00', tocaRecordatorio('00:00', '23:50'))
  ok('y no en la de las 23:45', !tocaRecordatorio('23:45', '23:50'))
  ok('23:58 se dispara a las 00:00', tocaRecordatorio('00:00', '23:58'))
  ok('00:05 no dispara un recordatorio de las 23:50', !tocaRecordatorio('00:05', '23:50'))
  ok('el mediodía sigue sin verse afectado', !tocaRecordatorio('00:00', '14:00'))

  const a = avisoDeAnotar('2026-08-27', 'mediodia')
  const b = avisoDeAnotar('2026-08-27', 'noche')
  const c = avisoDeAnotar('2026-08-28', 'mediodia')
  ok('mediodía y noche son avisos distintos', a.dedupeKey !== b.dedupeKey)
  ok('y el de mañana también', a.dedupeKey !== c.dedupeKey)
  eq('abre el quick-add', a.url, '/finanzas?quickadd=1')
}

section('SPRINT 9 · auxiliares')
{
  eq('días entre dos fechas', diasEntre('2026-08-27', '2026-08-30'), 3)
  eq('negativo si ya pasó', diasEntre('2026-08-30', '2026-08-27'), -3)
  eq('cruzando el mes', diasEntre('2026-08-30', '2026-09-02'), 3)
  eq('cruzando el año', diasEntre('2026-12-30', '2027-01-02'), 3)
  eq('mes en texto', mesLargo('2026-08'), 'Agosto')
  eq('desde el primero del mes', mesLargo('2026-01-01'), 'Enero')
  eq('los umbrales son los documentados', [UMBRALES.diasAntesDeVencer, UMBRALES.pctAviso, UMBRALES.diasDeudaVieja], [2, 90, 30])
}

section('SPRINT 9 · las Edge Functions compilan')
{
  // El chequeo que faltaba. `tsconfig.json` excluye `supabase/functions` porque
  // ese código es para Deno —imports con extensión .ts y el cliente por URL—,
  // así que TypeScript nunca lo miraba.
  //
  // El costo fue real: se desplegó una llamada a `loadBudgets` sin una
  // propiedad obligatoria, la función reventó en CADA corrida durante horas, y
  // no se vio porque el cron reportaba "succeeded" (pg_net solo encola) y el
  // 500 quedaba enterrado en net._http_response.
  //
  // `tsconfig.functions.json` lo mira con las reglas de Deno. Verificado:
  // reintroducir aquel bug hace fallar esta prueba.
  const { execFileSync } = await import('node:child_process')
  const { join } = await import('node:path')
  const raiz = process.env.FZ_ROOT ?? '.'

  let compila = true
  let detalle = ''
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', join(raiz, 'tsconfig.functions.json')],
      { cwd: raiz, stdio: 'pipe' })
  } catch (e) {
    compila = false
    detalle = (String(e.stdout ?? '') + String(e.stderr ?? '')).split('\n').slice(0, 3).join(' · ')
  }

  ok('el código que corre en Supabase pasa el chequeo de tipos', compila, detalle.trim())
}

section('SPRINT 9 · la copia de lib/finanzas para Deno está al día')
{
  // La Edge Function de notificaciones no reescribe la lógica de dominio: usa
  // una copia de lib/finanzas transformada para Deno por
  // scripts/build-edge-shared.mjs. Si esa copia queda vieja, la notificación
  // puede decir algo distinto de lo que muestra la app — dos verdades sobre la
  // misma plata, que es el peor final posible de este sprint.
  //
  // Esto compara el hash del origen contra el sello de la copia.
  const { execFileSync } = await import('node:child_process')
  const { join } = await import('node:path')
  const raiz = process.env.FZ_ROOT ?? '.'

  let alDia = true
  let detalle = ''
  try {
    execFileSync('node', [join(raiz, 'scripts/build-edge-shared.mjs'), '--check'], { stdio: 'pipe' })
  } catch (e) {
    alDia = false
    detalle = String(e.stdout ?? '') + String(e.stderr ?? '')
  }

  ok('la copia refleja el lib/finanzas actual', alDia, detalle.trim())
}

section('SPRINT 8 · ninguna llamada del cliente se salta el perfil')
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')

  const raiz = join(process.env.FZ_ROOT ?? '.', 'app/finanzas')
  const archivos = []
  const recorrer = dir => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) recorrer(full)
      else if (/\.tsx?$/.test(e)) archivos.push(full)
    }
  }
  recorrer(raiz)

  // LISTA BLANCA, no patrón. Los intentos anteriores buscaban `fetch(` seguido
  // de una URL literal de /api/finanzas, y se les escaparon tres formas
  // distintas de escribir lo mismo:
  //
  //   fetch(\n  editing ? `/api/…/${id}` : '/api/…',   ← multilínea + ternario
  //   fetch(url, init)                                  ← URL en una variable
  //   fetch(`/api/finanzas/transactions?${key}`)        ← dentro de un hook
  //
  // Así que ahora se prohíbe `fetch(` en TODA la mini-app y se enumeran las
  // excepciones. Una llamada nueva falla hasta que alguien la mire.
  const PERMITIDOS = new Map([
    // Arma la URL de /bootstrap con el perfil a mano; es el origen del dato.
    ['components/data-context.tsx', 2],
    // El envoltorio.
    ['components/fz-fetch.ts', 1],
    // No es de finanzas: pregunta la versión del Hub.
    ['components/pull-to-refresh.tsx', 1],
    // Sprint 9. Estas dos hablan con rutas que usan `requireUser`, no
    // `requireProfile`: una suscripción de push y las preferencias de aviso son
    // del USUARIO, no de un perfil — un teléfono es un teléfono y recibe los
    // avisos de todos. Mandarles `?profile=` no rompería nada, pero diría algo
    // falso sobre a quién pertenece el dato.
    ['components/push-setup.tsx', 2],
    // 2: leer y guardar preferencias. Las dos van a una ruta de usuario, no de
    // perfil — las preferencias de aviso son tuyas, no de un cajón.
    ['screens/ajustes/notificaciones.tsx', 2],
  ])

  const sobrantes = []
  for (const f of archivos) {
    const rel = f.replace(/.*\/app\/finanzas\//, '')
    const src = readFileSync(f, 'utf8')
    const n = (src.match(/(?<![A-Za-z])fetch\(/g) ?? []).length
    const permitidas = PERMITIDOS.get(rel) ?? 0
    if (n > permitidas) sobrantes.push(`${rel}: ${n} fetch() y solo ${permitidas} permitidas`)
  }

  ok('todo pasa por fzFetch; las excepciones están enumeradas', sobrantes.length === 0,
     sobrantes.join('  ·  '))
}



section('SPRINT 10 · el presupuesto reserva antes que el ahorro')
{
  // Dos sobres: Comida con $300 libres y $120 de fijos sin pagar; Software
  // con $20 libres y $30 de fijos.
  const lineas = [
    { available_usd: 300, committed_usd: 120, category_ids: ['comida'] },
    { available_usd: 20,  committed_usd: 30,  category_ids: ['software'] },
  ]
  const fijos = [
    { category_id: 'comida',   active: true, status: 'pendiente', amountUsd: 120 },
    { category_id: 'software', active: true, status: 'pendiente', amountUsd: 30 },
    { category_id: 'contador', active: true, status: 'pendiente', amountUsd: 83 },
  ]

  eq('el sobre entero: lo que queda MÁS los fijos que igual tienen que salir',
     budgetReservedUsd(lineas, []).total_usd, 470)
  eq('los fijos sin línea se suman aparte; los que ya están en un sobre no se repiten',
     budgetReservedUsd(lineas, fijos).total_usd, 553)
  // El desglose existe porque el total no cuadra con lo que muestra
  // Presupuesto: la diferencia son justo los fijos sin presupuesto.
  eq('el desglose separa presupuestos de fijos sueltos',
     budgetReservedUsd(lineas, fijos).in_budgets_usd, 470)
  eq('y los fijos sueltos son la diferencia contra el total de Presupuesto',
     budgetReservedUsd(lineas, fijos).in_recurring_usd, 83)

  // Pasarse de un presupuesto no libera plata para ahorrar.
  const pasado = [{ available_usd: -80, committed_usd: 0, category_ids: ['comida'] }]
  eq('un sobre excedido cuenta como cero, nunca como negativo',
     budgetReservedUsd(pasado, []).total_usd, 0)
  eq('y no le come la reserva a los demás',
     budgetReservedUsd([...pasado, { available_usd: 100, committed_usd: 0, category_ids: ['x'] }], []).total_usd, 100)

  eq('sin presupuestos ni fijos no se reserva nada', budgetReservedUsd([], []).total_usd, 0)
  eq('una línea sin monto cargado no reserva',
     budgetReservedUsd([{ available_usd: null, committed_usd: 0, category_ids: ['y'] }], []).total_usd, 0)

  // El tope de lo que se puede apartar.
  eq('con más plata que reserva, se puede ahorrar la diferencia', savableUsd(800, 553), 247)
  eq('con justo lo reservado, no se puede ahorrar nada', savableUsd(553, 553), 0)
  eq('y estando corto tampoco: el tope nunca es negativo', savableUsd(400, 553), 0)

  // La propiedad que hace que no haga falta declarar ingresos: la reserva se
  // queda quieta y lo apartable crece solo a medida que entra plata.
  eq('cobrar $200 habilita exactamente $200 más para ahorrar',
     savableUsd(600, 553) - savableUsd(400, 553), 47)
  eq('y una vez cubierta la reserva, cada dólar que entra es ahorrable',
     savableUsd(800, 553) - savableUsd(600, 553), 200)
}


section('Fijo de ahorro · reconocerlo no depende de la cuenta destino')
{
  // La migración 20260826000000 hizo opcional `to_account_id`: sin cuenta
  // destino, la plata se aparta en la misma cuenta de donde sale. La función
  // seguía exigiéndola, así que un fijo de ahorro real daba `false` y la
  // pantalla de Ahorros le seguía ofreciendo el botón "Ahorrar" en paralelo.
  ok('con cuenta destino es fijo de ahorro',
     isSavingsRecurring({ savings_goal_id: 'g1', to_account_id: 'a1' }))
  ok('y SIN cuenta destino también — apartar en la misma cuenta es válido',
     isSavingsRecurring({ savings_goal_id: 'g1', to_account_id: null }))
  ok('un fijo común no lo es',
     !isSavingsRecurring({ savings_goal_id: null, to_account_id: null }))
}

process.exit(summary() === 0 ? 0 : 1)
