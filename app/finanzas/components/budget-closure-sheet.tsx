'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { formatAmount } from '@/lib/finanzas/money'
import { monthLabel } from '@/lib/finanzas/transactions'
import { nextPeriod } from '@/lib/finanzas/budgets'
import { useFinanzas } from './data-context'
import { Btn, ErrorNote } from './ui'
import { fzFetch } from './fz-fetch'

/**
 * La pregunta de cierre de mes, una línea a la vez (§4.5 de
 * sprint_6_presupuesto.md): reemplaza al `rollover_mode` fijo del primer
 * borrador — acá se decide mes a mes si el sobrante o el sobregasto se lleva
 * al siguiente período o no.
 *
 * `queue` captura al abrir solo la IDENTIDAD de cada pregunta (línea +
 * período): la lista de pendientes se achica con cada `reload()` de este
 * mismo sheet, y leerla en vivo desincronizaría el índice. El monto, en
 * cambio, se lee siempre en vivo — responder "llevar al próximo mes" cambia
 * el disponible del mes siguiente, que muchas veces es la pregunta que sigue
 * en esta misma cola; con el número congelado al abrir, la segunda pantalla
 * mostraba un sobrante que ya no era el que el server iba a congelar.
 */
export function BudgetClosureSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { budgets, reload } = useFinanzas()
  const [queue] = useState(() => budgets.pending_closures.map(c => ({ line_id: c.line_id, period: c.period })))
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Mientras el sheet está abierto, el fondo no se toca: ni scroll ni clicks
  // sueltos. Sin esto la lista de atrás seguía desplazándose bajo el dedo y
  // se podía interactuar con ella — el sheet parecía un panel más de la
  // página, no un formulario que te pide una decisión. Mismo efecto que ya
  // tenían los otros once sheets de la mini-app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const finished = queue.length === 0 || index >= queue.length
  const ref = finished ? null : queue[index]
  const current = ref
    ? budgets.pending_closures.find(c => c.line_id === ref.line_id && c.period === ref.period) ?? null
    : null

  useEffect(() => {
    if (finished) onDone()
  }, [finished, onDone])

  // Ya no está pendiente (se respondió en otra pestaña, o la línea se
  // archivó): la pregunta desaparece sola en vez de quedar trabada.
  useEffect(() => {
    if (!finished && !current) setIndex(i => i + 1)
  }, [finished, current])

  if (finished || !current) return null

  const { line_id, period } = current
  const sobra = current.amount_usd >= 0
  const proximo = nextPeriod(period)

  // Arrow y no `function`: la declaración se hoistea y TypeScript pierde ahí
  // el estrechamiento de `current` que dejó el guard de arriba.
  const responder = async (carried: boolean) => {
    setSaving(true)
    setError('')
    const res = await fzFetch(`/api/finanzas/budgets/${line_id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, carried }),
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
            {monthLabel(current.period.slice(0, 7))} — {current.name ?? current.category_names.join(', ')}
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
              {formatAmount(Math.abs(current.amount), current.input_currency)}
            </strong>
            {sobra ? '.' : ' de lo que tenías presupuestado.'}
          </p>

          {/* La decisión es solo si pasa o no al mes siguiente. Lo que no pasa
              NO se va a Ahorros —esa es otra pantalla, con sus propios
              movimientos—: el mes que viene simplemente arranca con su monto
              de siempre. */}
          <p className="text-[13px] text-[var(--fz-ink-2)]">
            {sobra
              ? `Si lo llevas, se suma al presupuesto de ${monthLabel(proximo.slice(0, 7)).toLowerCase()}. Si no, ese mes arranca con su monto de siempre.`
              : `Si lo restas, se descuenta del presupuesto de ${monthLabel(proximo.slice(0, 7)).toLowerCase()}. Si no, ese mes arranca con su monto de siempre.`}
          </p>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex flex-col gap-2">
            <Btn onClick={() => responder(true)} disabled={saving} full>
              {sobra ? 'Llevar al próximo mes' : 'Restar al próximo mes'}
            </Btn>
            <Btn variant="ghost" onClick={() => responder(false)} disabled={saving} full>
              {sobra ? 'No pasarlo al próximo mes' : 'No restarlo al próximo mes'}
            </Btn>
          </div>

          <p className="text-center text-[12px] text-[var(--fz-ink-3)]">{index + 1} de {queue.length}</p>
        </div>
      </div>
    </div>
  )
}
