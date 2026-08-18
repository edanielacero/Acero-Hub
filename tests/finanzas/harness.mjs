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
