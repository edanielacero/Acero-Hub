/**
 * Corre las suites de Finanzas.
 *
 *   node tests/finanzas/run.mjs          → unit + db + api
 *   node tests/finanzas/run.mjs unit     → solo una
 *
 * `unit` y `db` no necesitan nada corriendo. `api` necesita el dev server
 * levantado (localhost:3001 por defecto, configurable con FZ_BASE_URL).
 *
 * Las suites `db` y `api` crean un usuario temporal propio, trabajan ahí y lo
 * borran al terminar — nunca tocan los datos reales del usuario.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const fin = join(here, '.fin')

const only = process.argv[2]
const suites = ['unit', 'db', 'api'].filter(s => !only || s === only)

// La capa de dominio está en TypeScript. Se compila a ./.fin (ignorado por git)
// para importarla desde los tests sin agregar dependencias al proyecto.
console.log('Compilando lib/finanzas…')
rmSync(fin, { recursive: true, force: true })
execFileSync('npx', [
  'tsc', ...readdirSync(join(ROOT, 'lib/finanzas')).map(f => join('lib/finanzas', f)),
  '--ignoreConfig', '--outDir', fin, '--module', 'esnext',
  '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck',
], { cwd: ROOT, stdio: 'inherit' })

// tsc emite .js con imports relativos sin extensión; Node ESM necesita ambas cosas.
for (const f of readdirSync(fin).filter(f => f.endsWith('.js'))) {
  renameSync(join(fin, f), join(fin, f.replace(/\.js$/, '.mjs')))
}
for (const f of readdirSync(fin).filter(f => f.endsWith('.mjs'))) {
  const p = join(fin, f)
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '\.\/([a-z]+)'/g, "from './$1.mjs'"))
}

let failed = 0
for (const suite of suites) {
  console.log(`\n${'═'.repeat(60)}\n  ${suite.toUpperCase()}\n${'═'.repeat(60)}`)
  try {
    execFileSync('node', [join(here, `${suite}.mjs`)], {
      stdio: 'inherit',
      env: { ...process.env, FZ_ROOT: ROOT },
    })
  } catch {
    failed++
  }
}

rmSync(fin, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅ Todas las suites pasaron' : `❌ ${failed} suite(s) con fallos`}`)
process.exit(failed === 0 ? 0 : 1)
