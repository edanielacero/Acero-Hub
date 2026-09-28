/**
 * Corre las suites de Ads Analizador.
 *
 *   node tests/ads-analizador/run.mjs          → unit + api
 *   node tests/ads-analizador/run.mjs unit     → solo una
 *
 * `unit` no necesita nada corriendo. `api` necesita el dev server levantado
 * (localhost:3000 por defecto, configurable con ADS_BASE_URL).
 *
 * `api` crea un usuario temporal, le da acceso a ads-analizador, trabaja ahí y
 * lo borra al terminar — nunca toca los datos reales del usuario.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const salida = join(here, '.ads')

const only = process.argv[2]
const suites = ['unit', 'api'].filter(s => !only || s === only)

// Se compila a ./.ads (ignorado por git) para importar el dominio desde los
// tests sin agregar dependencias. Ningún módulo de lib/ads-analizador importa
// nada de fuera de su carpeta, así que la salida cae plana.
console.log('Compilando lib/ads-analizador…')
rmSync(salida, { recursive: true, force: true })
const entradas = readdirSync(join(ROOT, 'lib/ads-analizador'))
  .filter(f => f.endsWith('.ts'))
  .map(f => join('lib/ads-analizador', f))
execFileSync('npx', [
  'tsc', ...entradas,
  '--ignoreConfig', '--outDir', salida, '--rootDir', 'lib/ads-analizador', '--module', 'esnext',
  '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
], { cwd: ROOT, stdio: 'inherit' })

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
