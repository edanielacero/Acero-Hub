import type { ClientStatus } from './types'

export const STATUS_ORDER: ClientStatus[] = ['onboarding', 'active', 'paused', 'archived']

export const STATUS_LABEL: Record<ClientStatus, string> = {
  onboarding: 'Onboarding',
  active: 'Activo',
  paused: 'Pausado',
  archived: 'Archivado',
}

// Mismos colores en la lista, el detalle y el selector del formulario, para
// que el significado de cada estado se reconozca de un vistazo en toda la app.
export const STATUS_BADGE_CLS: Record<ClientStatus, string> = {
  onboarding: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
  paused: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700',
  archived: 'bg-slate-100 dark:bg-zinc-900 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-800',
}
