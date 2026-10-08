import {
  calcularEstado, diasDeCorte, puedeEvaluarCorte, diferenciaDias, estadoPorRitmo, gastoDeCorte, poissonCdf, probAtLeast,
  probZeroDia, probZeroRacha, puntoDebil, resolverCpaEsperado, roasEquilibrio, roasObjetivo, sumarDias,
  tasasLlamadas, valorPorLlamada, ventasNuevasParaObjetivo, ventasParaEmpate, ventasParaPiso, alertaCalidadMensajes,
} from './.ads/calc.mjs'
import { fmtMoneda, fmtPct, fmtRoas, hoyBolivia, numeroDeInput, parseNumeroInput } from './.ads/format.mjs'
// El harness es infraestructura de tests, no dominio de Finanzas: se reusa tal cual.
import { eq, ok, section, summary } from '../finanzas/harness.mjs'

const HOY = '2026-09-28'
const AYER = '2026-09-27'
const cerca = (a, b, tol = 0.001) => Math.abs(a - b) <= tol

/** `n` días consecutivos terminando en `hasta`, cada uno armado por `fila(i)`. */
function dias(n, hasta, fila) {
  return Array.from({ length: n }, (_, i) => ({
    fecha: sumarDias(hasta, -(n - 1 - i)),
    gasto: 0, resultadosMeta: 0, conversionesReales: 0, frecuencia: null, landingPageViews: 10,
    ...fila(i),
  }))
}

function entrada({ precio = 24, margen = 24, metricas, tipo = 'compra_stripe', roasManual = null, cambio = null, cpa = null, ref = null, modo = 'conservador', llamadas, capacidad = null }) {
  return {
    tipoConversion: tipo, precioVenta: precio, margenVenta: margen, roasObjetivoManual: roasManual,
    cpaEsperadoManual: cpa, cpaReferencia: ref, modoCorte: modo, metricas, ultimoCambio: cambio, hoy: HOY,
    llamadas, capacidadChatsDia: capacidad, umbralPresupuestoChico: 25,
  }
}
const estado = o => calcularEstado(entrada(o))
const tipos = e => e.banderas.map(b => b.tipo)
/** n días a `gasto` por día con `ventas(i)` conversiones. */
const ciclo = (n, gasto, ventas = () => 0, extra = () => ({})) =>
  dias(n, AYER, i => ({ gasto, conversionesReales: ventas(i), resultadosMeta: ventas(i), ...extra(i) }))

section('§9 · casos de prueba del documento')
ok('probZeroDia(20, 15) = 0,264', cerca(probZeroDia(20, 15), 0.264))
ok('probZeroDia(20, 20) = 0,368', cerca(probZeroDia(20, 20), 0.368))
ok('probZeroRacha(15, 15, 3) = 0,050', cerca(probZeroRacha(15, 15, 3), 0.0498))
eq('ventasNuevasParaObjetivo(13, 26, 2, 60) = 5', ventasNuevasParaObjetivo(13, 26, 2, 60), 5)
eq('ventasParaEmpate(120, 24) = 5', ventasParaEmpate(120, 24), 5)
eq('ventasParaPiso(120, 24) = 7', ventasParaPiso(120, 24), 7)
ok('valorPorLlamada(1500, 0,6, 0,2) ≈ 180', cerca(valorPorLlamada(1500, 0.6, 0.2), 180))

section('§3 · tablas de probabilidad')
ok('λ = 1: 36,8 % · 13,5 % · 5,0 %', cerca(Math.exp(-1), 0.368) && cerca(Math.exp(-2), 0.135) && cerca(Math.exp(-3), 0.0498))
ok('λ = 2: 13,5 % · 1,8 % · 0,25 %', cerca(Math.exp(-2), 0.135) && cerca(Math.exp(-4), 0.0183) && cerca(Math.exp(-6), 0.0025))
ok('$45/día a $15: 5,0 %', cerca(probZeroDia(45, 15), 0.0498))
ok('k = 1 en 5 días: 0,67 %', cerca(Math.exp(-5), 0.0067))
ok('§3.6: P(≥ 5 en 3 días a $20, costo $15) = 37,1 %', cerca(probAtLeast(5, 60 / 15), 0.371))
ok('§3.6: con costo $10 = 71,5 %', cerca(probAtLeast(5, 60 / 10), 0.715))
ok('§3.6: P(≥ 2 mañana, costo $15) = 38,5 %', cerca(probAtLeast(2, 20 / 15), 0.385))
ok('§11.2: ≥ 1 venta mañana con $20 a $15 ≈ 74 %', cerca(1 - probZeroDia(20, 15), 0.736))
ok('cdf monótona y acotada', poissonCdf(0, 2) < poissonCdf(3, 2) && poissonCdf(50, 2) <= 1)
eq('probAtLeast(0, λ) = 1', probAtLeast(0, 3), 1)

section('§2 y §4.2 · fórmulas, corte y CPA esperado')
eq('empate = P / M', roasEquilibrio(24, 24), 1)
ok('piso = empate × 1,35', cerca(roasObjetivo(24, 24, null), 1.35))
eq('piso manual pisa al automático', roasObjetivo(24, 24, 1.6), 1.6)
eq('gasto de corte conservador = 5 × CPA', gastoDeCorte(24, 'conservador'), 120)
eq('gasto de corte estándar = 3 × CPA', gastoDeCorte(24, 'estandar'), 72)
eq('corte a 5 días (conservador)', diasDeCorte(24, 24, 'conservador'), 5)
eq('corte a 3 días (estándar)', diasDeCorte(24, 24, 'estandar'), 3)
eq('presupuesto ≥ 2× CPA → corte a 3 días', diasDeCorte(48, 24, 'conservador'), 3)

section('CORTE POR GASTO · presupuesto menor al costo por venta')
// Tabla del documento: día de corte = max(3, ⌈factor / k⌉).
eq('diasDeCorte(18, 24, conservador) = 7', diasDeCorte(18, 24, 'conservador'), 7)
eq('diasDeCorte(12, 24, conservador) = 10', diasDeCorte(12, 24, 'conservador'), 10)
eq('diasDeCorte(12, 24, estándar) = 6', diasDeCorte(12, 24, 'estandar'), 6)
eq('k = 1,5 → conservador día 4, estándar día 3', [diasDeCorte(36, 24, 'conservador'), diasDeCorte(36, 24, 'estandar')], [4, 3])
eq('k = 0,75 → estándar día 4', diasDeCorte(18, 24, 'estandar'), 4)
ok('puedeEvaluarCorte pide la inversión y 3 días', puedeEvaluarCorte(120, 24, 'conservador', 10) && !puedeEvaluarCorte(108, 24, 'conservador', 9) && !puedeEvaluarCorte(200, 24, 'conservador', 2))
{
  // §6 del documento: costo esperado $24, $12/día, conservador → corte el día 10.
  const lento = n => estado({ metricas: ciclo(n, 12), cpa: 24 })
  const d5 = lento(5)
  eq('día 5 sin ventas: muy pronto para evaluar, nunca rojo', [d5.ciclo.fase, d5.accion, d5.color === 'rojo'], ['recoleccion', 'muy_pronto', false])
  eq('corte estimado al día 10 y la decisión también', [d5.ciclo.diasCorte, d5.ciclo.diasDecision, d5.ciclo.fechaCorte], [10, 10, sumarDias(AYER, 5)])
  ok('el mensaje muestra la inversión que falta', /llevas 60 de 120 invertidos/.test(d5.mensaje), d5.mensaje)
  eq('día 9 sin ventas: sigue muy pronto', lento(9).accion, 'muy_pronto')
  const d10 = lento(10)
  eq('día 10 sin ventas ($120 invertidos): stop-loss', [d10.ciclo.fase, d10.color, d10.accion], ['decision', 'rojo', 'frenar'])
  ok('P(0 en los 10 días) = e^(−5) ≈ 0,7 %', cerca(d10.riesgo.pCeroVentana.d7 ** (10 / 7), Math.exp(-5)))
  ok('bandera de presupuesto bajo (< 0,75 × costo esperado)', tipos(d5).includes('presupuesto_bajo'), JSON.stringify(d5.banderas))
  ok('con presupuesto = costo esperado no hay bandera', !tipos(estado({ metricas: ciclo(5, 24), cpa: 24 })).includes('presupuesto_bajo'))
  ok('con la primera venta ya no hay bandera (no hay corte que esperar)', !tipos(estado({ metricas: ciclo(5, 12, i => (i === 3 ? 1 : 0)), cpa: 24 })).includes('presupuesto_bajo'))
  // Día 7 con ventas pero sin la inversión de corte: la decisión espera.
  const d7 = estado({ metricas: ciclo(7, 12, i => (i === 2 ? 1 : 0)), cpa: 24 })
  eq('día 7 con ventas y sin la inversión de corte: todavía muy pronto', [d7.ciclo.fase, d7.accion], ['recoleccion', 'muy_pronto'])
  ok('con ventas no hay corte: apunta a la decisión del día 10', /no hay corte/.test(d7.mensaje) || /cierre del día 10/.test(d7.mensaje), d7.mensaje)
  // Gasto disparejo: la estimación usa lo que falta al ritmo actual.
  const disparejo = estado({ metricas: dias(4, AYER, i => ({ gasto: i < 2 ? 40 : 10, conversionesReales: 0, resultadosMeta: 0 })), cpa: 24 })
  eq('estima el corte con lo que falta invertir ($20 a $20/día, promedio de 3 días → día 5)', disparejo.ciclo.diasCorte, 5)
}
const r0 = { cpaEsperadoManual: null, cpaReferencia: null, tipoConversion: 'compra_stripe' }
eq('sin datos: CPA esperado = margen', resolverCpaEsperado(r0, 0, 0, 24), { valor: 24, fuente: 'margen' })
eq('con referencia', resolverCpaEsperado({ ...r0, cpaReferencia: 15 }, 0, 0, 24), { valor: 15, fuente: 'referencia' })
eq('el del usuario gana a la referencia', resolverCpaEsperado({ ...r0, cpaReferencia: 15, cpaEsperadoManual: 18 }, 0, 0, 24), { valor: 18, fuente: 'usuario' })
eq('con ≥ 5 conversiones manda el real', resolverCpaEsperado({ ...r0, cpaEsperadoManual: 18 }, 100, 5, 24), { valor: 20, fuente: 'real' })
eq('High Ticket sin datos: 45 % del valor', resolverCpaEsperado({ ...r0, tipoConversion: 'llamadas' }, 0, 0, 180).valor, 81)
eq('fechas', [diferenciaDias('2026-10-03', '2026-09-26'), sumarDias('2026-09-29', 4)], [7, '2026-10-03'])
eq('hoy en Bolivia no es el día UTC', hoyBolivia(new Date('2026-09-29T02:00:00Z')), '2026-09-28')

section('§8.1 · estado por ritmo')
eq('0 ventas con 5× el costo → rojo', estadoPorRitmo(0, 120, 24).estado, 'rojo')
eq('0 ventas con ~2,9× el costo → amarillo (5,2 %)', estadoPorRitmo(0, 70, 24).estado, 'amarillo')
eq('5 ventas con 5× el costo → verde', estadoPorRitmo(5, 120, 24).estado, 'verde')
ok('p_baja con cero ventas = e^(−λ)', cerca(estadoPorRitmo(0, 48, 24).pBaja, Math.exp(-2)))

section('CICLO · sin datos y día 1')
{
  const e = estado({ metricas: [] })
  eq('sin métricas → sin_datos', [e.accion, e.ciclo.fase], ['sin_datos', 'sin_datos'])
  const d1 = estado({ metricas: ciclo(1, 24) })
  eq('día 1 → chequeo técnico', [d1.accion, d1.ciclo.fase], ['chequeo', 'chequeo'])
  ok('día 1: lista de chequeo', d1.chequeo?.length >= 2 && d1.chequeo.every(c => c.ok), JSON.stringify(d1.chequeo))
  const sinPixel = estado({ metricas: ciclo(1, 24, () => 0, () => ({ landingPageViews: 0 })) })
  eq('día 1 sin visitas a la landing → falla el chequeo (rojo)', [sinPixel.color, sinPixel.accion], ['rojo', 'chequeo'])
  eq('corte = día 5 del ciclo (conservador), día 7 = inicio + 6', [d1.ciclo.fechaCorte, d1.ciclo.fechaDecision], [sumarDias(AYER, 4), sumarDias(AYER, 6)])
  ok('sin ventas: el mensaje apunta al corte', /hasta el corte, al cierre del día 5/.test(d1.mensaje), d1.mensaje)
  const conVenta = estado({ metricas: ciclo(1, 24, () => 1) })
  eq('con una venta: primera conversión y el corte ya no aplica', conVenta.ciclo.primeraConversion, AYER)
  ok('el mensaje apunta al día 7', /hasta el cierre del día 7/.test(conVenta.mensaje), conVenta.mensaje)
}

section('§4.3 · un cero de 3 días NO activa el corte antes de tiempo')
{
  const e = estado({ metricas: ciclo(3, 24) })
  eq('día 3 conservador: recolección', e.ciclo.fase, 'recoleccion')
  eq('ritmo bajo (5 %), pero sin la inversión de corte: amarillo, muy pronto', [e.color, e.accion], ['amarillo', 'muy_pronto'])
  ok('el mensaje dice que es normal', /es normal/.test(e.mensaje), e.mensaje)
  eq('racha de 3 días en cero', e.riesgo.racha, 3)
  ok('probabilidad de la racha = e^(−3)', cerca(e.riesgo.pRacha, Math.exp(-3)))
}

section('§4.3 · revisión de corte (día 5, presupuesto = margen)')
{
  const corte = v => estado({ metricas: ciclo(5, 24, i => (i < v ? 1 : 0)) })
  eq('0 ventas → cortar', [corte(0).color, corte(0).accion], ['rojo', 'frenar'])
  eq('3 ventas (< empate 5) → amarillo, sin decidir nada durante el ciclo', [corte(3).color, corte(3).accion], ['amarillo', 'esperar'])
  ok('el mensaje manda a esperar el cierre', /No cambies nada: se decide con el cierre del día 7/.test(corte(3).mensaje), corte(3).mensaje)
  eq('ventas necesarias: empate 5 · piso 7', [corte(3).necesarias.empate, corte(3).necesarias.piso], [5, 7])
  eq('meta del ciclo: el piso al cierre del día 7 (7 × 24 invertidos → 10)', [corte(3).necesarias.gastoAlCierre, corte(3).necesarias.pisoAlCierre], [168, 10])
  const e6 = estado({ metricas: ciclo(5, 24, i => (i < 5 ? 1 : 0)).map((d, i) => (i === 4 ? { ...d, conversionesReales: 2 } : d)) })
  eq('6 ventas (empate–piso) → seguir y vigilar', [e6.color, e6.accion], ['amarillo', 'esperar'])
  const e7 = estado({ metricas: ciclo(5, 24, i => (i < 3 ? 1 : 2)) })
  eq('7 ventas (≥ piso) → verde, sigue sin tocar', [e7.color, e7.accion], ['verde', 'esperar'])
  eq('§11.3: reserva hasta el día 7 = 7 × 24', corte(0).riesgo.reservaDecision, 168)
}

section('§4.2 · modo estándar y presupuesto alto cortan al día 3')
{
  eq('estándar: día 3 sin ventas → cortar', estado({ metricas: ciclo(3, 24), modo: 'estandar' }).accion, 'frenar')
  const alto = estado({ metricas: ciclo(3, 48) })
  eq('presupuesto 2× CPA: corte a los 3 días', [alto.ciclo.diasCorte, alto.accion], [3, 'frenar'])
}

section('§4.4 · decisión del día 7')
{
  const dec = ventas => estado({ metricas: ciclo(8, 24, i => (i < ventas % 8 ? Math.ceil(ventas / 8) : Math.floor(ventas / 8))) })
  const bajo = estado({ metricas: ciclo(8, 24, i => (i < 4 ? 1 : 0)) })
  eq('ROAS bajo el empate → pausar', [bajo.ciclo.fase, bajo.color, bajo.accion], ['decision', 'rojo', 'frenar'])
  const medio = estado({ metricas: ciclo(8, 24, i => (i < 1 ? 2 : 1)) })
  eq('entre empate y piso → mantener', [medio.color, medio.accion], ['amarillo', 'esperar'])
  const sano = estado({ metricas: ciclo(8, 24, i => (i < 6 ? 2 : 1)) })
  eq('ROAS sobre el piso con 14 ventas → escalar vertical', [sano.color, sano.accion], ['verde', 'escalar_vertical'])
  eq('presupuesto chico: paso 30–50 %', [sano.escalado.pasoMin, sano.escalado.pasoMax], [0.3, 0.5])
  ok('presupuesto sugerido = 24 × 1,4', cerca(sano.escalado.presupuestoSugerido, 33.6))
  // profit diario = (14 × 24 − 192) / 8 = 18; conviene si el costo queda bajo M × B / (B + 18)
  ok('§4.5 beneficio real: costo máximo para que convenga', cerca(sano.escalado.cpaMaxParaConvenir, 24 * 33.6 / (33.6 + 18)))
  eq('pérdida máxima si duplica = 7 × 2 × 24', sano.escalado.perdidaMaximaSiDuplica, 336)
  const justo = estado({ metricas: ciclo(8, 24, i => (i < 3 ? 2 : 1)) })
  eq('a menos de 10 % del piso → horizontal', [justo.color, justo.accion], ['verde', 'escalar_horizontal'])
  ok('máximo de conjuntos = presupuesto / CPA', justo.escalado.maxConjuntos >= 1)
  const chico = estado({ metricas: ciclo(8, 10, i => (i < 5 ? 1 : 0)) })
  eq('sobre el piso con muestra chica → mantener otra semana', [chico.color, chico.accion], ['amarillo', 'esperar'])
  ok('el mensaje lo dice', /muestra chica/.test(chico.mensaje), chico.mensaje)
  void dec
}

section('§4.5 · un cambio reinicia el ciclo')
{
  const historia = ciclo(20, 24, () => 2)
  const e = estado({ metricas: historia, cambio: { fecha: sumarDias(HOY, -2), presupuesto: 30 } })
  eq('ciclo desde el cambio', [e.ciclo.inicio, e.ciclo.dias], [sumarDias(HOY, -2), 2])
  ok('sin bandera de reajuste: el ciclo ya lo cubre', !tipos(e).includes('reajuste_tecnico'))
  eq('la reserva usa el gasto real promedio, no el presupuesto cargado', e.riesgo.reservaDecision, 7 * 24)
  // 4 días desde el cambio, ≥ 5 ventas desde el cambio, ≥ 10 en total, ROAS > piso × 1,1
  const e4 = estado({ metricas: historia, cambio: { fecha: sumarDias(HOY, -4), presupuesto: 24 } })
  eq('sobre el piso el día 4: no escala durante el ciclo', [e4.accion, e4.escalado], ['esperar', null])
  ok('el costo esperado ya es el real (≥ 5 ventas)', e4.cpa.fuente === 'real' && cerca(e4.cpa.esperado, 12))
}

section('§5 · mensajes (WhatsApp)')
{
  // 3 días buenos y 3 con chats más baratos y menos ventas.
  const filas = ciclo(6, 30, i => (i < 3 ? 3 : 1), i => ({ resultadosMeta: i < 3 ? 10 : 15 }))
  ok('alerta de calidad: costo baja y conversión cae', alertaCalidadMensajes(filas))
  ok('sin alerta con conversión estable', !alertaCalidadMensajes(ciclo(6, 30, () => 3, () => ({ resultadosMeta: 10 }))))
  const e = estado({ metricas: filas, tipo: 'venta_manual', precio: 25, margen: 25, capacidad: 5 })
  ok('bandera de calidad', tipos(e).includes('calidad_mensajes'), JSON.stringify(tipos(e)))
  ok('costo por conversación = 180 / 75', cerca(e.mensajes.costoConversacion, 2.4))
  ok('% de conversión = 12 / 75', cerca(e.mensajes.conversion, 0.16))
  ok('conversaciones esperadas por día = 30 / 2,4', cerca(e.mensajes.conversacionesEsperadasDia, 12.5))
  ok('avisa capacidad superada (12,5 > 5)', tipos(e).includes('capacidad'))
  const r = estado({ metricas: ciclo(3, 25), tipo: 'venta_manual', precio: 25, margen: 25 })
  ok('WhatsApp en rojo recuerda cargar ventas', /cárgalo en la tabla/.test(r.mensaje), r.mensaje)
}

section('§6 · High Ticket (llamadas)')
{
  const L = (agendadas = 0, asistidas = 0, cerradas = 0) => ({ agendadas, asistidas, cerradas, showEstimado: null, closeEstimado: null })
  const base = { tipo: 'llamadas', precio: 1500, margen: 1500 }
  const d1 = estado({ ...base, metricas: ciclo(1, 81), llamadas: L() })
  ok('escenario medio: valor por llamada $180', cerca(d1.llamadas.valorPorLlamada, 180))
  ok('CPA esperado = 45 % del valor = $81', cerca(d1.cpa.esperado, 81) && d1.cpa.fuente === 'llamada')
  ok('presupuesto sugerido $72–90', cerca(d1.llamadas.presupuestoSugeridoMin, 72) && cerca(d1.llamadas.presupuestoSugeridoMax, 90))
  const corte = estado({ ...base, metricas: ciclo(3, 81), llamadas: L() })
  eq('3 días y 3× el CPA sin llamadas → cortar', [corte.ciclo.diasCorte, corte.accion], [3, 'frenar'])
  ok('el mensaje habla de llamadas', /llamada agendada/.test(corte.mensaje), corte.mensaje)
  eq('tasas: estimadas por defecto', tasasLlamadas(L()).fuente, 'estimadas')
  const mix = tasasLlamadas(L(10, 5, 1))
  eq('asistencia real con 10 agendadas, cierre estimado', [mix.show, mix.close, mix.fuente], [0.5, 0.2, 'mixtas'])
  const cero = estado({ ...base, metricas: ciclo(8, 81, () => 2), llamadas: L(20, 10, 0) })
  eq('0 cierres en 10 asistidas: ninguna llamada paga su costo', [cero.color, cero.accion], ['rojo', 'frenar'])
}

section('§3.5 y §3.6 · observado y bajar el costo')
{
  const e = estado({ metricas: ciclo(8, 24, i => (i % 2 === 0 ? 1 : 0)) })
  ok('% de días en cero observado con ≥ 7 días', cerca(e.riesgo.pctDiasCeroObservado, 0.5))
  const caro = estado({ metricas: ciclo(6, 24, () => 1) })
  ok('costo real 24 > máximo para el piso 17,8 → calcula cuánto haría falta', caro.bajarCosto != null)
  eq('ventas nuevas para llegar al piso en 3 días', caro.bajarCosto.nuevasNecesarias, ventasNuevasParaObjetivo(24 / 1.35, 144, 6, 72))
}

section('§4.6 · fatiga')
{
  const e = estado({ metricas: ciclo(8, 24, () => 2, i => ({ frecuencia: i === 7 ? 3.8 : 2 })) })
  ok('bandera de fatiga con la frecuencia del último día', e.banderas.some(b => b.tipo === 'fatiga_audiencia' && b.frecuencia === 3.8))
}

section('FUNNEL · punto débil')
{
  const stripe = [
    { etiqueta: 'Alcance', valor: 12400 }, { etiqueta: 'Clics', valor: 890 },
    { etiqueta: 'Landing', valor: 640 }, { etiqueta: 'Pago iniciado', valor: 210 }, { etiqueta: 'Compra', valor: 85 },
  ]
  // Alcance→Clics cae 93%: es la mayor, y es esperable. Igual es "la mayor".
  eq('la mayor caída es alcance → clics', puntoDebil(stripe)?.indice, 1)
  const sinAlcance = stripe.slice(1)
  eq('sin alcance, el punto débil es landing → pago', puntoDebil(sinAlcance)?.indice, 2)
  eq('sin caídas → null', puntoDebil([{ etiqueta: 'a', valor: 5 }, { etiqueta: 'b', valor: 5 }]), null)
  eq('escalón en 0 no divide por cero', puntoDebil([{ etiqueta: 'a', valor: 0 }, { etiqueta: 'b', valor: 0 }]), null)
}

section('FORMATO · coma boliviana')
{
  const tipear = t => { let v = ''; for (const k of t) v = parseNumeroInput(v + k); return v }
  eq('"24,50" se muestra con coma', tipear('24,50'), '24,50')
  eq('"24,50" vale 24.5, no 2450', numeroDeInput(tipear('24,50')), 24.5)
  eq('"5.03" vale 5.03', numeroDeInput(tipear('5.03')), 5.03)
  ok('vacío es NaN', Number.isNaN(numeroDeInput('')))
  eq('USD', fmtMoneda(1234.5, 'USD'), '$ 1.234,50')
  eq('BOB', fmtMoneda(25, 'BOB'), 'Bs 25,00')
  eq('ROAS', fmtRoas(1.8396), '1.84x')
  eq('porcentaje con signo', fmtPct(0.3345, true), '+33%')
}

// ═══ SPRINT 3 ═══════════════════════════════════════════════════════════════
const { mapearInsight, mensajeDeError } = await import('./.ads/meta-api.mjs')
const { rangoSync, diasEntre } = await import('./.ads/sync.mjs')
const { validarAlta, validarVenta, validarFecha, normalizarAdAccount } = await import('./.ads/validar.mjs')

section('META · mapeo de Insights (respuesta real de la Graph API)')
{
  const fila = {
    date_start: '2026-09-20', date_stop: '2026-09-20',
    spend: '112.80', reach: '2400', impressions: '3100', frequency: '1.29', cpm: '36.38',
    inline_link_clicks: '92', cost_per_inline_link_click: '1.226', inline_link_click_ctr: '2.97',
    actions: [
      { action_type: 'link_click', value: '92' },
      { action_type: 'landing_page_view', value: '64' },
      { action_type: 'omni_initiated_checkout', value: '18' },
      { action_type: 'initiate_checkout', value: '18' },
      { action_type: 'omni_purchase', value: '6' },
      { action_type: 'purchase', value: '6' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '6' },
    ],
    cost_per_action_type: [{ action_type: 'omni_purchase', value: '18.80' }],
  }
  const m = mapearInsight(fila, 'compra_stripe')
  eq('fecha', m.fecha, '2026-09-20')
  eq('gasto numérico', m.gasto, 112.8)
  eq('la compra se cuenta UNA vez aunque venga con 3 nombres', m.resultados, 6)
  eq('costo por resultado de Meta', m.costo_por_resultado, 18.8)
  eq('landing page views', m.landing_page_views, 64)
  eq('checkout iniciado sin duplicar', m.pagos_iniciados, 18)
  eq('clics de enlace', m.clics_enlace, 92)
  eq('guarda la respuesta cruda', m.raw_json, fila)

  const wa = mapearInsight({
    date_start: '2026-09-20', spend: '54.36',
    actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }],
  }, 'venta_manual')
  eq('WhatsApp: resultado = conversación iniciada', wa.resultados, 10)
  eq('WhatsApp: costo calculado si Meta no lo trae', Math.round(wa.costo_por_resultado * 1000) / 1000, 5.436)
  eq('WhatsApp: sin landing ni checkout', [wa.landing_page_views, wa.pagos_iniciados], [null, null])

  const vacio = mapearInsight({ date_start: '2026-09-20', spend: '5' }, 'compra_stripe')
  eq('sin actions: 0 resultados, costo null', [vacio.resultados, vacio.costo_por_resultado], [0, null])

  eq('error 190 = token vencido', mensajeDeError({ error: { code: 190, message: 'x' } }, 400).codigo, 190)
  ok('error 190 da un mensaje entendible', /token de Meta venció/.test(mensajeDeError({ error: { code: 190 } }, 400).message))
  ok('rate limit tiene mensaje propio', /limitó/.test(mensajeDeError({ error: { code: 17 } }, 400).message))
}

section('SYNC · rango de días')
eq('primera vez: 30 días, hoy incluido', rangoSync(null, '2026-09-28'), { desde: '2026-08-30', hasta: '2026-09-28' })
eq('con historial: re-trae los últimos 3 y llega a hoy', rangoSync('2026-09-27', '2026-09-28'), { desde: '2026-09-25', hasta: '2026-09-28' })
eq('si ayer se guardó hoy a medias, lo completa', rangoSync('2026-09-28', '2026-09-29'), { desde: '2026-09-26', hasta: '2026-09-29' })
eq('historial viejo: desde 2 días antes del último', rangoSync('2026-09-10', '2026-09-28'), { desde: '2026-09-08', hasta: '2026-09-28' })
eq('incluye el día en curso', rangoSync('2026-09-28', '2026-09-28').hasta, '2026-09-28')
eq('días entre dos fechas', diasEntre('2026-09-29', '2026-10-01'), ['2026-09-29', '2026-09-30', '2026-10-01'])

section('VALIDACIÓN')
{
  const base = { metaCampaignId: '120211000000000001', metaAdAccountId: 'act_123456', nombre: 'X', moneda: 'USD', tipoConversion: 'compra_stripe', precioVenta: 24, margenVenta: 24 }
  ok('alta válida', validarAlta(base).ok)
  eq('acepta la cuenta sin act_', normalizarAdAccount('123456'), 'act_123456')
  eq('acepta ACT_ en mayúsculas', normalizarAdAccount('ACT_123456'), 'act_123456')
  eq('precio con coma', validarAlta({ ...base, precioVenta: '24,5', margenVenta: '20' }).valor?.precio_venta, 24.5)
  ok('margen > precio es error', !validarAlta({ ...base, margenVenta: 25 }).ok)
  eq('fecha futura rechazada', validarFecha('2026-09-29', '2026-09-28'), null)
  eq('fecha imposible rechazada', validarFecha('2026-02-30', '2026-09-28'), null)
  eq('fecha de hoy aceptada', validarFecha('2026-09-28', '2026-09-28'), '2026-09-28')
  ok('venta con decimales rechazada', !validarVenta({ fecha: '2026-09-28', cantidad: 1.5 }, '2026-09-28').ok)
  ok('venta negativa rechazada', !validarVenta({ fecha: '2026-09-28', cantidad: -1 }, '2026-09-28').ok)
  ok('venta en cero aceptada (día sin ventas)', validarVenta({ fecha: '2026-09-28', cantidad: 0 }, '2026-09-28').ok)
  eq('compras: solo neto con coma', validarVenta({ fecha: '2026-09-28', neto: '123,45' }, '2026-09-28', false).valor, { fecha: '2026-09-28', cantidad: null, neto: 123.45, nota: null })
  ok('compras: ni cantidad ni neto → error', !validarVenta({ fecha: '2026-09-28' }, '2026-09-28', false).ok)
  ok('compras: neto negativo → error', !validarVenta({ fecha: '2026-09-28', neto: -1 }, '2026-09-28', false).ok)
  ok('WhatsApp: sin cantidad → error aunque venga neto', !validarVenta({ fecha: '2026-09-28', neto: 10 }, '2026-09-28', true).ok)
  eq('WhatsApp: el neto se ignora', validarVenta({ fecha: '2026-09-28', cantidad: 2, neto: 10 }, '2026-09-28', true).valor?.neto, null)
  const { validarCambio } = await import('./.ads/validar.mjs')
  eq('cambio sin fecha = ahora', validarCambio({ tipo: 'creativo' }, '2026-09-28').valor?.fecha, null)
  eq('cambio con fecha pasada', validarCambio({ tipo: 'creativo', fecha: '2026-09-20' }, '2026-09-28').valor?.fecha, '2026-09-20')
  ok('cambio con fecha futura rechazado', !validarCambio({ tipo: 'creativo', fecha: '2026-09-29' }, '2026-09-28').ok)
  ok('cambio sin tipo rechazado', !validarCambio({ fecha: '2026-09-20' }, '2026-09-28').ok)
}

// ═══ ANALIZAR CON CLAUDE ════════════════════════════════════════════════════
const { promptCampana, promptPortafolio, DIAS_EN_PROMPT } = await import('./.ads/prompt.mjs')
const { armarEstado } = await import('./.ads/load.mjs')

/** Extrae y parsea el bloque ```json del prompt. */
const jsonDe = p => JSON.parse(p.match(/```json\n([\s\S]*?)\n```/)[1])

section('PROMPT · una campaña')
{
  const campana = {
    id: 'c1', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'Curso TOEFL', moneda: 'USD',
    tipoConversion: 'compra_stripe', precioVenta: 24, margenVenta: 24, roasObjetivo: null, activo: true,
    ultimaSync: null, createdAt: '2026-08-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  // 8 compras por día según Meta a $18,80 cada una (56 en 7 días: fuera de aprendizaje).
  const metricas = []
  for (let i = 40; i >= 1; i--) {
    const fecha = sumarDias(HOY, -i)
    metricas.push({ fecha, gasto: 150.4, alcance: 2400, impresiones: 3100, frecuencia: 1.3, cpm: 36, clicsEnlace: 92, cpcEnlace: 1.2, ctrEnlace: 2.97, resultados: 8, costoPorResultado: 18.8, landingPageViews: 64, pagosIniciados: 18 })
  }
  const cambios = [{ id: 'k', fecha: '2026-09-18T12:00:00Z', tipo: 'presupuesto', detalle: 'Subí de 100 a 115' }]
  const base = armarEstado(campana, metricas, [], [], { fecha: cambios[0].fecha, presupuesto: null }, HOY)
  const p = promptCampana({ ...base, metricas, ventas: [], cambios, hoy: HOY })

  ok('pide respuesta en español', /Responde en español/.test(p))
  ok('incluye las reglas con los umbrales de calc.ts', /ROAS piso = empate × 1.35/.test(p) && /≥ 3.5/.test(p) && /Día 1: solo chequeo técnico/.test(p))
  ok('nombra la campaña en el pedido', /"Curso TOEFL"/.test(p))
  let d
  ok('el bloque JSON se parsea', (() => { try { d = jsonDe(p); return true } catch { return false } })())
  eq(`manda solo los últimos ${DIAS_EN_PROMPT} días`, d[`ultimos_${DIAS_EN_PROMPT}_dias`].length, DIAS_EN_PROMPT)
  eq('el análisis calculado viaja', d.analisis.accion_sugerida, base.estado.accion)
  ok('viajan fase, ritmo y probabilidades ya calculados', d.analisis.ciclo.fase && 'riesgo' in d.analisis && 'conversiones_necesarias_con_la_inversion_actual' in d.analisis)
  ok('le pide no recalcular', /No recalcules nada/.test(p))
  eq('ventas por día salen de Meta', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].ventas, 8)
  eq('ganancia neta por día = compras × margen', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].ganancia_neta, 192)
  eq('profit por día = neto estimado − gasto', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].profit, 41.6)
  ok('ya no manda nada de Stripe', !/stripe_ultimos|motivos_de_rechazo/.test(p))
  eq('los cambios viajan', d.cambios_registrados[0].detalle, 'Subí de 100 a 115')
  ok('sin NaN ni Infinity en el JSON', !/NaN|Infinity/.test(p))
  ok('no incluye ids internos ni de Meta', !/"id"|act_1|metaCampaignId/.test(p))
  ok('pesa poco (< 30 KB)', p.length < 30_000, `${p.length} caracteres`)

  const wa = { ...campana, tipoConversion: 'venta_manual', moneda: 'BOB', precioVenta: 25, margenVenta: 25 }
  const ventas = metricas.map(m => ({ fecha: m.fecha, cantidad: 4, neto: null, nota: null }))
  const bw = armarEstado(wa, metricas, ventas, [], null, HOY)
  const pw = promptCampana({ ...bw, metricas, ventas, cambios: [], hoy: HOY })
  const dw = jsonDe(pw)
  eq('WhatsApp: ganancia neta = ventas × margen', dw[`ultimos_${DIAS_EN_PROMPT}_dias`][0].ganancia_neta, 100)
  ok('WhatsApp: viaja el análisis de mensajes', dw.analisis.mensajes != null && 'costo_por_conversacion' in dw.analisis.mensajes)
}

section('PROMPT · todas las campañas')
{
  const mk = (id, nombre, moneda) => armarEstado({
    id, metaCampaignId: id, metaAdAccountId: 'act_1', nombre, moneda, tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: 1.5, activo: true, ultimaSync: null, createdAt: '2026-08-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }, [], [], [], null, HOY)
  const p = promptPortafolio([mk('a', 'Ebook', 'BOB'), mk('b', 'Curso', 'USD')], HOY)
  const d = jsonDe(p)
  eq('trae las dos campañas', d.campanas.map(c => c.nombre), ['Ebook', 'Curso'])
  eq('viaja el piso manual', d.campanas[0].analisis.roas.piso, 1.5)
  ok('pide no mezclar monedas', /No compares montos entre monedas/.test(p))
  eq('campaña sin datos: roas null, no NaN', d.campanas[0].analisis.roas.actual_del_ciclo, null)
}

section('FUENTE DE VENTAS · compras = Meta, WhatsApp = a mano')
{
  const { fuenteDeVentas } = await import('./.ads/load.mjs')
  const compras = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'TOEFL', moneda: 'USD', tipoConversion: 'compra_stripe',
    precioVenta: 24, margenVenta: 24, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  // Caso real del 2026-09-28: 4 días, 2 compras según Meta.
  const met = [['2026-09-24', 8.25, 0], ['2026-09-25', 11.1, 2], ['2026-09-26', 9.57, 0], ['2026-09-27', 9.02, 0]]
    .map(([fecha, gasto, resultados]) => ({ fecha, gasto, resultados, alcance: null, impresiones: null, frecuencia: null, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null }))
  const r = armarEstado(compras, met, [], [], null, HOY)
  eq('compras → fuente meta', r.totales.fuenteVentas, 'meta')
  eq('cuenta las 2 compras de Meta', r.totales.conversiones, 2)
  eq('facturación = compras × precio', r.totales.ingreso, 48)
  ok('sin foco rojo falso', !r.estado.banderas.some(b => b.tipo === 'foco_rojo'), JSON.stringify(r.estado.banderas))
  eq('WhatsApp siempre manual', fuenteDeVentas({ ...compras, tipoConversion: 'venta_manual' }), 'manual')
  const wa = calcularEstado(entrada({ precio: 25, margen: 25, tipo: 'venta_manual', metricas: dias(6, AYER, () => ({ gasto: 25, resultadosMeta: 12 })) }))
  ok('WhatsApp en rojo recuerda cargar ventas', /cárgalo en la tabla/.test(wa.mensaje), wa.mensaje)
}

section('VENTAS POR DÍA · correcciones y profit')
{
  const { ventasPorDia, calcularTotales, netoDia } = await import('./.ads/load.mjs')
  const compras = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'TOEFL', moneda: 'USD', tipoConversion: 'compra_stripe',
    precioVenta: 24, margenVenta: 12, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  const met = f => ({ fecha: f, gasto: 20, resultados: 2, alcance: null, impresiones: null, frecuencia: null, cpm: null, clicsEnlace: 50, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: 30, pagosIniciados: 5 })
  const metricas = [met('2026-09-26'), met('2026-09-27')]
  const correccion = [{ fecha: '2026-09-27', cantidad: 5, neto: null, nota: null }]

  const m = ventasPorDia(compras, metricas, correccion)
  eq('día sin corregir: Meta', m.get('2026-09-26'), { fecha: '2026-09-26', ventas: 2, ingreso: 48, origen: 'meta', neto: null })
  eq('día corregido: pisa a Meta, facturación = ventas × precio', m.get('2026-09-27'), { fecha: '2026-09-27', ventas: 5, ingreso: 120, origen: 'editada', neto: null })
  const t = calcularTotales(compras, metricas, correccion)
  eq('totales suman la corrección', [t.conversiones, t.ingreso], [7, 168])
  eq('sin neto cargado: profit = facturación × margen/precio − inversión', t.profit, 168 * 0.5 - 40)
  eq('neto estimado de un día sin carga', netoDia(compras, m.get('2026-09-26')), 24)

  // Neto real cargado a mano: pisa la estimación, las ventas siguen en automático.
  const soloNeto = [{ fecha: '2026-09-26', cantidad: null, neto: 45.3, nota: null }]
  const mn = ventasPorDia(compras, metricas, soloNeto)
  eq('solo neto: ventas siguen de Meta', [mn.get('2026-09-26').ventas, mn.get('2026-09-26').origen], [2, 'meta'])
  eq('solo neto: la facturación sigue siendo la bruta', mn.get('2026-09-26').ingreso, 48)
  eq('solo neto: netoDia usa el real', netoDia(compras, mn.get('2026-09-26')), 45.3)
  const tn = calcularTotales(compras, metricas, soloNeto)
  eq('totales: neto real + estimado del otro día', tn.neto, 45.3 + 24)
  eq('totales: profit = neto − inversión', Math.round(tn.profit * 100) / 100, Math.round((45.3 + 24 - 40) * 100) / 100)
  eq('cuenta los días con neto real', tn.diasConNetoManual, 1)
  eq('un día sin venta no suma neto', netoDia(compras, undefined), 0)
}

section('SYNC AL ABRIR · cuándo hace falta')
{
  const { necesitaSincronizar } = await import('./.ads/sync-al-abrir.mjs')
  const ahora = Date.parse('2026-09-28T15:00:00Z')
  const c = (activo, ultimaSync) => ({ campana: { activo, ultimaSync }, estado: {}, totales: {} })
  ok('una campaña nunca sincronizada → sí', necesitaSincronizar([c(true, null)], ahora))
  ok('sincronizada hace 2 h → no', !necesitaSincronizar([c(true, '2026-09-28T13:00:00Z')], ahora))
  ok('sincronizada hace 7 h → sí', necesitaSincronizar([c(true, '2026-09-28T08:00:00Z')], ahora))
  ok('una pausada vieja no dispara nada', !necesitaSincronizar([c(false, null), c(true, '2026-09-28T14:00:00Z')], ahora))
  ok('sin campañas → no', !necesitaSincronizar([], ahora))
}

section('HOY EN CURSO · cuenta en los totales, no en el semáforo')
{
  const { armarEstado } = await import('./.ads/load.mjs')
  const wa = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'Ebook', moneda: 'BOB', tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  const met = (fecha, gasto) => ({ fecha, gasto, resultados: 10, alcance: null, impresiones: null, frecuencia: 2, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null })
  const metricas = [...Array(14)].map((_, i) => met(sumarDias(AYER, -i), 54.36))
  const ventas = metricas.map(m => ({ fecha: m.fecha, cantidad: 4, neto: null, nota: null }))
  // Hoy a media tarde: mucho gasto y todavía ninguna venta cargada.
  const conHoy = [...metricas, met(HOY, 400)]
  const r = armarEstado(wa, conHoy, ventas, [], null, HOY)
  eq('el semáforo sigue verde', r.estado.color, 'verde')
  ok('sin foco rojo por el día a medias', !r.estado.banderas.some(b => b.tipo === 'foco_rojo'))
  eq('los totales sí suman el gasto de hoy', Math.round(r.totales.gasto * 100) / 100, Math.round((14 * 54.36 + 400) * 100) / 100)

  const soloHoy = armarEstado(wa, [met(HOY, 30)], [], [], null, HOY)
  eq('campaña que arrancó hoy: sin datos', soloHoy.estado.accion, 'sin_datos')
  ok('y lo explica', /todavía está en curso/.test(soloHoy.estado.mensaje), soloHoy.estado.mensaje)
}

section('CICLOS · semáforo por resultado, total y por ciclo')
{
  const { armarCiclos } = await import('./.ads/load.mjs')
  const { promptCampana } = await import('./.ads/prompt.mjs')
  const wa = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'Ebook', moneda: 'BOB', tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01', cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  const met = fecha => ({ fecha, gasto: 50, resultados: 10, alcance: null, impresiones: null, frecuencia: 2, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null })
  const metricas = [...Array(20)].map((_, i) => met(sumarDias(HOY, -20 + i)))
  const corte = sumarDias(HOY, -10)
  // 10 días malos (1 venta/día, ROAS 0,5) y, desde el cambio, 10 buenos (3/día, ROAS 1,5).
  const ventas = metricas.map(m => ({ fecha: m.fecha, cantidad: m.fecha < corte ? 1 : 3, neto: null, nota: null }))
  const cambio = (fecha, extra = {}) => ({ id: fecha, fecha: `${fecha}T15:00:00Z`, tipo: 'presupuesto', detalle: null, presupuesto: 50, ...extra })

  const { total, ciclos } = armarCiclos(wa, metricas, ventas, [], [cambio(corte)], HOY)
  eq('dos ciclos', ciclos.length, 2)
  eq('ciclo 1: del primer gasto al cambio', [ciclos[0].inicio, ciclos[0].fin, ciclos[0].dias], [sumarDias(HOY, -20), corte, 10])
  eq('ciclo 1: rojo con su profit', [ciclos[0].conversiones, ciclos[0].color, ciclos[0].profit], [10, 'rojo', -250])
  eq('ciclo 2: en curso, verde', [ciclos[1].inicio, ciclos[1].fin, ciclos[1].conversiones, ciclos[1].color, ciclos[1].profit], [corte, null, 30, 'verde', 250])
  eq('el ciclo en curso es el semáforo de arriba', ciclos[1].estado.ciclo.inicio, corte)
  eq('el ciclo cerrado se juzga al día del cambio', ciclos[0].estado.ciclo.dias, 10)
  eq('total: toda la campaña en empate → amarillo', [total.gasto, total.conversiones, total.roas, total.color, total.profit], [1000, 40, 1, 'amarillo', 0])

  const doble = armarCiclos(wa, metricas, ventas, [], [cambio(corte), cambio(corte, { id: 'b', fecha: `${corte}T20:00:00Z`, tipo: 'creativo', presupuesto: null })], HOY)
  eq('dos cambios el mismo día abren un solo ciclo (vale el último)', [doble.ciclos.length, doble.ciclos[1].cambio?.tipo], [2, 'creativo'])
  const previo = armarCiclos(wa, metricas, ventas, [], [cambio(sumarDias(HOY, -30))], HOY)
  eq('un cambio antes del primer gasto no abre otro ciclo', previo.ciclos.length, 1)
  const solo = armarCiclos(wa, metricas, ventas, [], [], HOY)
  eq('sin cambios: un ciclo, igual al total', [solo.ciclos.length, solo.ciclos[0].roas, solo.ciclos[0].color], [1, total.roas, total.color])
  const hoyCambio = armarCiclos(wa, metricas, ventas, [], [cambio(HOY)], HOY)
  eq('un cambio hoy: el ciclo anterior cierra hoy y el nuevo arranca sin datos', [hoyCambio.ciclos.length, hoyCambio.ciclos[0].fin, hoyCambio.ciclos[1].color], [2, HOY, null])
  const vacia = armarCiclos(wa, [], [], [], [cambio(HOY)], HOY)
  eq('sin gasto: ningún ciclo', [vacia.ciclos.length, vacia.total.color], [0, null])

  const p = promptCampana({ campana: wa, estado: ciclos[1].estado, totales: {}, metricas, ventas, cambios: [], hoy: HOY, ciclos })
  ok('el prompt lleva el resultado por ciclo', /"resultado_por_ciclo"/.test(p) && /bajo el empate/.test(p) && /sobre el piso/.test(p))
}

section('CIERRE DE CICLO · planificarCiclos, veredicto y semáforo')
{
  const { planificarCiclos, semaforoCiclo, proximaRevision, duracionAlAbrir, alertasEnVivo } = await import('./.ads/ciclos.mjs')
  const { armarEstado } = await import('./.ads/load.mjs')
  const wa = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'Ebook', moneda: 'BOB', tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01',
    cpaEsperado: 25, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  const met = (fecha, gasto = 50) => ({ fecha, gasto, resultados: 10, alcance: null, impresiones: null, frecuencia: 2, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null })
  const INI = sumarDias(HOY, -10)
  const metricas = [...Array(10)].map((_, i) => met(sumarDias(INI, i)))
  const ventasDe = (f, n) => metricas.map(m => ({ fecha: m.fecha, cantidad: f(m.fecha, n), neto: null, nota: null }))
  const dos = ventasDe(() => 2)
  const cambio = (fecha, extra = {}) => ({ id: `k-${fecha}`, fecha: `${fecha}T15:00:00Z`, tipo: 'presupuesto', detalle: null, presupuesto: null, ...extra })
  const datos = extra => ({ campana: wa, metricas, ventas: dos, llamadas: [], cambios: [], guardados: [], hoy: HOY, ...extra })
  // Lo que quedaría guardado después de aplicar las escrituras del plan.
  const aplicar = (plan, revisado = false) => plan.escribir.map((o, i) => ({
    id: `g${i}`, inicio: o.inicio, fin: o.fin, diasCiclo: o.diasCiclo, duracionBase: o.duracionBase, estado: o.estado, snapshot: o.snapshot,
    cerradoEn: o.estado === 'abierto' ? null : '2026-10-01T00:00:00Z', revisadoEn: revisado || o.revisar ? '2026-10-02T00:00:00Z' : null,
  }))

  eq('semáforo del ciclo: piso → verde, empate → amarillo, menos → rojo', [semaforoCiclo(19, 14, 19), semaforoCiclo(14, 14, 19), semaforoCiclo(13, 14, 19)], ['verde', 'amarillo', 'rojo'])

  // Presupuesto 50 con costo esperado 25 → corte al día 3, ciclo de 7 días fijo.
  const p1 = planificarCiclos(datos())
  eq('un ciclo, cerrado al día 7, en modo «cierre» (sin revisar)', [p1.ciclos.length, p1.actual.estado, p1.actual.fin, p1.actual.diasCiclo, p1.modo], [1, 'cerrado', sumarDias(INI, 6), 7, 'cierre'])
  const s1 = p1.actual.snapshot
  eq('foto: ventas, gasto, empate y piso del cierre', [s1.ventas, s1.gasto, s1.empate, s1.piso], [14, 350, 14, 19])
  eq('foto: ROAS 1,00 → mantener, amarillo', [s1.roas, s1.veredicto, s1.semaforo], [1, 'mantener', 'amarillo'])
  eq('foto: profit y costo por venta del ciclo', [s1.profit, s1.costoPorVenta], [0, 25])
  ok('foto: todas las etapas hechas, sin marca de hoy', s1.etapas.every(k => k.estado === 'hecha' || k.estado === 'apagada') && s1.paraHoy === null, JSON.stringify(s1.etapas))
  eq('foto: meta = piso del cierre', s1.meta, 19)
  eq('escribe una sola fila', p1.escribir.length, 1)

  const g1 = aplicar(p1)
  const p1b = planificarCiclos(datos({ guardados: g1 }))
  eq('ya guardado: no vuelve a escribir', p1b.escribir.length, 0)
  const reordenado = g1.map(g => ({ ...g, snapshot: Object.fromEntries(Object.entries(g.snapshot).reverse()) }))
  eq('el orden de las claves del JSON (jsonb) no provoca escrituras', planificarCiclos(datos({ guardados: reordenado })).escribir.length, 0)
  const p1c = planificarCiclos(datos({ guardados: aplicar(p1, true) }))
  eq('confirmado: modo «campaña en curso»', p1c.modo, 'en_curso')
  const otroMargen = planificarCiclos(datos({ campana: { ...wa, margenVenta: 10 }, guardados: aplicar(p1, true) }))
  eq('revisado: la foto no cambia aunque cambie el margen', [otroMargen.escribir.length, otroMargen.actual.snapshot.piso], [0, 19])
  const sinRevisar = planificarCiclos(datos({ ventas: ventasDe(f => (f === INI ? 5 : 2)), guardados: g1 }))
  eq('sin revisar: una venta cargada tarde dentro del ciclo actualiza la foto', [sinRevisar.escribir.length, sinRevisar.actual.snapshot.ventas], [1, 17])
  const despues = planificarCiclos(datos({ ventas: ventasDe(f => (f >= sumarDias(INI, 7) ? 9 : 2)), guardados: g1 }))
  eq('ventas después del cierre no tocan la foto', despues.escribir.length, 0)

  // Un cambio con el ciclo abierto lo cierra como interrumpido.
  const corto = { metricas: metricas.slice(0, 5), hoy: sumarDias(INI, 5), ventas: dos.slice(0, 5) }
  const abierto = planificarCiclos(datos(corto))
  eq('día 5: abierto, en modo «ciclo»', [abierto.actual.estado, abierto.modo, abierto.actual.diasCiclo], ['abierto', 'ciclo', 7])
  const conCambio = planificarCiclos(datos({ ...corto, cambios: [cambio(sumarDias(INI, 3))], guardados: aplicar(abierto) }))
  eq('cambio el día 4: el primero queda interrumpido hasta el día 3', [conCambio.ciclos[0].estado, conCambio.ciclos[0].fin, conCambio.ciclos[0].revisadoEn != null], ['interrumpido', sumarDias(INI, 2), true])
  eq('…y el nuevo queda abierto', [conCambio.ciclos.length, conCambio.actual.estado, conCambio.modo], [2, 'abierto', 'ciclo'])
  ok('la foto parcial del interrumpido tiene sus 3 días', conCambio.ciclos[0].snapshot?.diasTranscurridos === 3, JSON.stringify(conCambio.ciclos[0].snapshot))

  // Un cambio estando en «cierre» lo deja revisado.
  const enCierre = planificarCiclos(datos({ cambios: [cambio(sumarDias(INI, 9))], guardados: g1 }))
  eq('cambio en «cierre»: el cerrado queda revisado y abre otro ciclo', [enCierre.ciclos[0].estado, enCierre.ciclos[0].revisadoEn != null, enCierre.modo], ['cerrado', true, 'ciclo'])

  // Cortado: 0 ventas al alcanzar la inversión de corte.
  const cortado = planificarCiclos(datos({ ventas: ventasDe(() => 0) }))
  eq('0 ventas: se corta el día 3 (inversión 150 ≥ 5 × 25)', [cortado.actual.estado, cortado.actual.fin], ['cortado', sumarDias(INI, 2)])
  eq('veredicto «cortado», rojo', [cortado.actual.snapshot.veredicto, cortado.actual.snapshot.semaforo], ['cortado', 'rojo'])
  const tarde = planificarCiclos(datos({ ventas: ventasDe(f => (f === sumarDias(INI, 5) ? 3 : 0)) }))
  eq('una venta posterior no deshace el corte', tarde.actual.estado, 'cortado')

  // Ciclos anteriores sin fila: no se inventa su foto.
  const legacy = planificarCiclos(datos({ cambios: [cambio(sumarDias(INI, 4))] }))
  eq('el anterior sin fila queda «legacy» (solo semáforo)', [legacy.ciclos[0].estado, legacy.ciclos[0].snapshot, legacy.escribir.map(o => o.inicio)], ['legacy', null, [sumarDias(INI, 4)]])
  ok('su semáforo al vuelo sigue disponible', legacy.ciclos[0].resumen && 'color' in legacy.ciclos[0].resumen)

  // Cambio deshecho: su ciclo guardado se borra.
  const fantasma = [{ id: 'x', inicio: sumarDias(INI, 8), fin: null, diasCiclo: 7, duracionBase: 'gasto_real', estado: 'abierto', snapshot: null, cerradoEn: null, revisadoEn: null }]
  eq('un ciclo guardado sin su cambio se borra', planificarCiclos(datos({ guardados: fantasma })).borrar, ['x'])

  // Duración fija con presupuesto bajo (k = 0,5) y con el presupuesto del cambio.
  const lento = { ...wa, cpaEsperado: 24 }
  const sinVentas = { ventas: [] }
  eq('gasto real 12/día con costo 24 → ciclo de 10 días', duracionAlAbrir({ ...datos(sinVentas), campana: lento, metricas: metricas.map(m => ({ ...m, gasto: 12 })) }, INI, null), 10)
  const disparejo = metricas.map((m, i) => ({ ...m, gasto: [6, 12, 18][i] ?? 99 }))
  eq('promedio de los días 1 a 3 (6, 12, 18 → 12): 10 días; lo que viene después no cuenta', duracionAlAbrir({ ...datos(sinVentas), campana: lento, metricas: disparejo }, INI, null), 10)
  eq('el presupuesto cargado en el cambio no cuenta: manda el gasto real', duracionAlAbrir({ ...datos(sinVentas), campana: lento }, INI, cambio(INI, { presupuesto: 12 })), 7)
  // Con presupuesto diario de Meta leído desde el inicio: manda ese presupuesto, desde el primer día.
  const conMeta = { ...lento, presupuestoMeta: 12, presupuestoMetaEn: `${INI}T15:00:00Z` }
  eq('presupuesto de Meta 12 con costo 24 → 10 días, aunque el gasto real sea 50', duracionAlAbrir({ ...datos(sinVentas), campana: conMeta }, INI, null), 10)
  eq('se fija desde el día del inicio, sin esperar al día 3', duracionAlAbrir({ ...datos(sinVentas), campana: conMeta, hoy: INI }, INI, null), 10)
  eq('un presupuesto leído antes del inicio no se usa (podría ser el de antes del cambio)', duracionAlAbrir({ ...datos(sinVentas), campana: { ...conMeta, presupuestoMetaEn: `${sumarDias(INI, -1)}T15:00:00Z` } }, INI, null), 7)
  eq('con presupuesto de Meta alto, 7 días', duracionAlAbrir({ ...datos(sinVentas), campana: { ...conMeta, presupuestoMeta: 60 } }, INI, null), 7)
  eq('antes de cerrar el día 3, sin duración fija (se estima)', [duracionAlAbrir({ ...datos(), hoy: sumarDias(INI, 2) }, INI, null), duracionAlAbrir({ ...datos(), hoy: sumarDias(INI, 3) }, INI, null)], [null, 7])
  const hoyGrande = metricas.map(m => (m.fecha === sumarDias(INI, 3) ? { ...m, gasto: 1000 } : { ...m, gasto: 12 }))
  eq('el gasto de hoy no entra (hoy = día 4 con 1000 gastados)', duracionAlAbrir({ ...datos({ ventas: [], hoy: sumarDias(INI, 3) }), campana: lento, metricas: hoyGrande }, INI, null), 10)

  eq('próxima revisión: 7 días después del cierre', proximaRevision('2026-10-01', '2026-10-05'), '2026-10-08')
  eq('si hoy toca, es hoy', proximaRevision('2026-10-01', '2026-10-08'), '2026-10-08')
  eq('después, la siguiente semana', proximaRevision('2026-10-01', '2026-10-09'), '2026-10-15')

  const e0 = armarEstado(wa, metricas, ventasDe(() => 0), [], null, HOY).estado
  ok('alerta en vivo: stop-loss sin ventas', alertasEnVivo({ campana: wa, metricas, ventas: ventasDe(() => 0), llamadas: [], hoy: HOY }, e0).some(a => a.tipo === 'stop_loss'))
  const e2 = armarEstado(wa, metricas, dos, [], null, HOY).estado
  eq('sin riesgos, sin alertas', alertasEnVivo({ campana: wa, metricas, ventas: dos, llamadas: [], hoy: HOY }, e2).map(a => a.tipo), [])
}

section('HOY EN EL PANEL · lo que se muestra incluye hoy, las reglas no')
{
  const { armarEstado, conHoy, resumenConHoy, armarCiclos } = await import('./.ads/load.mjs')
  const wa = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'Ebook', moneda: 'BOB', tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01',
    cpaEsperado: 25, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
  }
  const met = (fecha, gasto) => ({ fecha, gasto, resultados: 10, alcance: null, impresiones: null, frecuencia: 2, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null })
  const metricas = [...[4, 3, 2, 1].map(i => met(sumarDias(HOY, -i), 50)), met(HOY, 30)]
  const ventas = [...[4, 3, 2, 1].map(i => ({ fecha: sumarDias(HOY, -i), cantidad: 2, neto: null, nota: null })), { fecha: HOY, cantidad: 3, neto: null, nota: null }]
  const e = armarEstado(wa, metricas, ventas, [], null, HOY).estado
  const h = conHoy(e, wa, metricas, ventas, [], HOY)
  eq('las reglas siguen sin hoy', [e.ciclo.gasto, e.ciclo.conversiones, e.ciclo.dias], [200, 8, 4])
  eq('lo que se muestra suma hoy', [h.ciclo.gasto, h.ciclo.conversiones, h.ciclo.dias, h.ciclo.fase], [230, 11, 4, e.ciclo.fase])
  ok('ROAS con hoy = 11 × 25 / 230', cerca(h.roasActual, (11 * 25) / 230))
  eq('empate y piso con la inversión de hoy', [h.necesarias.empate, h.necesarias.piso], [10, 13])
  eq('el mensaje (veredicto) no cambia', h.mensaje, e.mensaje)
  const sinVentas = ventas.map(v => (v.fecha === HOY ? v : { ...v, cantidad: 0 }))
  const e0 = armarEstado(wa, metricas, sinVentas, [], null, HOY).estado
  eq('la primera venta de hoy cuenta para "Primera venta"', conHoy(e0, wa, metricas, sinVentas, [], HOY).ciclo.primeraConversion, HOY)
  eq('sin nada hoy, el mismo estado', conHoy(e, wa, metricas.slice(0, 4), ventas.slice(0, 4), [], HOY), e)
  const { total } = armarCiclos(wa, metricas, ventas, [], [], HOY)
  const t = resumenConHoy(total, wa, metricas, ventas, [], HOY)
  eq('toda la campaña con hoy: inversión, ventas y profit', [t.gasto, t.conversiones, t.profit], [230, 11, 11 * 25 - 230])
}

section('PRESUPUESTO DE META · referencia y respaldo')
{
  const { presupuestoDiarioDeMeta } = await import('./.ads/meta-api.mjs')
  eq('presupuesto de campaña (CBO), en centavos', presupuestoDiarioDeMeta({ daily_budget: '6000' }, []), 60)
  eq('sin CBO: suma de conjuntos activos', presupuestoDiarioDeMeta({}, [{ daily_budget: '2500', effective_status: 'ACTIVE' }, { daily_budget: '1500', effective_status: 'ACTIVE' }, { daily_budget: '9900', effective_status: 'PAUSED' }]), 40)
  eq('presupuesto total (lifetime) → null', presupuestoDiarioDeMeta({ lifetime_budget: '100000' }, [{ lifetime_budget: '5000' }]), null)
  // Respaldo: sin ningún día con gasto, el gasto diario estimado es el presupuesto de Meta.
  const solo = estado({ metricas: [], cpa: 24 })
  const conMeta = calcularEstado({ ...entrada({ metricas: [], cpa: 24 }), presupuestoMeta: 60 })
  eq('sin gasto todavía: usa el presupuesto de Meta como estimado', [solo.riesgo.gastoDia, conMeta.riesgo.gastoDia], [0, 60])
  const real = calcularEstado({ ...entrada({ metricas: ciclo(4, 24), cpa: 24 }), presupuestoMeta: 60 })
  eq('con gasto real, manda el gasto real', real.riesgo.gastoDia, 24)
  eq('duración estimada hasta fijarla', [real.ciclo.duracionFija, calcularEstado({ ...entrada({ metricas: ciclo(4, 24) }), diasCiclo: 7 }).ciclo.duracionFija], [false, true])
}

section('DURACIÓN · ciclos abiertos con una regla anterior (caso TOEFL MBA)')
{
  const { planificarCiclos } = await import('./.ads/ciclos.mjs')
  // Compras, margen 23,60, sin ventas ni costo cargado: el costo esperado es el margen.
  const mba = {
    id: 'm', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'TOEFL MBA', moneda: 'USD', tipoConversion: 'compra_stripe',
    precioVenta: 25, margenVenta: 23.6, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-10-06',
    cpaEsperado: null, modoCorte: 'conservador', showEstimado: null, closeEstimado: null, capacidadChatsDia: null,
    presupuestoMeta: 20, presupuestoMetaEn: `${HOY}T15:14:00Z`,
  }
  const INI = sumarDias(HOY, -2)
  const met = (fecha, gasto) => ({ fecha, gasto, resultados: 0, alcance: null, impresiones: null, frecuencia: null, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: 5, pagosIniciados: 0 })
  const metricas = [met(INI, 8.09), met(sumarDias(INI, 1), 19.17), met(HOY, 14.96)]
  const fila = extra => ({ id: 'k', inicio: INI, fin: null, diasCiclo: 15, duracionBase: null, estado: 'abierto', snapshot: null, cerradoEn: null, revisadoEn: null, ...extra })
  const plan = g => planificarCiclos({ campana: mba, metricas, ventas: [], llamadas: [], cambios: [], guardados: [g], hoy: HOY })

  const p = plan(fila())
  eq('15 días guardados con la regla vieja → se recalcula una vez: 7 días con el presupuesto de Meta', [p.actual.diasCiclo, p.escribir[0]?.diasCiclo, p.escribir[0]?.duracionBase], [7, 7, 'presupuesto_meta'])
  eq('con base guardada, no se vuelve a tocar', plan(fila({ diasCiclo: 9, duracionBase: 'presupuesto_meta' })).actual.diasCiclo, 9)
  eq('un ciclo ya cerrado conserva la suya', plan(fila({ estado: 'cerrado', fin: sumarDias(INI, 1), snapshot: { version: 1 } })).actual.diasCiclo, 15)
}

process.exit(summary() === 0 ? 0 : 1)
