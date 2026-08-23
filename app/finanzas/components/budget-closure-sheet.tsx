'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { formatUSD } from '@/lib/finanzas/money'
import { monthLabel } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { Btn, ErrorNote } from './ui'

/**
 * La pregunta de cierre de mes, una línea a la vez (§4.5 de
 * sprint_6_presupuesto.md): reemplaza al `rollover_mode` fijo del primer
 * borrador — acá se decide mes a mes si el sobrante o el sobregasto se lleva
 * al siguiente período o no.
 *
 * `queue` se captura al abrir, igual que en `<BudgetWizardSheet>`: la lista
 * de pendientes se achica con cada `reload()` de este mismo sheet, y leerla
 * en vivo desincronizaría el índice.
 */
export function BudgetClosureSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { budgets, reload } = useFinanzas()
  const [queue] = useState(() => budgets.pending_closures)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const finished = queue.length === 0 || index >= queue.length

  useEffect(() => {
    if (finished) onDone()
  }, [finished, onDone])

  if (finished) return null

  const current = queue[index]
  const sobra = current.amount_usd >= 0

  async function responder(carried: boolean) {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/finanzas/budgets/${current.line_id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: current.period, carried }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }
    await reload()
    setIndex(i => i + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Cerrar el mes"
        className="fz-sheet relative w-full min-[900px]:w-[420px] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">
            {monthLabel(current.period.slice(0, 7))} — {current.name ?? current.category_name ?? 'Presupuesto general'}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col gap-4">
          <p className="text-[15px]">
            {sobra ? 'Te sobraron ' : 'Te pasaste '}
            <strong className={sobra ? 'text-[var(--fz-in-text)]' : 'text-[var(--fz-out-text)]'}>
              {formatUSD(Math.abs(current.amount_usd))}
            </strong>
            {sobra ? '.' : ' de lo que tenías presupuestado.'}
          </p>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex flex-col gap-2">
            <Btn onClick={() => responder(true)} disabled={saving} full>
              {sobra ? 'Llevar al próximo mes' : 'Restar al próximo mes'}
            </Btn>
            <Btn variant="ghost" onClick={() => responder(false)} disabled={saving} full>
              {sobra ? 'Que quede como ahorro' : 'Que no afecte nada'}
            </Btn>
          </div>

          <p className="text-center text-[12px] text-[var(--fz-ink-3)]">{index + 1} de {queue.length}</p>
        </div>
      </div>
    </div>
  )
}
