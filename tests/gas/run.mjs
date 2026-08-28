/**
 * Corre las suites de Gas.
 *
 *   node tests/gas/run.mjs          → unit + api
 *   node tests/gas/run.mjs unit     → solo una
 *
 * `unit` no necesita nada corriendo. `api` necesita el dev server levantado
 * (localhost:3000 por defecto, configurable con GAS_BASE_URL).
 *
 * `api` crea un usuario temporal, le da acceso a Gas, trabaja ahí y lo borra al
 * terminar — nunca toca los datos reales del usuario.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const salida = join(here, '.gas')

const only = process.argv[2]
const suites = ['unit', 'api'].filter(s => !only || s === only)

// La capa de dominio está en TypeScript. Se compila a ./.gas (ignorado por git)
// para importarla desde los tests sin agregar dependencias al proyecto.
//
// `--rootDir lib/gas` y no `lib`: así la salida cae plana en .gas/ en vez de
// anidarse bajo .gas/gas/. Funciona porque ningún módulo de lib/gas importa
// nada de fuera de su carpeta, a diferencia de lib/finanzas.
console.log('Compilando lib/gas…')
rmSync(salida, { recursive: true, force: true })
const entradas = readdirSync(join(ROOT, 'lib/gas')).map(f => join('lib/gas', f))
execFileSync('npx', [
  'tsc', ...entradas,
  '--ignoreConfig', '--outDir', salida, '--rootDir', 'lib/gas', '--module', 'esnext',
  '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck',
], { cwd: ROOT, stdio: 'inherit' })

// tsc emite .js con imports relativos sin extensión; Node ESM necesita ambas cosas.
for (const f of readdirSync(salida).filter(f => f.endsWith('.js'))) {
  renameSync(join(salida, f), join(salida, f.replace(/\.js$/, '.mjs')))
}
for (const f of readdirSync(salida).filter(f => f.endsWith('.mjs'))) {
  const p = join(salida, f)
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '\.\/([a-z-]+)'/g, "from './$1.mjs'"))
}

let failed = 0
for (const suite of suites) {
  console.log(`\n${'═'.repeat(60)}\n  ${suite.toUpperCase()}\n${'═'.repeat(60)}`)
  try {
    execFileSync('node', [join(here, `${suite}.mjs`)], { stdio: 'inherit' })
  } catch {
    failed++
  }
}

rmSync(salida, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅ Todas las suites pasaron' : `❌ ${failed} suite(s) con fallos`}`)
process.exit(failed === 0 ? 0 : 1)
