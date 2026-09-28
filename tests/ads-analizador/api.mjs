import { URL_, SRV, ANON } from '../finanzas/env.mjs'
// El harness es infraestructura de tests, no dominio de Finanzas: se reusa tal cual.
import { eq, ok, section, summary, sweepTestUsers } from '../finanzas/harness.mjs'

const BASE = process.env.ADS_BASE_URL ?? 'http://localhost:3000'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

const admin = (p, i = {}) => fetch(`${URL_}${p}`, {
  ...i, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...i.headers },
})

/** Un usuario temporal con acceso a ads-analizador, su cookie y su token. */
async function crearUsuario(etiqueta) {
  const email = `ads-api-${etiqueta}-${Date.now()}@acerotest.local`
  const password = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
  const u = await admin('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }),
  }).then(r => r.json())
  if (!u.id) throw new Error('sin usuario: ' + JSON.stringify(u))

  const proyecto = await admin('/rest/v1/projects?slug=eq.ads-analizador&select=id').then(r => r.json())
  if (!proyecto[0]) throw new Error('falta la fila de "ads-analizador" en projects')
  await admin('/rest/v1/project_access', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, project_id: proyecto[0].id, granted_by: u.id }),
  })

  const sesion = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(r => r.json())
  if (!sesion.access_token) throw new Error('sin sesión: ' + JSON.stringify(sesion))

  return {
    id: u.id,
    token: sesion.access_token,
    cookie: `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sesion)).toString('base64url')}`,
  }
}

async function borrarUsuario(u) {
  if (!u) return
  await admin(`/rest/v1/project_access?user_id=eq.${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
}

let A = null, B = null

const api = (u, p, i = {}) => fetch(`${BASE}${p}`, {
  ...i, headers: { ...(u ? { cookie: u.cookie } : {}), 'Content-Type': 'application/json', ...i.headers },
})
const post = (u, p, body) => api(u, p, { method: 'POST', body: JSON.stringify(body) })
const patch = (u, p, body) => api(u, p, { method: 'PATCH', body: JSON.stringify(body) })

/** PostgREST con el token DEL USUARIO: pasa por RLS, igual que la app. */
const rest = (u, p, i = {}) => fetch(`${URL_}/rest/v1${p}`, {
  ...i, headers: { apikey: ANON, Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...i.headers },
})

/** YYYY-MM-DD de hace `n` días en Bolivia. */
const hace = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' })
  .format(new Date(Date.now() - n * 86_400_000))

const CAMPANA = {
  metaCampaignId: '120211000000000001', metaAdAccountId: '1234567890', nombre: 'TOEFL test',
  moneda: 'USD', tipoConversion: 'compra_stripe', precioVenta: 24, margenVenta: 24,
}

try {
  await sweepTestUsers(URL_, SRV)
  A = await crearUsuario('a')
  B = await crearUsuario('b')

  section('SIN SESIÓN · todas las rutas responden 401')
  for (const [m, p] of [
    ['GET', '/api/ads-analizador/campaigns'],
    ['POST', '/api/ads-analizador/campaigns'],
    ['GET', '/api/ads-analizador/campaigns/00000000-0000-0000-0000-000000000000'],
    ['PATCH', '/api/ads-analizador/campaigns/00000000-0000-0000-0000-000000000000'],
    ['DELETE', '/api/ads-analizador/campaigns/00000000-0000-0000-0000-000000000000'],
  ]) {
    const res = await api(null, p, { method: m, body: m === 'GET' || m === 'DELETE' ? undefined : '{}' })
    eq(`${m} ${p.replace(/0{8}-.*/, ':id')} → 401`, res.status, 401)
  }

  section('ALTA DE CAMPAÑA')
  let res = await api(A, '/api/ads-analizador/campaigns')
  let datos = await res.json()
  eq('arranca sin campañas', datos.campaigns?.length, 0)
  ok('devuelve la fecha de hoy', /^\d{4}-\d{2}-\d{2}$/.test(datos.hoy), String(datos.hoy))

  res = await post(A, '/api/ads-analizador/campaigns', CAMPANA)
  const creada = (await res.json()).campana
  eq('crea → 201', res.status, 201)
  eq('normaliza la cuenta a act_…', creada?.metaAdAccountId, 'act_1234567890')
  eq('roas objetivo nace automático (null)', creada?.roasObjetivo, null)

  res = await post(A, '/api/ads-analizador/campaigns', CAMPANA)
  eq('mismo ID de Meta dos veces → 409', res.status, 409)

  res = await post(B, '/api/ads-analizador/campaigns', CAMPANA)
  eq('otro usuario SÍ puede trackear el mismo ID', res.status, 201)
  const deB = (await res.json()).campana

  for (const [etiqueta, cambios, esperado] of [
    ['precio 0 → 400', { precioVenta: 0 }, 400],
    ['margen negativo → 400', { margenVenta: -1 }, 400],
    ['margen mayor que el precio → 400', { margenVenta: 30 }, 400],
    ['moneda EUR → 400', { moneda: 'EUR' }, 400],
    ['tipo inventado → 400', { tipoConversion: 'otro' }, 400],
    ['ID con letras → 400', { metaCampaignId: 'abc123' }, 400],
    ['nombre vacío → 400', { nombre: '  ' }, 400],
  ]) {
    res = await post(A, '/api/ads-analizador/campaigns', { ...CAMPANA, metaCampaignId: '120211000000000099', ...cambios })
    eq(etiqueta, res.status, esperado)
  }

  res = await post(A, '/api/ads-analizador/campaigns', {
    ...CAMPANA, metaCampaignId: '120211000000000002', nombre: 'Ebook test', moneda: 'BOB',
    tipoConversion: 'venta_manual', precioVenta: '24,50', margenVenta: '24,50',
  })
  const ebook = (await res.json()).campana
  eq('"24,50" como texto se guarda 24.5', ebook?.precioVenta, 24.5)

  section('LISTA · semáforo sin datos')
  datos = await api(A, '/api/ads-analizador/campaigns').then(r => r.json())
  eq('A ve solo sus 2 campañas', datos.campaigns.length, 2)
  const toefl = datos.campaigns.find(c => c.campana.id === creada.id)
  eq('sin datos: amarillo', toefl.estado.color, 'amarillo')
  eq('sin datos: acción sin_datos', toefl.estado.accion, 'sin_datos')
  eq('sin datos: roasActual null', toefl.estado.roasActual, null)
  eq('equilibrio 1.0', toefl.estado.roasEquilibrio, 1)
  eq('objetivo 1.35', toefl.estado.roasObjetivo, 1.35)

  section('AISLAMIENTO ENTRE USUARIOS')
  res = await api(B, `/api/ads-analizador/campaigns/${creada.id}`)
  eq('B no ve el detalle de A → 404', res.status, 404)
  res = await patch(B, `/api/ads-analizador/campaigns/${creada.id}`, { nombre: 'hackeada' })
  eq('B no edita la de A → 404', res.status, 404)
  res = await api(B, `/api/ads-analizador/campaigns/${creada.id}`, { method: 'DELETE' })
  eq('B no borra la de A → 404', res.status, 404)

  // B intenta colgar una métrica suya de la campaña de A (user_id propio, campaign_id ajeno).
  res = await rest(B, '/ads_metricas_diarias', {
    method: 'POST', body: JSON.stringify({ user_id: B.id, campaign_id: creada.id, fecha: hace(1), gasto: 1 }),
  })
  ok('la FK compuesta impide colgarse de una campaña ajena', res.status >= 400, `status ${res.status}`)
  res = await rest(B, '/ads_metricas_diarias', {
    method: 'POST', body: JSON.stringify({ user_id: A.id, campaign_id: creada.id, fecha: hace(1), gasto: 1 }),
  })
  ok('RLS impide escribir con el user_id de otro', res.status >= 400, `status ${res.status}`)

  section('ESTADO CON DATOS · caso TOEFL (colchón bajo el objetivo)')
  // 14 días: 6 compras/día a $18,80 cada una, 8 resultados de Meta por día.
  const metricas = [], pagos = []
  for (let i = 14; i >= 1; i--) {
    metricas.push({ user_id: A.id, campaign_id: creada.id, fecha: hace(i), gasto: 112.8, resultados: 8, impresiones: 3000, clics_enlace: 90, landing_page_views: 60, pagos_iniciados: 15, frecuencia: 1.4 })
    pagos.push({ user_id: A.id, campaign_id: creada.id, fecha: hace(i), compras_exitosas: 6, monto_total: 144, pagos_fallidos: 1, decline_reasons: { do_not_honor: 1 } })
  }
  res = await rest(A, '/ads_metricas_diarias', { method: 'POST', body: JSON.stringify(metricas) })
  eq('A inserta sus métricas por RLS', res.status, 201)
  res = await rest(A, '/ads_pagos_stripe', { method: 'POST', body: JSON.stringify(pagos) })
  eq('A inserta sus pagos por RLS', res.status, 201)

  datos = await api(A, `/api/ads-analizador/campaigns/${creada.id}`).then(r => r.json())
  ok('ROAS ≈ 1.28', Math.abs(datos.estado.roasActual - 24 / 18.8) < 0.001, String(datos.estado.roasActual))
  eq('amarillo / escalar horizontal', [datos.estado.color, datos.estado.accion], ['amarillo', 'escalar_horizontal'])
  eq('trae los 14 días de métricas', datos.metricas.length, 14)
  eq('84 compras', datos.totales.conversiones, 84)

  section('EDITAR')
  res = await patch(A, `/api/ads-analizador/campaigns/${creada.id}`, { roasObjetivo: 1.2 })
  eq('baja el objetivo a 1.2', res.status, 200)
  datos = await api(A, `/api/ads-analizador/campaigns/${creada.id}`).then(r => r.json())
  eq('con objetivo 1.2 ahora es verde', datos.estado.color, 'verde')

  res = await patch(A, `/api/ads-analizador/campaigns/${creada.id}`, { roasObjetivo: null })
  eq('null vuelve al automático', (await res.json()).campana.roasObjetivo, null)

  res = await patch(A, `/api/ads-analizador/campaigns/${creada.id}`, { margenVenta: 50 })
  eq('margen mayor al precio actual → 400', res.status, 400)
  res = await patch(A, `/api/ads-analizador/campaigns/${creada.id}`, {})
  eq('nada que actualizar → 400', res.status, 400)
  res = await patch(A, `/api/ads-analizador/campaigns/${creada.id}`, { activo: false })
  eq('pausar', (await res.json()).campana?.activo, false)
  res = await patch(A, `/api/ads-analizador/campaigns/no-es-uuid`, { activo: true })
  eq('id que no es uuid → 404', res.status, 404)

  section('BORRAR · en cascada')
  res = await api(A, `/api/ads-analizador/campaigns/${creada.id}`, { method: 'DELETE' })
  eq('borra → 200', res.status, 200)
  const quedan = await admin(`/rest/v1/ads_metricas_diarias?campaign_id=eq.${creada.id}&select=id`).then(r => r.json())
  eq('se llevó las métricas', quedan.length, 0)
  const pagosQuedan = await admin(`/rest/v1/ads_pagos_stripe?campaign_id=eq.${creada.id}&select=id`).then(r => r.json())
  eq('se llevó los pagos', pagosQuedan.length, 0)
  res = await api(A, `/api/ads-analizador/campaigns/${creada.id}`, { method: 'DELETE' })
  eq('borrar dos veces → 404', res.status, 404)
  datos = await api(B, '/api/ads-analizador/campaigns').then(r => r.json())
  eq('la de B sigue intacta', datos.campaigns.map(c => c.campana.id), [deB.id])

  // ── SPRINT 3 ──
  section('SYNC · autenticación de la ruta')
  res = await api(null, '/api/ads-analizador/sync', { method: 'POST' })
  eq('sin sesión → 401', res.status, 401)
  res = await api(null, '/api/ads-analizador/sync', { method: 'POST', headers: { authorization: 'Bearer secreto-inventado' } })
  eq('un Bearer cualquiera sin sesión → 401 (no hay camino de cron)', res.status, 401)
  res = await api(A, '/api/ads-analizador/sync')
  eq('ya no hay cron: GET no existe → 405', res.status, 405)

  section('SYNC · un error de Meta no tumba la ruta')
  // Sin token dice qué falta; con token, Meta rechaza el ID inventado de la prueba.
  // En los dos casos: 200 con el error por campaña, nunca un 500.
  res = await post(A, '/api/ads-analizador/sync', {})
  datos = await res.json()
  eq('responde 200 con el detalle por campaña', res.status, 200)
  const r0 = datos.resultados?.find(r => r.campaign_id === ebook.id)
  eq('la campaña reporta el error', r0?.ok, false)
  ok('explica el error', /META_ACCESS_TOKEN|no reconoce/.test(r0?.error ?? ''), r0?.error)

  section('PICKER DE META')
  res = await api(null, '/api/ads-analizador/meta/campaigns-disponibles?ad_account_id=act_123456')
  eq('sin sesión → 401', res.status, 401)
  res = await api(A, '/api/ads-analizador/meta/campaigns-disponibles?ad_account_id=hola')
  eq('cuenta inválida → 400', res.status, 400)
  res = await api(A, '/api/ads-analizador/meta/campaigns-disponibles?ad_account_id=act_123456')
  ok('cuenta inexistente o sin token → 502/503 con mensaje', [502, 503].includes(res.status) && !!(await res.json()).error, `status ${res.status}`)

  section('SYNC · orquestación contra la base real (Meta/Stripe simulados)')
  {
    const { createClient } = await import('@supabase/supabase-js')
    const { sincronizar } = await import('./.ads/sync.mjs')
    const { StripeError } = await import('./.ads/stripe-api.mjs')
    const { diasEntre } = await import('./.ads/sync.mjs')
    const sbA = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${A.token}` } }, auth: { persistSession: false } })
    const HOY = hace(0)

    let gastoPorDia = 10
    const fallarMeta = new Set()
    let stripeSinClave = false
    const deps = {
      traerInsights: async (metaId, desde, hasta) => {
        if (fallarMeta.has(metaId)) throw new Error('Meta no reconoce ese ID de campaña o de cuenta.')
        return diasEntre(desde, hasta).map(fecha => ({
          fecha, gasto: gastoPorDia, alcance: 100, impresiones: 200, frecuencia: 1.2, cpm: 5, clics_enlace: 10,
          cpc_enlace: 1, ctr_enlace: 5, resultados: 2, costo_por_resultado: gastoPorDia / 2,
          landing_page_views: 8, pagos_iniciados: 3, raw_json: {},
        }))
      },
      listarPaymentIntents: async (desde, hasta) => {
        if (stripeSinClave) throw new StripeError('Falta configurar STRIPE_SECRET_KEY_ADS.')
        return diasEntre(desde, hasta).map(f => ({
          currency: 'usd', status: 'succeeded', amount: 2400, amount_received: 2400,
          created: Math.floor(Date.parse(`${f}T12:00:00-04:00`) / 1000),
        }))
      },
    }

    const s1 = (await post(A, '/api/ads-analizador/campaigns', { ...CAMPANA, metaCampaignId: '120211000000000011', nombre: 'Stripe 1' }).then(r => r.json())).campana
    const cargarSync = async () => (await sbA.from('ads_campaigns').select('id, user_id, nombre, meta_campaign_id, tipo_conversion, moneda, activo').eq('activo', true)).data
    const filas = async (tabla, id) => (await admin(`/rest/v1/${tabla}?campaign_id=eq.${id}&select=*&order=fecha`).then(r => r.json()))

    let r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    const rs1 = r.resultados.find(x => x.campaign_id === s1.id)
    eq('primer sync: 30 días', rs1?.dias_sincronizados, 30)
    eq('30 filas de métricas', (await filas('ads_metricas_diarias', s1.id)).length, 30)
    const pagosS1 = await filas('ads_pagos_stripe', s1.id)
    eq('30 filas de pagos', pagosS1.length, 30)
    eq('1 compra de $24 por día', [pagosS1[0].compras_exitosas, Number(pagosS1[0].monto_total)], [1, 24])
    eq('el último día es ayer, no hoy', (await filas('ads_metricas_diarias', s1.id)).at(-1).fecha, hace(1))
    const conSync = (await sbA.from('ads_campaigns').select('ultima_sync').eq('id', s1.id).single()).data
    ok('marca ultima_sync', !!conSync.ultima_sync)

    gastoPorDia = 20
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    const met = await filas('ads_metricas_diarias', s1.id)
    eq('re-sync no duplica filas', met.length, 30)
    eq('re-trae solo los últimos 3 días', met.map(m => Number(m.gasto)), [...Array(27).fill(10), 20, 20, 20])

    section('SYNC · guard de un solo checkout de Stripe')
    const s2 = (await post(A, '/api/ads-analizador/campaigns', { ...CAMPANA, metaCampaignId: '120211000000000012', nombre: 'Stripe 2' }).then(r => r.json())).campana
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    eq('omite Stripe y lo dice', r.omitidas[0]?.motivo, 'mas_de_una_campana_stripe_activa')
    eq('no le reparte pagos a la segunda', (await filas('ads_pagos_stripe', s2.id)).length, 0)
    eq('pero Meta sí se sincroniza para las dos', (await filas('ads_metricas_diarias', s2.id)).length, 30)

    section('SYNC · una campaña que falla no frena a las demás')
    fallarMeta.add(s2.meta_campaign_id ?? '120211000000000012')
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    eq('la que falla reporta el error', r.resultados.find(x => x.campaign_id === s2.id)?.ok, false)
    eq('la otra sigue ok', r.resultados.find(x => x.campaign_id === s1.id)?.ok, true)

    section('SYNC · pausadas y sin clave de Stripe')
    await patch(A, `/api/ads-analizador/campaigns/${s2.id}`, { activo: false })
    fallarMeta.clear()
    stripeSinClave = true
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    ok('la pausada no se procesa', !r.resultados.some(x => x.campaign_id === s2.id))
    eq('sin clave de Stripe: se omite, no falla', r.omitidas.map(o => o.motivo), ['stripe_sin_credenciales'])
    eq('Meta sigue ok', r.resultados.find(x => x.campaign_id === s1.id)?.ok, true)

    section('SYNC · Stripe conectado tarde completa el historial')
    // Stripe nunca sincronizó esta campaña, pero Meta ya tiene 30 días.
    await admin(`/rest/v1/ads_pagos_stripe?campaign_id=eq.${s1.id}`, { method: 'DELETE' })
    stripeSinClave = false
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    eq('trae los 30 días de Stripe, no solo los últimos 3', (await filas('ads_pagos_stripe', s1.id)).length, 30)
    r = await sincronizar(sbA, await cargarSync(), HOY, deps)
    eq('después ya re-sincroniza normal sin duplicar', (await filas('ads_pagos_stripe', s1.id)).length, 30)

    section('SYNC · RLS: A no puede sincronizar hacia campañas de B')
    const trampa = [{ id: deB.id, user_id: A.id, nombre: 'ajena', meta_campaign_id: '1', tipo_conversion: 'venta_manual', moneda: 'USD', activo: true }]
    r = await sincronizar(sbA, trampa, HOY, deps)
    eq('falla la escritura sobre la campaña ajena', r.resultados[0].ok, false)
    eq('B no recibió filas', (await filas('ads_metricas_diarias', deB.id)).length, 0)
  }
  // ── SPRINT 4 ──
  section('VENTAS MANUALES')
  const V = `/api/ads-analizador/campaigns/${ebook.id}/ventas`
  res = await api(null, V, { method: 'POST', body: '{}' })
  eq('sin sesión → 401', res.status, 401)
  res = await post(A, V, { fecha: hace(0), cantidad: 3, nota: 'dos por referido' })
  eq('carga las de hoy', res.status, 200)
  eq('devuelve la fila', (await res.json()).venta, { fecha: hace(0), cantidad: 3, neto: null, nota: 'dos por referido' })
  res = await post(A, V, { fecha: hace(0), cantidad: 5 })
  eq('cargar el mismo día reemplaza', (await res.json()).venta?.cantidad, 5)
  let vs = await admin(`/rest/v1/ads_ventas_manuales?campaign_id=eq.${ebook.id}&select=*`).then(r => r.json())
  eq('sigue habiendo UNA fila para ese día', vs.length, 1)
  eq('la nota se limpia si no viene', vs[0].nota, null)
  res = await patch(A, V, { fecha: hace(9), cantidad: 2 })
  eq('retroactiva (hace 9 días) funciona igual', res.status, 200)
  res = await post(A, V, { fecha: '2099-01-01', cantidad: 1 })
  eq('fecha futura → 400', res.status, 400)
  res = await post(A, V, { fecha: hace(0), cantidad: 1.5 })
  eq('cantidad con decimales → 400', res.status, 400)
  res = await post(A, V, { fecha: hace(0), cantidad: -1 })
  eq('cantidad negativa → 400', res.status, 400)
  const stripe1 = (await api(A, '/api/ads-analizador/campaigns').then(r => r.json())).campaigns.find(x => x.campana.tipoConversion === 'compra_stripe')
  // En compras, una venta cargada a mano es una corrección de ese día.
  const S = `/api/ads-analizador/campaigns/${stripe1.campana.id}`
  const antes = await api(A, S).then(r => r.json())
  const diaStripe = antes.pagos.at(-1).fecha
  res = await post(A, `${S}/ventas`, { fecha: diaStripe, cantidad: 9 })
  eq('corregir las compras de un día en Stripe', res.status, 200)
  let despues = await api(A, S).then(r => r.json())
  eq('la corrección suma al total', despues.totales.conversiones - antes.totales.conversiones, 9 - antes.pagos.at(-1).comprasExitosas)
  res = await api(A, `${S}/ventas?fecha=${diaStripe}`, { method: 'DELETE' })
  eq('volver al automático', res.status, 200)
  despues = await api(A, S).then(r => r.json())
  eq('el total vuelve a ser el de Stripe', despues.totales.conversiones, antes.totales.conversiones)
  // Neto real (después de comisiones) sin tocar las ventas automáticas.
  res = await post(A, `${S}/ventas`, { fecha: diaStripe, neto: '20,50' })
  eq('cargar solo el neto de un día', res.status, 200)
  despues = await api(A, S).then(r => r.json())
  eq('las compras siguen siendo las de Stripe', despues.totales.conversiones, antes.totales.conversiones)
  eq('la facturación bruta no cambia', despues.totales.ingreso, antes.totales.ingreso)
  eq('cuenta 1 día con neto real', despues.totales.diasConNetoManual, 1)
  ok('el profit usa el neto real de ese día', despues.totales.profit !== antes.totales.profit, `${antes.totales.profit} → ${despues.totales.profit}`)
  res = await post(A, `${S}/ventas`, { fecha: diaStripe })
  eq('ni ventas ni neto → 400', res.status, 400)
  await api(A, `${S}/ventas?fecha=${diaStripe}`, { method: 'DELETE' })
  res = await api(A, `${S}/ventas?fecha=2099-01-01`, { method: 'DELETE' })
  eq('borrar con fecha futura → 400', res.status, 400)
  res = await post(B, V, { fecha: hace(0), cantidad: 99 })
  eq('B no carga ventas en la campaña de A → 404', res.status, 404)

  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('las ventas cuentan como conversiones', datos.totales.conversiones, 7)
  eq('ingreso = ventas × precio', datos.totales.ingreso, 7 * 24.5)

  section('CAMBIOS · reinician el cooldown')
  const K = `/api/ads-analizador/campaigns/${ebook.id}/cambios`
  res = await api(null, K, { method: 'POST', body: '{}' })
  eq('sin sesión → 401', res.status, 401)
  res = await post(A, K, { tipo: 'inventado' })
  eq('tipo inválido → 400', res.status, 400)
  res = await post(B, K, { tipo: 'presupuesto' })
  eq('B no registra cambios en la de A → 404', res.status, 404)

  // Estado sano antes del cambio: 14 días a 13,59 Bs por venta, sin cambios.
  const sano = []
  for (let i = 14; i >= 1; i--) sano.push({ user_id: A.id, campaign_id: ebook.id, fecha: hace(i), gasto: 54.36, resultados: 10 })
  // Upsert: el sync simulado del Sprint 3 ya dejó 7 días de esta campaña.
  res = await rest(A, '/ads_metricas_diarias?on_conflict=campaign_id,fecha', {
    method: 'POST', body: JSON.stringify(sano),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  ok('reemplaza las métricas del sync simulado', res.status < 300, `status ${res.status}`)
  const ventasSanas = []
  for (let i = 14; i >= 1; i--) ventasSanas.push({ fecha: hace(i), cantidad: 4 })
  for (const v of ventasSanas) await post(A, V, v)
  await post(A, V, { fecha: hace(0), cantidad: 0 })
  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('antes del cambio: verde', datos.estado.color, 'verde')

  res = await post(A, K, { tipo: 'presupuesto', detalle: 'Subí de 25 a 30 Bs/día' })
  const cambio = (await res.json()).cambio
  eq('registra → 201', res.status, 201)
  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('después: amarillo / esperar', [datos.estado.color, datos.estado.accion], ['amarillo', 'esperar'])
  eq('bandera de reajuste técnico', datos.estado.banderas.map(b => b.tipo), ['reajuste_tecnico'])
  eq('el cambio aparece en el historial', datos.cambios[0]?.detalle, 'Subí de 25 a 30 Bs/día')

  res = await api(B, `${K}?cambio=${cambio.id}`, { method: 'DELETE' })
  eq('B no borra el cambio de A → 404', res.status, 404)
  res = await api(A, `${K}?cambio=${cambio.id}`, { method: 'DELETE' })
  eq('deshacer el cambio', res.status, 200)
  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('vuelve a verde', datos.estado.color, 'verde')

  section('CAMBIOS · en una fecha de la tabla')
  res = await post(A, K, { tipo: 'creativo', detalle: 'Anuncio nuevo', fecha: hace(10) })
  const viejo = (await res.json()).cambio
  eq('registra en una fecha pasada → 201', res.status, 201)
  eq('queda guardado en ese día (hora de Bolivia)', new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date(viejo.fecha)), hace(10))
  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('un cambio de hace 10 días ya no frena nada', datos.estado.color, 'verde')
  res = await post(A, K, { tipo: 'audiencia', fecha: hace(2) })
  datos = await api(A, `/api/ads-analizador/campaigns/${ebook.id}`).then(r => r.json())
  eq('uno de hace 2 días sí pone reajuste técnico', datos.estado.banderas.map(b => b.tipo), ['reajuste_tecnico'])
  eq('los cambios vienen ordenados del más reciente', datos.cambios.map(c => c.tipo), ['audiencia', 'creativo'])
  res = await post(A, K, { tipo: 'otro', fecha: '2099-01-01' })
  eq('fecha futura → 400', res.status, 400)
  for (const c of datos.cambios) await api(A, `${K}?cambio=${c.id}`, { method: 'DELETE' })

  section('LA LISTA REFLEJA EL DETALLE')
  datos = await api(A, '/api/ads-analizador/campaigns').then(r => r.json())
  eq('el home dice lo mismo que el dashboard', datos.campaigns.find(x => x.campana.id === ebook.id).estado.color, 'verde')
} catch (e) {
  console.error('\n💥', e)
  ok('la suite corre sin excepciones', false, String(e))
} finally {
  await borrarUsuario(A)
  await borrarUsuario(B)
}

process.exit(summary() === 0 ? 0 : 1)
