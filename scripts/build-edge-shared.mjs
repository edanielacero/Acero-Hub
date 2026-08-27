/**
 * Copia `lib/finanzas/` dentro de las Edge Functions, en Deno.
 *
 * Spec: documentos/finanzas/sprint_9_notificaciones.md §0.2
 *
 * POR QUÉ EXISTE
 *
 * Las notificaciones tienen que decidir lo mismo que la app: si un fijo está
 * vencido, si un presupuesto se pasó, si un mes quedó sin repartir. Esa lógica
 * ya existe en `lib/finanzas/` y está cubierta por 662 pruebas unitarias.
 * Reescribirla en Deno dejaría DOS implementaciones de "¿este fijo está
 * vencido?" que van a divergir — y cuando diverjan, la app va a decir una cosa
 * y la notificación otra.
 *
 * Se puede copiar en vez de reescribir porque `lib/finanzas/` es TypeScript
 * puro: cero APIs de Node, y su único import externo es de TIPO
 * (`import type { SupabaseClient }`), que desaparece al compilar.
 *
 * QUÉ TRANSFORMA
 *
 *   from './money'                 →  from './money.ts'
 *   from '@supabase/supabase-js'   →  from 'https://esm.sh/@supabase/supabase-js@2'
 *
 * Es la misma transformación que `tests/finanzas/run.mjs` ya hace para poder
 * correr las suites (allá reescribe a `.mjs`).
 *
 * LA COPIA ES GENERADA: no editar `supabase/functions/_shared/finanzas/`.
 * `--check` verifica que esté al día y es lo que corre la suite `unit`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(ROOT, 'lib/finanzas')
const DESTINO = join(ROOT, 'supabase/functions/_shared/finanzas')
const SELLO = join(DESTINO, '.hash')

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2'

const AVISO = `// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
`

function fuentes() {
  return readdirSync(ORIGEN).filter(f => f.endsWith('.ts')).sort()
}

/** El hash del ORIGEN. Si cambia, la copia quedó vieja. */
function hashOrigen() {
  const h = createHash('sha256')
  for (const f of fuentes()) {
    h.update(f)
    h.update(readFileSync(join(ORIGEN, f)))
  }
  return h.digest('hex')
}

function transformar(src) {
  return AVISO + src
    // Deno exige la extensión explícita en los imports relativos.
    .replace(/(from\s+['"])(\.\/[a-z-]+)(['"])/g, '$1$2.ts$3')
    .replace(/(import\s*\(\s*['"])(\.\/[a-z-]+)(['"])/g, '$1$2.ts$3')
    // El cliente de Supabase, por URL: en Deno no hay node_modules.
    .replace(/(from\s+['"])@supabase\/supabase-js(['"])/g, `$1${SUPABASE_ESM}$2`)
}

function construir() {
  rmSync(DESTINO, { recursive: true, force: true })
  mkdirSync(DESTINO, { recursive: true })
  for (const f of fuentes()) {
    writeFileSync(join(DESTINO, f), transformar(readFileSync(join(ORIGEN, f), 'utf8')))
  }
  writeFileSync(SELLO, hashOrigen())
  return fuentes().length
}

const check = process.argv.includes('--check')

if (check) {
  if (!existsSync(SELLO)) {
    console.error('✗ Falta la copia de lib/finanzas para Deno. Corré: node scripts/build-edge-shared.mjs')
    process.exit(1)
  }
  if (readFileSync(SELLO, 'utf8').trim() !== hashOrigen()) {
    console.error('✗ La copia de lib/finanzas para Deno quedó vieja.\n'
      + '  Cambiaste lógica de dominio sin regenerarla, así que la notificación\n'
      + '  puede decir algo distinto de lo que muestra la app.\n'
      + '  Corré: node scripts/build-edge-shared.mjs')
    process.exit(1)
  }
  console.log('✓ La copia de lib/finanzas para Deno está al día')
} else {
  console.log(`✓ ${construir()} archivos copiados a supabase/functions/_shared/finanzas/`)
}
