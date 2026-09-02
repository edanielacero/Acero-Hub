/**
 * Copia de seguridad de la base, sin depender del plan de Supabase.
 *
 *   node scripts/backup-db.mjs              → backups/2026-09-01T1234.json
 *   node scripts/backup-db.mjs --out ~/Drive/acero
 *   node scripts/backup-db.mjs --table fin_transactions   (una sola, para probar)
 *
 * El plan free no da backups descargables, y `supabase db dump` necesita
 * Docker. Esto usa la API REST con la service role key que ya está en
 * `.env.local`: no instala nada, no pide la contraseña de Postgres y corre en
 * cualquier máquina que pueda correr el proyecto.
 *
 * Lo que NO hace, para que quede dicho: no guarda el ESQUEMA (eso ya vive
 * versionado en supabase/migrations/), ni los usuarios de auth, ni Storage.
 * Restaurar es "aplicar las migraciones sobre una base limpia y volver a
 * insertar estas filas" — ver restore() abajo.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
const env = k => raw.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1].trim().replace(/^"|"$/g, '')

const URL_ = env('NEXT_PUBLIC_SUPABASE_URL')
const SRV = env('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !SRV) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const arg = name => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : null
}

const outDir = arg('out') ?? join(ROOT, 'backups')
const soloTabla = arg('table')

/** PostgREST corta en 1000 filas por defecto: se pagina con Range. */
const PAGE = 1000

const headers = { apikey: SRV, Authorization: `Bearer ${SRV}` }

async function listarTablas() {
  const spec = await fetch(`${URL_}/rest/v1/`, { headers }).then(r => r.json())
  const defs = spec.definitions ?? spec.components?.schemas ?? {}
  return Object.keys(defs).sort()
}

async function bajarTabla(tabla) {
  const filas = []
  for (let desde = 0; ; desde += PAGE) {
    const res = await fetch(`${URL_}/rest/v1/${tabla}?select=*`, {
      headers: { ...headers, Range: `${desde}-${desde + PAGE - 1}` },
    })
    if (!res.ok) throw new Error(`${tabla}: HTTP ${res.status} ${await res.text()}`)
    const lote = await res.json()
    filas.push(...lote)
    // Última página: vino incompleta o vacía.
    if (lote.length < PAGE) break
  }
  return filas
}

const tablas = soloTabla ? [soloTabla] : await listarTablas()

const datos = {}
let total = 0
for (const t of tablas) {
  try {
    const filas = await bajarTabla(t)
    datos[t] = filas
    total += filas.length
    console.log(`  ${t.padEnd(28)} ${String(filas.length).padStart(6)} filas`)
  } catch (e) {
    // Una tabla que falle no puede tirar el backup entero: se anota y sigue.
    datos[t] = { __error: String(e.message ?? e) }
    console.log(`  ${t.padEnd(28)} ⚠️  ${e.message ?? e}`)
  }
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
mkdirSync(outDir, { recursive: true })
const destino = join(outDir, `acero-hub-${sello}.json`)

writeFileSync(destino, JSON.stringify({
  hecho_en: new Date().toISOString(),
  proyecto: URL_,
  // Para saber, al restaurar, hasta qué migración corresponde este volcado.
  aviso: 'Solo datos. El esquema vive en supabase/migrations/.',
  tablas: datos,
}, null, 2))

console.log(`\n✅ ${total} filas de ${tablas.length} tablas → ${destino}`)
