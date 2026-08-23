'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { Currency, Person } from '@/lib/finanzas/types'
import { evenSplit, shareBreakdown } from '@/lib/finanzas/splits'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { PersonPicker } from './person-picker'
import { Label, Segmented } from './ui'

/** Una fila del reparto en el formulario. `amount` viaja como texto. */
export interface SplitDraft {
  person_id: string
  name: string
  amount: string
}

export type SplitMode = 'igual' | 'manual'

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'igual', label: 'Partes iguales' },
  { value: 'manual', label: 'Manual' },
]

export function SplitEditor({
  drafts, setDrafts, mode, setMode, amount, currency,
}: {
  drafts: SplitDraft[]
  setDrafts: (next: SplitDraft[]) => void
  mode: SplitMode
  setMode: (m: SplitMode) => void
  /** El monto total del gasto, como texto del campo principal. */
  amount: string
  currency: Currency | undefined
}) {
  const decimals = decimalsFor(currency)
  const total = amountFromInput(amount, { decimals })
  const cur = currency ?? 'USD'

  const selected = useMemo(() => drafts.map(d => d.person_id), [drafts])

  /**
   * En "Partes iguales" los montos se recalculan solos con el total y la
   * cantidad de participantes. Tu parte es el resto (`evenSplit`), así que los
   * centavos que no se pueden dividir quedan de tu lado.
   */
  const lastKey = useRef('')
  useEffect(() => {
    if (mode !== 'igual') {
      // Al salir de "iguales" se olvida la última clave. Si no, volver a
      // "iguales" después de tocar montos a mano no recalculaba nada — ni el
      // total ni la cantidad de gente habían cambiado, así que el guard de
      // abajo cortaba y los montos manuales quedaban pegados. El usuario se
      // quedaba trabado sin forma de deshacer su propia edición.
      lastKey.current = ''
      return
    }
    const key = `${total}|${drafts.length}|${cur}`
    if (key === lastKey.current) return
    lastKey.current = key

    if (drafts.length === 0 || !Number.isFinite(total) || total <= 0) return
    const { shares } = evenSplit(total, drafts.length + 1, cur)
    setDrafts(drafts.map((d, i) => ({ ...d, amount: String(shares[i] ?? 0) })))
    // `setDrafts` y `drafts` quedan fuera: el efecto se dispara por el total y
    // la cantidad de participantes, que es lo único que debe recalcular. Con
    // `drafts` adentro se relanzaría con cada tecla del modo manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, total, drafts.length, cur])

  const partes = drafts.map(d => ({ amount: amountFromInput(d.amount, { decimals }) || 0 }))
  const repartido = roundFor(partes.reduce((s, p) => s + p.amount, 0), cur)

  // Repartir de MÁS es válido: le cobrás a los otros un poco por encima del
  // costo y ganás la diferencia. Repartir de menos es invitar vos una parte.
  // Los dos casos son decisiones tuyas, no errores — así que acá no se bloquea
  // nada, solo se nombra lo que está pasando.
  const { mine: mia, kind } = Number.isFinite(total) && total > 0
    ? shareBreakdown(total, partes, cur)
    : { mine: 0, kind: 'exacto' as const }

  function toggle(person: Person) {
    const yaEsta = drafts.some(d => d.person_id === person.id)
    setDrafts(
      yaEsta
        ? drafts.filter(d => d.person_id !== person.id)
        : [...drafts, { person_id: person.id, name: person.name, amount: '' }],
    )
  }

  return (
    <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5 flex flex-col gap-3">
      <div>
        <Label>Entre</Label>
        <PersonPicker
          selected={selected}
          onToggle={toggle}
          onCreated={p => setDrafts([...drafts, { person_id: p.id, name: p.name, amount: '' }])}
        />
      </div>

      {drafts.length > 0 && (
        <>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />

          <div className="flex flex-col">
            {drafts.map((d, i) => (
              <div key={d.person_id} className="flex items-center gap-3 h-11">
                <span className="flex-1 text-[14px] font-medium truncate">{d.name}</span>
                {mode === 'manual' ? (
                  <input
                    value={d.amount}
                    onChange={e => {
                      const next = [...drafts]
                      next[i] = { ...d, amount: parseDecimalInput(e.target.value, { decimals }) }
                      setDrafts(next)
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Parte de ${d.name}`}
                    className="fz-num w-[110px] h-9 px-3 text-right rounded-[var(--fz-r-field)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[16px] font-semibold outline-none focus:border-[var(--fz-accent)]" 
                  />
                ) : (
                  <span className="fz-num text-[15px] font-semibold">
                    {formatAmount(amountFromInput(d.amount, { decimals }) || 0, cur)}
                  </span>
                )}
              </div>
            ))}

            {/* Tu parte se muestra pero no se edita: es la resta, no un dato.
                Si repartiste más de lo que costó, la resta da negativo y eso
                tiene un nombre: ganancia. */}
            <div className="flex items-center gap-3 h-11 border-t border-[var(--fz-hairline)] mt-1 pt-1">
              <span className="flex-1 text-[14px] font-semibold">
                {kind === 'ganas' ? 'Ganas' : 'Tu parte'}
              </span>
              <span
                className="fz-num text-[15px] font-bold"
                style={kind === 'ganas' ? { color: 'var(--fz-in-text)' } : undefined}
              >
                {formatAmount(Math.abs(mia), cur)}
              </span>
            </div>
          </div>

          {kind === 'ganas' && (
            <p className="text-[12px] font-medium" style={{ color: 'var(--fz-in-text)' }}>
              Estás cobrando {formatAmount(repartido, cur)} sobre un gasto de {formatAmount(total, cur)}.
            </p>
          )}
          {kind === 'exacto' && repartido > 0 && (
            <p className="text-[12px] text-[var(--fz-ink-3)]">
              El reparto cubre el gasto entero: no pones nada de tu bolsillo.
            </p>
          )}
        </>
      )}
    </div>
  )
}
