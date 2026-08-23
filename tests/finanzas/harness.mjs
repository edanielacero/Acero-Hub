let pass = 0, fail = 0
const fails = []

export function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : (fail++, fails.push(label))
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) console.log(`      esperado: ${JSON.stringify(want)}\n      obtenido: ${JSON.stringify(got)}`)
  return ok
}

export function ok(label, condition, detail = '') {
  condition ? pass++ : (fail++, fails.push(label))
  console.log(`  ${condition ? '✓' : '✗'} ${label}${condition ? '' : `\n      ${detail}`}`)
  return condition
}

export function section(name) { console.log(`\n── ${name} ──`) }

export function summary() {
  console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron · ${fail} fallaron`)
  if (fail) console.log('Fallaron:\n' + fails.map(f => `  · ${f}`).join('\n'))
  return fail
}

/**
 * Borra usuarios de prueba que hayan quedado de una corrida anterior.
 *
 * El `finally` que limpia al final no corre si el proceso muere antes — por
 * timeout, Ctrl-C o un `kill`. Sin este barrido, cada corrida interrumpida deja
 * un usuario con sus cuentas y movimientos colgados en la base real.
 */
export async function sweepTestUsers(URL_, SRV) {
  const h = { apikey: SRV, Authorization: `Bearer ${SRV}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: h })
  if (!res.ok) return 0
  const { users } = await res.json()
  const viejos = (users ?? []).filter(u => (u.email ?? '').includes('acerotest.local'))
  let borrados = 0
  const fallidos = []
  for (const u of viejos) {
    const res2 = await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: h })
    if (res2.ok) borrados++
    else fallidos.push(`${u.email}: HTTP ${res2.status}`)
  }
  if (borrados > 0) {
    console.log(`Limpieza previa: ${borrados} usuario(s) de prueba huérfano(s) eliminado(s).\n`)
  }
  // Sin esto el barrido decía "listo" aunque el DELETE hubiera fallado, y los
  // huérfanos se acumulaban en la base real sin que nada lo avisara — es como
  // pasó inadvertido que un trigger sin SECURITY DEFINER rompía el borrado de
  // usuarios (migración 20260823040000).
  if (fallidos.length > 0) {
    console.warn(`⚠️  No se pudieron borrar ${fallidos.length} usuario(s) de prueba:\n   ${fallidos.join('\n   ')}\n`)
  }
  return borrados
}
