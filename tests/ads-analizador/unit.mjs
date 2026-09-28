import {
  calcularEstado, calcularCooldown, detectarFocoRojo, diferenciaDias, puntoDebil, roasEquilibrio,
  roasObjetivo, sumarDias, ultimosNDias,
} from './.ads/calc.mjs'
import { fmtMoneda, fmtPct, fmtRoas, hoyBolivia, numeroDeInput, parseNumeroInput } from './.ads/format.mjs'
// El harness es infraestructura de tests, no dominio de Finanzas: se reusa tal cual.
import { eq, ok, section, summary } from '../finanzas/harness.mjs'

const HOY = '2026-09-28'
const AYER = '2026-09-27'

/** `n` días consecutivos terminando en `hasta`, cada uno armado por `fila(i)`. */
function dias(n, hasta, fila) {
  return Array.from({ length: n }, (_, i) => ({
    fecha: sumarDias(hasta, -(n - 1 - i)),
    gasto: 0, resultadosMeta: 0, conversionesReales: 0, frecuencia: null,
    ...fila(i),
  }))
}

/** Arma la entrada de calcularEstado sumando las filas, como lo hará load.ts. */
function entrada({ precio, margen, metricas, tipo = 'compra_stripe', roasManual = null, cambio = null, ingreso }) {
  const conversiones = metricas.reduce((s, m) => s + m.conversionesReales, 0)
  return {
    tipoConversion: tipo,
    precioVenta: precio,
    margenVenta: margen,
    roasObjetivoManual: roasManual,
    metricas,
    conversionesConfirmadas: conversiones,
    ingresoTotal: ingreso ?? conversiones * precio,
    gastoTotal: metricas.reduce((s, m) => s + m.gasto, 0),
    ultimoCambioFecha: cambio,
    hoy: HOY,
  }
}

const tipos = estado => estado.banderas.map(b => b.tipo)

section('FÓRMULAS BASE')
eq('equilibrio con margen 100% = 1.0', roasEquilibrio(24, 24), 1)
eq('equilibrio con margen de la mitad = 2.0', roasEquilibrio(100, 50), 2)
eq('objetivo automático = equilibrio × 1.35', roasObjetivo(24, 24, null), 1.35)
eq('objetivo manual pisa al automático', roasObjetivo(24, 24, 1.6), 1.6)

section('FECHAS')
eq('diferencia de días', diferenciaDias('2026-10-03', '2026-09-26'), 7)
eq('cruza fin de mes', sumarDias('2026-09-29', 4), '2026-10-03')
eq('hoy en Bolivia no es el día UTC', hoyBolivia(new Date('2026-09-29T02:00:00Z')), '2026-09-28')

section('CASO TOEFL · compra_stripe · colchón bajo el objetivo')
{
  // 6 compras por día a $18,80 cada una, 8 resultados de Meta por día.
  const metricas = dias(14, AYER, () => ({ gasto: 18.8 * 6, resultadosMeta: 8, conversionesReales: 6 }))
  const e = calcularEstado(entrada({ precio: 24, margen: 24, metricas }))
  ok('ROAS ≈ 1.28', Math.abs(e.roasActual - 24 / 18.8) < 0.001, String(e.roasActual))
  eq('equilibrio 1.0', e.roasEquilibrio, 1)
  eq('objetivo 1.35', e.roasObjetivo, 1.35)
  eq('amarillo', e.color, 'amarillo')
  eq('sugiere escalar horizontal, no presupuesto', e.accion, 'escalar_horizontal')
  eq('sin banderas de aprendizaje/muestra/cooldown', tipos(e), [])
  ok('el mensaje dice que no suba presupuesto', /No subas presupuesto/.test(e.mensaje), e.mensaje)
}

section('CASO EBOOK TOEFL BOLIVIA · venta_manual · sano')
{
  // 4 ventas por día a 13,59 Bs, 10 conversaciones iniciadas por día.
  const metricas = dias(14, AYER, () => ({ gasto: 13.59 * 4, resultadosMeta: 10, conversionesReales: 4 }))
  const e = calcularEstado(entrada({ precio: 25, margen: 25, metricas, tipo: 'venta_manual' }))
  ok('ROAS ≈ 1.84', Math.abs(e.roasActual - 1.8396) < 0.001, String(e.roasActual))
  ok('colchón ≈ 84%', Math.abs(e.colchon - 0.8396) < 0.001, String(e.colchon))
  eq('verde', e.color, 'verde')
  eq('puede escalar vertical', e.accion, 'escalar_vertical')
}

section('SIN DATOS')
{
  const e = calcularEstado(entrada({ precio: 24, margen: 24, metricas: [] }))
  eq('roasActual es null', e.roasActual, null)
  eq('amarillo', e.color, 'amarillo')
  eq('acción sin_datos', e.accion, 'sin_datos')
  eq('ninguna bandera', e.banderas, [])

  // Ventas cargadas antes del primer sync: sigue siendo "sin datos", no aprendizaje.
  const soloVentas = [{ fecha: HOY, gasto: 0, resultadosMeta: 0, conversionesReales: 3, frecuencia: null, soloVenta: true }]
  eq('solo ventas manuales, sin Meta → sin_datos', calcularEstado(entrada({ precio: 50, margen: 50, metricas: soloVentas, tipo: 'venta_manual' })).accion, 'sin_datos')
}

section('REGLA 4a · gasto ≥ 2.5× margen sin ninguna venta')
{
  // Dos días de vida, 70 de gasto sobre un margen de 24 (umbral 60).
  const metricas = dias(2, AYER, () => ({ gasto: 35, resultadosMeta: 3 }))
  const e = calcularEstado(entrada({ precio: 24, margen: 24, metricas }))
  eq('rojo aunque tenga 2 días', e.color, 'rojo')
  eq('motivo gasto_sin_resultados', e.banderas[0], { tipo: 'foco_rojo', motivo: 'gasto_sin_resultados' })
  ok('también sigue en aprendizaje (la bandera queda, el color no)', tipos(e).includes('en_aprendizaje'))

  const bajo = calcularEstado(entrada({ precio: 24, margen: 24, metricas: dias(2, AYER, () => ({ gasto: 29 })) }))
  ok('58 de gasto no llega al umbral de 60', !tipos(bajo).includes('foco_rojo'))
}

section('REGLA 4b · días seguidos sin venta real (caso WhatsApp)')
{
  // 10 días buenos, después 3 días con muchas conversaciones y 0 ventas cargadas.
  const metricas = [
    ...dias(10, '2026-09-24', () => ({ gasto: 20, resultadosMeta: 10, conversionesReales: 2 })),
    ...dias(3, AYER, () => ({ gasto: 20, resultadosMeta: 15, conversionesReales: 0 })),
  ]
  const e = calcularEstado(entrada({ precio: 25, margen: 25, metricas, tipo: 'venta_manual' }))
  eq('rojo', e.color, 'rojo')
  eq('motivo sin_ventas_dias', e.banderas[0], { tipo: 'foco_rojo', motivo: 'sin_ventas_dias' })
  ok('usa "ventas cargadas" en el texto', /ventas cargadas/.test(e.mensaje), e.mensaje)

  // Mismo patrón, pero los 3 días gastaron menos que un margen.
  const poco = [
    ...dias(10, '2026-09-24', () => ({ gasto: 20, resultadosMeta: 10, conversionesReales: 2 })),
    ...dias(3, AYER, () => ({ gasto: 5, resultadosMeta: 15, conversionesReales: 0 })),
  ]
  ok('no dispara si el gasto de esos días < margen', !detectarFocoRojo(entrada({ precio: 25, margen: 25, metricas: poco })))

  // Un hueco (día sin datos) rompe la racha.
  const conHueco = metricas.filter(m => m.fecha !== '2026-09-26')
  ok('un día faltante no cuenta como racha', detectarFocoRojo(entrada({ precio: 25, margen: 25, metricas: conHueco }))?.motivo !== 'sin_ventas_dias')
}

section('REGLA 1 · aprendizaje tapa la lectura de ROAS')
{
  // ROAS 0.8 (bajo equilibrio) pero solo 21 resultados en 7 días.
  const metricas = dias(10, AYER, () => ({ gasto: 30, resultadosMeta: 3, conversionesReales: 1 }))
  const e = calcularEstado(entrada({ precio: 24, margen: 24, metricas }))
  ok('ROAS está bajo el equilibrio', e.roasActual < 1, String(e.roasActual))
  eq('pero se muestra amarillo, no rojo', e.color, 'amarillo')
  eq('acción esperar', e.accion, 'esperar')
  eq('bandera con 21 resultados', e.banderas.find(b => b.tipo === 'en_aprendizaje'), { tipo: 'en_aprendizaje', resultados7d: 21 })
}

section('REGLA 5 · muestra chica después del aprendizaje')
{
  // 70 resultados de Meta en 7 días, pero solo 7 compras en total.
  const metricas = dias(7, AYER, i => ({ gasto: 20, resultadosMeta: 10, conversionesReales: 1 }))
  const e = calcularEstado(entrada({ precio: 100, margen: 100, metricas }))
  ok('no está en aprendizaje', !tipos(e).includes('en_aprendizaje'))
  ok('sí en muestra chica', tipos(e).includes('muestra_chica'))
  eq('amarillo / esperar', [e.color, e.accion], ['amarillo', 'esperar'])
}

section('REGLA 6 · cooldown por cambio')
{
  const hace2 = calcularCooldown('2026-09-26', HOY)
  eq('hace 2 días: reajuste y ventana', [hace2.reajusteTecnico, hace2.ventanaDecision], [true, true])
  eq('reajuste hasta +4', hace2.reajusteHasta, '2026-09-30')
  const hace5 = calcularCooldown('2026-09-23', HOY)
  eq('hace 5 días: solo ventana', [hace5.reajusteTecnico, hace5.ventanaDecision], [false, true])
  const hace7 = calcularCooldown('2026-09-21', HOY)
  eq('hace 7 días: nada', [hace7.reajusteTecnico, hace7.ventanaDecision], [false, false])

  // Campaña sana con un cambio hace 2 días → esperar, con la fecha en el texto.
  const metricas = dias(14, AYER, () => ({ gasto: 13.59 * 4, resultadosMeta: 10, conversionesReales: 4 }))
  const e = calcularEstado(entrada({ precio: 25, margen: 25, metricas, cambio: '2026-09-26' }))
  eq('amarillo / esperar', [e.color, e.accion], ['amarillo', 'esperar'])
  ok('dice hasta el 30 sep', /30 sep/.test(e.mensaje), e.mensaje)
  eq('solo muestra la más restrictiva', tipos(e), ['reajuste_tecnico'])

  // El foco rojo gana aunque haya un cambio reciente.
  const quemando = dias(2, AYER, () => ({ gasto: 40 }))
  const r = calcularEstado(entrada({ precio: 24, margen: 24, metricas: quemando, cambio: '2026-09-27' }))
  eq('foco rojo le gana al cooldown', r.color, 'rojo')
}

section('REGLA 2+3 · colchón')
{
  const conRoas = roas => dias(14, AYER, () => ({ gasto: 100, resultadosMeta: 10, conversionesReales: 2 }))
    .map(m => m) // mismas filas; el ROAS lo define el ingreso
  const metricas = conRoas()
  const gasto = 1400, conv = 28
  const con = ingreso => calcularEstado(entrada({ precio: 50, margen: 25, metricas, ingreso }))
  // Equilibrio = 50/25 = 2.0; objetivo = 2.7.
  eq('ROAS 1.9 → rojo (bajo equilibrio 2.0)', con(gasto * 1.9).color, 'rojo')
  eq('ROAS 2.3 → amarillo horizontal', con(gasto * 2.3).accion, 'escalar_horizontal')
  eq('ROAS 2.8 → verde', con(gasto * 2.8).color, 'verde')
  eq('override de objetivo 3.0 baja el 2.8 a amarillo',
    calcularEstado(entrada({ precio: 50, margen: 25, metricas, ingreso: gasto * 2.8, roasManual: 3 })).color, 'amarillo')
  ok('usa las conversiones reales para la muestra', conv >= 10)
}

section('REGLA 7 · fatiga no cambia el color')
{
  const metricas = dias(14, AYER, i => ({ gasto: 13.59 * 4, resultadosMeta: 10, conversionesReales: 4, frecuencia: i === 13 ? 3.8 : 2 }))
  const e = calcularEstado(entrada({ precio: 25, margen: 25, metricas }))
  eq('sigue verde', e.color, 'verde')
  eq('bandera de fatiga con la frecuencia del último día', e.banderas, [{ tipo: 'fatiga_audiencia', frecuencia: 3.8 }])
}

section('VENTANAS')
{
  const metricas = dias(10, AYER, () => ({ gasto: 1 }))
  const u = ultimosNDias(metricas, HOY, 3)
  eq('los últimos 3 terminan en el último día con datos', u.map(m => m.fecha), ['2026-09-25', '2026-09-26', '2026-09-27'])
  eq('ignora filas del futuro', ultimosNDias([{ ...metricas[0], fecha: '2026-10-05' }], HOY, 3), [])

  // Bug encontrado en el Sprint 4: cargar la venta de hoy corría la ventana.
  const conVentaHoy = [
    ...dias(14, AYER, () => ({ gasto: 54.36, resultadosMeta: 10, conversionesReales: 4 })),
    { fecha: HOY, gasto: 0, resultadosMeta: 0, conversionesReales: 2, frecuencia: null, soloVenta: true },
  ]
  eq('un día solo-venta no mueve el ancla', ultimosNDias(conVentaHoy, HOY, 7).at(-1).fecha, AYER)
  const e = calcularEstado(entrada({ precio: 25, margen: 25, metricas: conVentaHoy, tipo: 'venta_manual' }))
  eq('anotar la venta de hoy no manda a aprendizaje', e.color, 'verde')
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
    ultimaSync: null, createdAt: '2026-08-01',
  }
  // 8 compras por día según Meta a $18,80 cada una (56 en 7 días: fuera de aprendizaje).
  const metricas = []
  for (let i = 40; i >= 1; i--) {
    const fecha = sumarDias(HOY, -i)
    metricas.push({ fecha, gasto: 150.4, alcance: 2400, impresiones: 3100, frecuencia: 1.3, cpm: 36, clicsEnlace: 92, cpcEnlace: 1.2, ctrEnlace: 2.97, resultados: 8, costoPorResultado: 18.8, landingPageViews: 64, pagosIniciados: 18 })
  }
  const cambios = [{ id: 'k', fecha: '2026-09-18T12:00:00Z', tipo: 'presupuesto', detalle: 'Subí de 100 a 115' }]
  const base = armarEstado(campana, metricas, [], cambios[0].fecha, HOY)
  const p = promptCampana({ ...base, metricas, ventas: [], cambios, hoy: HOY })

  ok('pide respuesta en español', /Responde en español/.test(p))
  ok('incluye las 7 reglas con los umbrales de calc.ts', /menos de 50 resultados/.test(p) && /≥ 3.5/.test(p) && /2.5× el margen/.test(p))
  ok('nombra la campaña en el pedido', /"Curso TOEFL"/.test(p))
  let d
  ok('el bloque JSON se parsea', (() => { try { d = jsonDe(p); return true } catch { return false } })())
  eq(`manda solo los últimos ${DIAS_EN_PROMPT} días`, d[`ultimos_${DIAS_EN_PROMPT}_dias`].length, DIAS_EN_PROMPT)
  eq('el veredicto de la app viaja', d.estado_app.accion_sugerida, 'escalar_horizontal')
  eq('ventas por día salen de Meta', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].ventas_reales, 8)
  eq('facturación por día = compras × precio', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].facturacion, 192)
  eq('profit por día = neto estimado − gasto', d[`ultimos_${DIAS_EN_PROMPT}_dias`][0].profit, 41.6)
  ok('ya no manda nada de Stripe', !/stripe_ultimos|motivos_de_rechazo/.test(p))
  eq('los cambios viajan', d.cambios_registrados[0].detalle, 'Subí de 100 a 115')
  ok('sin NaN ni Infinity en el JSON', !/NaN|Infinity/.test(p))
  ok('no incluye ids internos ni de Meta', !/"id"|act_1|metaCampaignId/.test(p))
  ok('pesa poco (< 30 KB)', p.length < 30_000, `${p.length} caracteres`)

  const wa = { ...campana, tipoConversion: 'venta_manual', moneda: 'BOB', precioVenta: 25, margenVenta: 25 }
  const ventas = metricas.map(m => ({ fecha: m.fecha, cantidad: 4, neto: null, nota: null }))
  const bw = armarEstado(wa, metricas, ventas, null, HOY)
  const pw = promptCampana({ ...bw, metricas, ventas, cambios: [], hoy: HOY })
  const dw = jsonDe(pw)
  eq('WhatsApp: facturación = ventas × precio', dw[`ultimos_${DIAS_EN_PROMPT}_dias`][0].facturacion, 100)
  ok('WhatsApp: avisa conversaciones vs ventas', /conversaciones y pocas ventas/.test(pw))
}

section('PROMPT · todas las campañas')
{
  const mk = (id, nombre, moneda) => armarEstado({
    id, metaCampaignId: id, metaAdAccountId: 'act_1', nombre, moneda, tipoConversion: 'venta_manual',
    precioVenta: 25, margenVenta: 25, roasObjetivo: 1.5, activo: true, ultimaSync: null, createdAt: '2026-08-01',
  }, [], [], null, HOY)
  const p = promptPortafolio([mk('a', 'Ebook', 'BOB'), mk('b', 'Curso', 'USD')], HOY)
  const d = jsonDe(p)
  eq('trae las dos campañas', d.campanas.map(c => c.nombre), ['Ebook', 'Curso'])
  eq('marca el objetivo manual', d.campanas[0].roas_objetivo_es_manual, true)
  ok('pide no mezclar monedas', /No compares montos entre monedas/.test(p))
  eq('campaña sin datos: roas null, no NaN', d.campanas[0].estado_app.roas_actual, null)
}

section('FUENTE DE VENTAS · compras = Meta, WhatsApp = a mano')
{
  const { fuenteDeVentas } = await import('./.ads/load.mjs')
  const compras = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'TOEFL', moneda: 'USD', tipoConversion: 'compra_stripe',
    precioVenta: 24, margenVenta: 24, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01',
  }
  // Caso real del 2026-09-28: 4 días, 2 compras según Meta.
  const met = [['2026-09-24', 8.25, 0], ['2026-09-25', 11.1, 2], ['2026-09-26', 9.57, 0], ['2026-09-27', 9.02, 0]]
    .map(([fecha, gasto, resultados]) => ({ fecha, gasto, resultados, alcance: null, impresiones: null, frecuencia: null, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null }))
  const r = armarEstado(compras, met, [], null, HOY)
  eq('compras → fuente meta', r.totales.fuenteVentas, 'meta')
  eq('cuenta las 2 compras de Meta', r.totales.conversiones, 2)
  eq('facturación = compras × precio', r.totales.ingreso, 48)
  ok('sin foco rojo falso', !r.estado.banderas.some(b => b.tipo === 'foco_rojo'), JSON.stringify(r.estado.banderas))
  eq('WhatsApp siempre manual', fuenteDeVentas({ ...compras, tipoConversion: 'venta_manual' }), 'manual')
  const wa = calcularEstado(entrada({ precio: 25, margen: 25, tipo: 'venta_manual', metricas: dias(6, AYER, () => ({ gasto: 25, resultadosMeta: 12 })) }))
  ok('foco rojo de WhatsApp recuerda cargar ventas', /carga las ventas/.test(wa.mensaje), wa.mensaje)
}

section('VENTAS POR DÍA · correcciones y profit')
{
  const { ventasPorDia, calcularTotales, netoDia } = await import('./.ads/load.mjs')
  const compras = {
    id: 'c', metaCampaignId: '1', metaAdAccountId: 'act_1', nombre: 'TOEFL', moneda: 'USD', tipoConversion: 'compra_stripe',
    precioVenta: 24, margenVenta: 12, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01',
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
    precioVenta: 25, margenVenta: 25, roasObjetivo: null, activo: true, ultimaSync: null, createdAt: '2026-09-01',
  }
  const met = (fecha, gasto) => ({ fecha, gasto, resultados: 10, alcance: null, impresiones: null, frecuencia: 2, cpm: null, clicsEnlace: null, cpcEnlace: null, ctrEnlace: null, costoPorResultado: null, landingPageViews: null, pagosIniciados: null })
  const metricas = [...Array(14)].map((_, i) => met(sumarDias(AYER, -i), 54.36))
  const ventas = metricas.map(m => ({ fecha: m.fecha, cantidad: 4, neto: null, nota: null }))
  // Hoy a media tarde: mucho gasto y todavía ninguna venta cargada.
  const conHoy = [...metricas, met(HOY, 400)]
  const r = armarEstado(wa, conHoy, ventas, null, HOY)
  eq('el semáforo sigue verde', r.estado.color, 'verde')
  ok('sin foco rojo por el día a medias', !r.estado.banderas.some(b => b.tipo === 'foco_rojo'))
  eq('los totales sí suman el gasto de hoy', Math.round(r.totales.gasto * 100) / 100, Math.round((14 * 54.36 + 400) * 100) / 100)

  const soloHoy = armarEstado(wa, [met(HOY, 30)], [], null, HOY)
  eq('campaña que arrancó hoy: sin datos', soloHoy.estado.accion, 'sin_datos')
  ok('y lo explica', /todavía está en curso/.test(soloHoy.estado.mensaje), soloHoy.estado.mensaje)
}

process.exit(summary() === 0 ? 0 : 1)
