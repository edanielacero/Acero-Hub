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
  for (const u of viejos) {
    await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: h })
  }
  if (viejos.length > 0) {
    console.log(`Limpieza previa: ${viejos.length} usuario(s) de prueba huérfano(s) eliminado(s).\n`)
  }
  return viejos.length
}
