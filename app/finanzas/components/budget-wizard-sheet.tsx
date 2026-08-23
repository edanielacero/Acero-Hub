'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { amountFromInput, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { Btn, ErrorNote, TextField } from './ui'

/**
 * "Armemos tu presupuesto": recorre las categorías de gasto que todavía no
 * tienen línea, una por vez, preguntando "¿Cuánto gastás en X?" — con
 * "Saltar" para las que no interesa presupuestar (Ronda 3 del spec).
 *
 * Es el mismo componente que en una v1.1 va a mostrar la sugerencia por
 * historial + buffer%: el día que haya datos, este campo arranca prellenado
 * en vez de vacío. No hace falta ninguna pantalla nueva para eso.
 *
 * La cola de categorías se captura UNA vez al abrir (`useState(() => …)`), no
 * se deriva en cada render de `budgets.categories_without_line` — esa lista
 * se achica con cada `reload()` que dispara este mismo wizard, y si se leyera
 * en vivo el índice se desincronizaría de a qué categoría corresponde.
 */
export function BudgetWizardSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { budgets, reload } = useFinanzas()
  const [queue] = useState(() => budgets.categories_without_line)
  const [index, setIndex] = useState(0)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const finished = queue.length === 0 || index >= queue.length

  // `onDone` cierra el sheet, que es una actualización de un componente
  // padre: no puede pasar durante el render de este, tiene que esperar al
  // efecto o React lo rechaza con "Cannot update a component while
  // rendering a different component".
  useEffect(() => {
    if (finished) onDone()
  }, [finished, onDone])

  if (finished) return null

  const current = queue[index]

  function next() {
    setAmount('')
    setError('')
    setIndex(i => i + 1)
  }

  async function guardarYAvanzar() {
    const value = amountFromInput(amount)
    if (!Number.isFinite(value) || value <= 0) {
      return setError('Poné un monto, o saltá esta categoría')
    }

    setSaving(true)
    const res = await fetch('/api/finanzas/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El wizard es el camino rápido de armado inicial: sin selector de
      // moneda propio, arranca en USD — el usuario puede crear la línea de
      // nuevo con otra moneda desde la pantalla de Presupuesto si lo prefiere.
      body: JSON.stringify({ category_id: current.id, amount: value, currency: 'USD', retroactive: true }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }
    await reload()
    next()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Armemos tu presupuesto"
        className="fz-sheet relative w-full min-[900px]:w-[420px] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Armemos tu presupuesto</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col gap-4">
          <p className="text-[15px] text-[var(--fz-ink-2)]">
            ¿Cuánto gastás aproximadamente al mes en{' '}
            <strong className="text-[var(--fz-ink)]">{current.name}</strong>?
          </p>

          <TextField
            value={amount}
            onChange={e => setAmount(parseDecimalInput(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
            className="fz-num"
            autoFocus
          />

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2">
            <Btn variant="ghost" onClick={next} disabled={saving}>Saltar</Btn>
            <Btn onClick={guardarYAvanzar} disabled={saving} full>
              {saving ? 'Guardando…' : 'Siguiente →'}
            </Btn>
          </div>

          <p className="text-center text-[12px] text-[var(--fz-ink-3)]">{index + 1} de {queue.length}</p>
        </div>
      </div>
    </div>
  )
}
