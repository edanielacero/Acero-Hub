import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const raw = readFileSync(join(root, '.env.local'), 'utf8')
const get = k => raw.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1].trim().replace(/^"|"$/g, '')

export const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
export const SRV = get('SUPABASE_SERVICE_ROLE_KEY')
export const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const ROOT = root
