'use client'

import { IconCheck } from '@tabler/icons-react'
import type { BudgetViewMode } from '@/lib/finanzas/budgets'
import { useBudgetViewPref } from '../../components/budget-view-pref'
import { Panel } from '../../components/ui'
import { SettingsHeader, SettingsPage } from './shared'

export const BUDGET_VIEW_OPTIONS: { value: BudgetViewMode; label: string; hint: string }[] = [
  {
    value: 'gastado',
    label: 'Cuánto vas gastando',
    hint: 'La barra arranca vacía y el número grande es lo gastado, hasta llegar al tope.',
  },
  {
    value: 'disponible',
    label: 'Cuánto te queda',
    hint: 'La barra arranca llena con el presupuesto entero y se va descontando a medida que gastas.',
  },
]

export function AjustesPresupuestoScreen() {
  const { mode, setMode } = useBudgetViewPref()

  return (
    <SettingsPage>
      <SettingsHeader title="Presupuesto" />

      <Panel>
        <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
          Cómo mostrar el progreso — aplica igual en Presupuesto y en la Home.
        </p>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Cómo ver el presupuesto">
          {BUDGET_VIEW_OPTIONS.map(o => {
            const selected = mode === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(o.value)}
                className={`flex items-center gap-3 text-left p-3.5 rounded-[var(--fz-r-tile)] border transition-colors ${
                  selected
                    ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                    : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-semibold ${selected ? 'text-[var(--fz-accent)]' : ''}`}>{o.label}</p>
                  <p className="text-[12px] text-[var(--fz-ink-3)]">{o.hint}</p>
                </div>
                {selected && <IconCheck size={18} stroke={2.4} className="text-[var(--fz-accent)] shrink-0" />}
              </button>
            )
          })}
        </div>
      </Panel>
    </SettingsPage>
  )
}
