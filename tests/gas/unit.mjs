import { costoTotal, esCompartido, historial, kmDisponibles, kmRecorridos, miParte, round2, saldo, viajeEnCurso } from './.gas/calc.mjs'
import { fmtBs, fmtKm, fmtMes, mesDe, numeroDeInput, paraInput, parseNumeroInput } from './.gas/format.mjs'
// El harness es infraestructura de tests, no dominio de Finanzas: se reusa tal
// cual. Si aparece una tercera suite conviene subirlo a tests/.
import { eq, ok, section, summary } from '../finanzas/harness.mjs'

const viaje = (p = {}) => ({
  tipo: 'viaje', id: 'v', autoId: 'a', ocurridoEn: '2026-08-28T12:00:00Z',
  kmInicial: 1000, kmFinal: 1050, personas: 1, bsPorKm: 0.7, terminadoEn: null, ...p,
})
const carga = (p = {}) => ({
  tipo: 'carga', id: 'c', autoId: 'a', ocurridoEn: '2026-08-28T10:00:00Z', monto: 100, ...p,
})
const AUTO_ROJO = { id: 'a', nombre: 'Auto rojo', color: 'rojo', bsPorKm: 0.7, orden: 0 }

section('SEPARADOR DECIMAL · la coma boliviana')
const tipear = (texto, dec) => {
  let v = ''
  for (const k of texto) v = parseNumeroInput(v + k, dec)
  return v
}
// Lo que se MUESTRA lleva coma, escriba el usuario coma o punto: el campo no
// puede decir "12120.2" justo encima de un texto que dice "12.120,2 km".
eq('se tipea punto, se muestra coma', tipear('0.70'), '0,70')
eq('se tipea coma, se muestra coma', tipear('0,70'), '0,70')
eq('monto grande', tipear('1234,56'), '1234,56')
eq('descarta letras', parseNumeroInput('12a,5b'), '12,5')
eq('solo el primer separador cuenta', parseNumeroInput('1,2,3'), '1,23')
eq('corta en los decimales pedidos', parseNumeroInput('1,999', 2), '1,99')
eq('km admite un decimal', parseNumeroInput('12,34', 1), '12,3')
eq('deja escribir el separador suelto', parseNumeroInput('12,'), '12,')

// Y lo que VALE es el número correcto — que es el bug que esto previene.
eq('"0,70" vale 0.7, no 70', numeroDeInput(tipear('0,70')), 0.7)
eq('"0.70" vale 0.7', numeroDeInput(tipear('0.70')), 0.7)
eq('"5,03" vale 5.03, no 503', numeroDeInput(tipear('5,03')), 5.03)
eq('"12120,2" vale 12120.2', numeroDeInput(tipear('12120,2', 1)), 12120.2)
eq('separador suelto no rompe', numeroDeInput('12,'), 12)
eq('vacío es NaN, no cero', Number.isNaN(numeroDeInput('')), true)

// Precarga: lo guardado vuelve al campo en la forma en que se escribe.
eq('precarga con coma', paraInput(12120.2), '12120,2')
eq('precarga de un entero no inventa decimales', paraInput(12071), '12071')
eq('precarga del promedio', paraInput(0.7), '0,7')
eq('ida y vuelta', numeroDeInput(paraInput(0.9)), 0.9)

section('UN VIAJE SOLO')
const solo = viaje()
eq('50 km recorridos', kmRecorridos(solo), 50)
eq('cuesta Bs 35', costoTotal(solo), 35)
eq('me toca todo', miParte(solo), 35)
eq('no es compartido', esCompartido(solo), false)

section('VIAJE COMPARTIDO · personas incluye al conductor')
const entre4 = viaje({ personas: 4 })
eq('el total no cambia', costoTotal(entre4), 35)
eq('entre 4 me toca 8,75', miParte(entre4), 8.75)
eq('sí es compartido', esCompartido(entre4), true)
eq('entre 2 me toca la mitad', miParte(viaje({ personas: 2 })), 17.5)

section('VIAJE EN CURSO · todavía no cuesta nada')
const abierto = viaje({ id: 'abierto', kmFinal: null })
eq('km desconocidos', kmRecorridos(abierto), null)
eq('costo desconocido', costoTotal(abierto), null)
eq('no mueve el saldo', saldo([abierto]), 0)
eq('se lo encuentra', viajeEnCurso([abierto])?.id, 'abierto')
eq('sin viaje abierto devuelve null', viajeEnCurso([carga()]), null)

section('REDONDEO · donde el punto flotante muerde')
eq('35 entre 3 → 11,67 y no 11,666…', miParte(viaje({ personas: 3 })), 11.67)
eq('3 km a 0,10 → 0,30 y no 0,30000000000000004',
  costoTotal(viaje({ kmInicial: 0, kmFinal: 3, bsPorKm: 0.1 })), 0.3)
eq('12,3 km a 0,90 → 11,07', costoTotal(viaje({ kmInicial: 0, kmFinal: 12.3, bsPorKm: 0.9 })), 11.07)
eq('round2 sobre el clásico 1,005', round2(1.005), 1.01)
eq('km con un decimal', kmRecorridos(viaje({ kmInicial: 100.1, kmFinal: 112.4 })), 12.3)

section('SALDO')
eq('carga 100, viaje entre 4 → 91,25', saldo([carga(), viaje({ personas: 4, ocurridoEn: '2026-08-28T11:00:00Z' })]), 91.25)
eq('sin movimientos, cero', saldo([]), 0)
eq('puede quedar negativo: 10 − 35 = −25', saldo([carga({ monto: 10 }), viaje()]), -25)
eq('una carga después de deber, suma', saldo([carga({ monto: 10 }), viaje(), carga({ id: 'c2', monto: 50 })]), 25)

section('KM DISPONIBLES')
eq('91,25 a 0,70 → 130 km', kmDisponibles(91.25, AUTO_ROJO), 130)
eq('trunca, no redondea para arriba', kmDisponibles(0.69, AUTO_ROJO), 0)
eq('saldo negativo → 0 km', kmDisponibles(-20, AUTO_ROJO), 0)
eq('saldo cero → 0 km', kmDisponibles(0, AUTO_ROJO), 0)

section('HISTORIAL · más nuevo primero, con el saldo corriente')
const filas = historial([
  viaje({ id: 'v1', personas: 1, ocurridoEn: '2026-08-28T11:00:00Z' }),          // −35
  carga({ id: 'c1', monto: 100, ocurridoEn: '2026-08-28T10:00:00Z' }),           // +100
  carga({ id: 'c2', monto: 50, ocurridoEn: '2026-08-28T12:00:00Z' }),            // +50
])
eq('orden descendente por fecha', filas.map(f => f.mov.id), ['c2', 'v1', 'c1'])
eq('el saldo se acumula en orden cronológico', filas.map(f => f.saldo), [115, 65, 100])
eq('el saldo final coincide con saldo()', filas[0].saldo, saldo([
  viaje({ id: 'v1', personas: 1 }), carga({ id: 'c1', monto: 100 }), carga({ id: 'c2', monto: 50 }),
]))
eq('un viaje abierto no rompe la corrida', historial([carga({ monto: 20 }), viaje({ kmFinal: null, ocurridoEn: '2026-08-28T11:00:00Z' })]).map(f => f.saldo), [20, 20])
eq('historial vacío', historial([]), [])

section('MES · el filtro tiene que usar la hora de Bolivia')
// 1 de septiembre 01:00 UTC son las 21:00 del 31 de agosto en La Paz: ese
// viaje pertenece a AGOSTO, no a septiembre.
eq('21:00 del 31/8 en La Paz cae en agosto', mesDe('2026-09-01T01:00:00Z'), '2026-08')
eq('mediodía sin ambigüedad', mesDe('2026-08-28T16:00:00Z'), '2026-08')
eq('cruce de año: 00:30 del 1/1 en La Paz', mesDe('2027-01-01T04:30:00Z'), '2027-01')
// El mes va con cero adelante o el orden de los chips se rompe: como texto,
// "2026-8" va DESPUÉS de "2026-11".
eq('un dígito se rellena a dos', mesDe('2026-08-28T16:00:00Z').split('-')[1], '08')
eq('los meses ordenan bien como texto',
  ['2026-11', '2026-08', '2027-01'].sort(), ['2026-08', '2026-11', '2027-01'])
eq('etiqueta legible', fmtMes('2026-08'), 'ago 2026')
eq('etiqueta de enero', fmtMes('2027-01'), 'ene 2027')

section('FORMATO')
ok('Bs con coma decimal', fmtBs(1234.5).includes(','), fmtBs(1234.5))
eq('negativo con el signo adelante', fmtBs(-12).startsWith('-Bs'), true)
ok('km con coma', fmtKm(12.3).includes(','), fmtKm(12.3))

process.exit(summary() === 0 ? 0 : 1)
