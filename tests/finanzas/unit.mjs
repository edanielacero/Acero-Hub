import { computeBalances, withBalances, totalUsd } from './.fin/accounts.mjs'
import { toUsd, fromUsd, round2, formatSigned, formatUSD, formatBOB, parseDecimalInput, amountFromInput, num } from './.fin/money.mjs'
import { freezeConversion, validateInput, monthRange, todayISO, groupByDay, gastoUsd, ingresoUsd, lastMonths } from './.fin/transactions.mjs'
import { eq, ok, section, summary } from './harness.mjs'

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
eq('USD no se toca', toUsd(100, 'USD', 6.96), 100)
eq('35 Bs a 6.96', toUsd(35, 'BOB', 6.96), 5.03)
eq('35 Bs a 7.50', toUsd(35, 'BOB', 7.5), 4.67)
eq('300 Bs (pasanaku) a 6.96', toUsd(300, 'BOB', 6.96), 43.1)
eq('ida y vuelta USD→BOB', fromUsd(43.1, 'BOB', 6.96), 299.98)
eq('round2 de flotante sucio', round2(0.1 + 0.2), 0.3)
eq('num() de string', num('1299.50'), 1299.5)
eq('num() de null cae al default', num(null, 0), 0)

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

eq('patrimonio inicial = 3209', totalUsd(withBalances(accounts, [], 6.96)), 3209)
eq('gasto baja el saldo',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'efectivo', to_account_id: null, amount: 35, to_amount: null }]).get('efectivo'), -35)
eq('ingreso sube el saldo',
   computeBalances(accounts, [{ type: 'ingreso', account_id: 'airtm', to_account_id: null, amount: 900, to_amount: null }]).get('airtm'), 2199)

const tr = [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'broker', amount: 100, to_amount: null }]
eq('transferencia no mueve el patrimonio', totalUsd(withBalances(accounts, tr, 6.96)), 3209)

const cross = computeBalances(accounts, [{ type: 'transferencia', account_id: 'airtm', to_account_id: 'efectivo', amount: 50, to_amount: 348 }])
eq('cross-currency: sale 50 USD', cross.get('airtm'), 1249)
eq('cross-currency: entran 348 Bs reales', cross.get('efectivo'), 348)

eq('editar 35→50 no acumula',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'efectivo', to_account_id: null, amount: 50, to_amount: null }]).get('efectivo'), -50)
eq('cuenta archivada no suma al patrimonio',
   totalUsd(withBalances(accounts.map(a => a.id === 'btc' ? { ...a, archived: true } : a), [], 6.96)), 2309)
eq('movimiento de cuenta inexistente no rompe',
   computeBalances(accounts, [{ type: 'gasto', account_id: 'fantasma', to_account_id: null, amount: 10, to_amount: null }]).get('airtm'), 1299)

section('patrimonio con BOB usa la tasa de HOY')
const conBs = [...accounts.slice(0, 4), { ...accounts[4], initial_balance: 696 }, accounts[5]]
eq('696 Bs a 6.96 suman 100 USD', totalUsd(withBalances(conBs, [], 6.96)), 3309)
eq('los mismos 696 Bs a 7.50 suman 92.80', totalUsd(withBalances(conBs, [], 7.5)), 3301.8)

section('congelado de la conversión')
eq('congela tasa y monto', freezeConversion(35, 'BOB', 6.96), { exchange_rate: 6.96, amount_usd: 5.03 })
eq('en USD guarda la tasa igual, para auditar', freezeConversion(100, 'USD', 6.96), { exchange_rate: 6.96, amount_usd: 100 })

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
