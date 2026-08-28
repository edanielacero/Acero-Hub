import { URL_, SRV, ANON } from '../finanzas/env.mjs'
// El harness es infraestructura de tests, no dominio de Finanzas: se reusa tal
// cual. Si aparece una tercera suite conviene subirlo a tests/.
import { eq, ok, section, summary, sweepTestUsers } from '../finanzas/harness.mjs'

const BASE = process.env.GAS_BASE_URL ?? 'http://localhost:3000'
const REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1]

const admin = (p, i = {}) => fetch(`${URL_}${p}`, {
  ...i, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json', ...i.headers },
})

const EMAIL = `gas-api-${Date.now()}@acerotest.local`
const PASSWORD = `Test-${Math.random().toString(36).slice(2)}-9xQ!`
let USER_ID = null, COOKIE = null

const api = (p, i = {}) => fetch(`${BASE}${p}`, {
  ...i, headers: { cookie: COOKIE, 'Content-Type': 'application/json', ...i.headers },
})

async function setup() {
  // Arrastra lo que haya quedado de una corrida interrumpida.
  await sweepTestUsers(URL_, SRV)

  const u = await admin('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  }).then(r => r.json())
  USER_ID = u.id
  if (!USER_ID) throw new Error('sin usuario: ' + JSON.stringify(u))

  // Acceso a Gas, o el gate y las rutas lo dejarían afuera.
  const proyecto = await admin('/rest/v1/projects?slug=eq.gas&select=id').then(r => r.json())
  if (!proyecto[0]) throw new Error('falta la fila de "gas" en projects')
  await admin('/rest/v1/project_access', {
    method: 'POST',
    body: JSON.stringify({ user_id: USER_ID, project_id: proyecto[0].id, granted_by: USER_ID }),
  })

  const sesion = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(r => r.json())
  if (!sesion.access_token) throw new Error('sin sesión: ' + JSON.stringify(sesion))

  // Formato de cookie de @supabase/ssr: base64- + base64url(JSON de la sesión).
  COOKIE = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(sesion)).toString('base64url')}`
}

async function limpiar() {
  if (!USER_ID) return
  // gas_autos y gas_movimientos se van solos por el `on delete cascade`.
  await admin(`/rest/v1/project_access?user_id=eq.${USER_ID}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${USER_ID}`, { method: 'DELETE' })
  await admin(`/auth/v1/admin/users/${USER_ID}`, { method: 'DELETE' })
}

try {
  await setup()

  section('ARRANQUE · los dos autos se crean solos')
  let res = await api('/api/gas')
  let datos = await res.json()
  ok('GET /api/gas responde 200', res.status === 200, `status ${res.status}`)
  eq('crea dos autos en la primera visita', datos.autos?.length, 2)

  const rojo = datos.autos.find(a => a.color === 'rojo')
  const plomo = datos.autos.find(a => a.color === 'plomo')
  eq('el rojo gasta 0,70 Bs/km', rojo?.bsPorKm, 0.7)
  eq('el plomo gasta 0,90 Bs/km', plomo?.bsPorKm, 0.9)
  eq('arranca sin movimientos', datos.movimientos?.length, 0)

  datos = await api('/api/gas').then(r => r.json())
  eq('la segunda visita no duplica autos', datos.autos.length, 2)

  section('CARGAR SALDO')
  res = await api('/api/gas/cargas', { method: 'POST', body: JSON.stringify({ autoId: rojo.id, monto: 100 }) })
  ok('carga 100 Bs', res.status === 201, `status ${res.status}`)
  res = await api('/api/gas/cargas', { method: 'POST', body: JSON.stringify({ autoId: rojo.id, monto: -5 }) })
  ok('rechaza monto negativo', res.status === 400, `status ${res.status}`)
  res = await api('/api/gas/cargas', { method: 'POST', body: JSON.stringify({ autoId: rojo.id, monto: 0 }) })
  ok('rechaza monto cero', res.status === 400, `status ${res.status}`)

  section('INICIAR VIAJE')
  res = await api('/api/gas/viajes', {
    method: 'POST', body: JSON.stringify({ autoId: rojo.id, kmInicial: 1000, personas: 4 }),
  })
  const viaje = (await res.json()).movimiento
  ok('inicia el viaje', res.status === 201, `status ${res.status}`)
  eq('queda en curso', viaje?.kmFinal, null)
  eq('congela el Bs/km del auto', viaje?.bsPorKm, 0.7)

  res = await api('/api/gas/viajes', {
    method: 'POST', body: JSON.stringify({ autoId: rojo.id, kmInicial: 1200, personas: 1 }),
  })
  ok('no deja dos viajes abiertos en el mismo auto', res.status === 409, `status ${res.status}`)

  res = await api('/api/gas/viajes', {
    method: 'POST', body: JSON.stringify({ autoId: plomo.id, kmInicial: 5000, personas: 1 }),
  })
  const viajePlomo = (await res.json()).movimiento
  ok('el otro auto sí puede tener el suyo', res.status === 201, `status ${res.status}`)

  res = await api('/api/gas/viajes', {
    method: 'POST', body: JSON.stringify({ autoId: plomo.id, kmInicial: 1, personas: 0 }),
  })
  ok('rechaza 0 personas', res.status === 400, `status ${res.status}`)

  section('FINALIZAR VIAJE')
  res = await api(`/api/gas/viajes/${viaje.id}`, { method: 'PATCH', body: JSON.stringify({ kmFinal: 900 }) })
  ok('rechaza km final menor al inicial', res.status === 400, `status ${res.status}`)

  res = await api(`/api/gas/viajes/${viaje.id}`, { method: 'PATCH', body: JSON.stringify({ kmFinal: 1050 }) })
  const cerrado = (await res.json()).movimiento
  ok('cierra el viaje', res.status === 200, `status ${res.status}`)
  eq('guarda el km final', cerrado?.kmFinal, 1050)
  ok('guarda cuándo terminó', typeof cerrado?.terminadoEn === 'string', String(cerrado?.terminadoEn))

  res = await api(`/api/gas/viajes/${viaje.id}`, { method: 'PATCH', body: JSON.stringify({ kmFinal: 1080 }) })
  ok('no deja re-cerrar un viaje cerrado', res.status === 409, `status ${res.status}`)

  section('LAS CUENTAS, LEÍDAS DE VUELTA')
  datos = await api('/api/gas').then(r => r.json())
  const v = datos.movimientos.find(m => m.id === viaje.id)
  eq('50 km', v.kmFinal - v.kmInicial, 50)
  eq('4 personas', v.personas, 4)
  // Bs 35 en total, Bs 8,75 al conductor → saldo 100 − 8,75.
  const mio = Math.round(((v.kmFinal - v.kmInicial) * v.bsPorKm / v.personas) * 100) / 100
  eq('le toca Bs 8,75', mio, 8.75)
  eq('saldo del rojo: 91,25', Math.round((100 - mio) * 100) / 100, 91.25)

  section('CANCELAR UN VIAJE ABIERTO')
  res = await api(`/api/gas/viajes/${viajePlomo.id}`, { method: 'DELETE' })
  ok('borra el viaje en curso', res.status === 200, `status ${res.status}`)
  res = await api(`/api/gas/viajes/${cerrado.id}`, { method: 'DELETE' })
  ok('NO borra un viaje ya cerrado', res.status === 404, `status ${res.status}`)

  section('CORREGIR UNA CARGA')
  const carga = (await api('/api/gas').then(r => r.json())).movimientos
    .find(m => m.tipo === 'carga' && m.autoId === rojo.id)
  res = await api(`/api/gas/movimientos/${carga.id}`, { method: 'PATCH', body: JSON.stringify({ monto: 150 }) })
  let corregido = (await res.json()).movimiento
  ok('corrige el monto', res.status === 200, `status ${res.status}`)
  eq('el monto nuevo quedó', corregido?.monto, 150)
  res = await api(`/api/gas/movimientos/${carga.id}`, { method: 'PATCH', body: JSON.stringify({ monto: 0 }) })
  ok('rechaza monto cero', res.status === 400, `status ${res.status}`)

  section('CORREGIR UN VIAJE CERRADO')
  // Se tecleó 1050 y en realidad eran 1055, y no iban 4 sino 2.
  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ kmInicial: 1000, kmFinal: 1055, personas: 2 }),
  })
  corregido = (await res.json()).movimiento
  ok('corrige el viaje', res.status === 200, `status ${res.status}`)
  eq('km final nuevo', corregido?.kmFinal, 1055)
  eq('personas nuevas', corregido?.personas, 2)
  // 55 km × 0,70 = 38,50 entre 2 = 19,25
  eq('el costo se recalcula', Math.round((55 * 0.7 / 2) * 100) / 100, 19.25)

  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ kmInicial: 2000, kmFinal: 1055 }),
  })
  ok('sigue rechazando km final menor al inicial', res.status === 400, `status ${res.status}`)
  res = await api(`/api/gas/movimientos/${viaje.id}`, { method: 'PATCH', body: JSON.stringify({ personas: 0 }) })
  ok('sigue rechazando 0 personas', res.status === 400, `status ${res.status}`)

  section('EL PROMEDIO DEL AUTO NO REESCRIBE EL PASADO')
  res = await api(`/api/gas/autos/${rojo.id}`, { method: 'PATCH', body: JSON.stringify({ bsPorKm: 1.2 }) })
  const autoNuevo = (await res.json()).auto
  ok('cambia el promedio', res.status === 200, `status ${res.status}`)
  eq('el promedio nuevo quedó', autoNuevo?.bsPorKm, 1.2)

  datos = await api('/api/gas').then(r => r.json())
  const viajeViejo = datos.movimientos.find(m => m.id === viaje.id)
  eq('el viaje ya registrado CONSERVA su 0,70', viajeViejo?.bsPorKm, 0.7)

  // Un viaje nuevo sí sale con el promedio nuevo.
  res = await api('/api/gas/viajes', {
    method: 'POST', body: JSON.stringify({ autoId: rojo.id, kmInicial: 3000, personas: 1 }),
  })
  const viajeNuevo = (await res.json()).movimiento
  eq('el viaje siguiente usa el 1,20', viajeNuevo?.bsPorKm, 1.2)
  await api(`/api/gas/viajes/${viajeNuevo.id}`, { method: 'DELETE' })

  res = await api(`/api/gas/autos/${rojo.id}`, { method: 'PATCH', body: JSON.stringify({ bsPorKm: 0 }) })
  ok('rechaza un promedio de cero', res.status === 400, `status ${res.status}`)

  section('LA NOTA DEL VIAJE')
  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ nota: '  Al aeropuerto  ' }),
  })
  let conNota = (await res.json()).movimiento
  ok('guarda una nota sola, sin tocar los números', res.status === 200, `status ${res.status}`)
  eq('la recorta', conNota?.nota, 'Al aeropuerto')
  eq('no tocó el kilometraje', conNota?.kmFinal, 1055)
  eq('no tocó las personas', conNota?.personas, 2)

  // Corregir números después no puede borrar la nota que ya estaba.
  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ kmInicial: 1000, kmFinal: 1060, personas: 2 }),
  })
  conNota = (await res.json()).movimiento
  eq('la nota sobrevive a una corrección de números', conNota?.nota, 'Al aeropuerto')
  eq('el km sí cambió', conNota?.kmFinal, 1060)

  // Vacía la borra: '' y "no la mandes" son cosas distintas.
  res = await api(`/api/gas/movimientos/${viaje.id}`, { method: 'PATCH', body: JSON.stringify({ nota: '   ' }) })
  eq('una nota en blanco la borra', (await res.json()).movimiento?.nota, null)

  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ nota: 'x'.repeat(201) }),
  })
  ok('rechaza una nota de más de 200', res.status === 400, `status ${res.status}`)

  res = await api(`/api/gas/movimientos/${viaje.id}`, {
    method: 'PATCH', body: JSON.stringify({ nota: 'x'.repeat(200) }),
  })
  ok('acepta una de exactamente 200', res.status === 200, `status ${res.status}`)

  datos = await api('/api/gas').then(r => r.json())
  eq('la nota viaja en el GET', datos.movimientos.find(m => m.id === viaje.id)?.nota?.length, 200)

  section('BORRAR UN MOVIMIENTO')
  res = await api(`/api/gas/movimientos/${carga.id}`, { method: 'DELETE' })
  ok('borra la carga', res.status === 200, `status ${res.status}`)
  datos = await api('/api/gas').then(r => r.json())
  ok('ya no está en el historial', !datos.movimientos.some(m => m.id === carga.id))
  res = await api(`/api/gas/movimientos/${carga.id}`, { method: 'DELETE' })
  ok('borrar dos veces da 404', res.status === 404, `status ${res.status}`)

  section('SIN SESIÓN · toda ruta responde 401')
  for (const [nombre, path, init] of [
    ['GET /api/gas', '/api/gas', {}],
    ['POST /api/gas/cargas', '/api/gas/cargas', { method: 'POST', body: '{}' }],
    ['POST /api/gas/viajes', '/api/gas/viajes', { method: 'POST', body: '{}' }],
    ['PATCH /api/gas/viajes/:id', `/api/gas/viajes/${cerrado.id}`, { method: 'PATCH', body: '{}' }],
    ['DELETE /api/gas/viajes/:id', `/api/gas/viajes/${cerrado.id}`, { method: 'DELETE' }],
    ['PATCH /api/gas/movimientos/:id', `/api/gas/movimientos/${cerrado.id}`, { method: 'PATCH', body: '{}' }],
    ['DELETE /api/gas/movimientos/:id', `/api/gas/movimientos/${cerrado.id}`, { method: 'DELETE' }],
    ['PATCH /api/gas/autos/:id', `/api/gas/autos/${rojo.id}`, { method: 'PATCH', body: '{}' }],
  ]) {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json' } })
    ok(`${nombre} → 401`, r.status === 401, `status ${r.status}`)
  }
} finally {
  await limpiar()
}

process.exit(summary() === 0 ? 0 : 1)
