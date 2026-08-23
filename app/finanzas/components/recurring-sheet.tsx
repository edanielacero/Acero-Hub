'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { CURRENCIES } from '@/lib/finanzas/types'
import type { Currency, Frequency, RecurringWithState } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { dateFromFields, fieldsFromDate } from '@/lib/finanzas/recurring'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { CategoryGlyph, CategoryIcon, IconPickerGrid } from './category-icon'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { SplitEditor, type SplitDraft, type SplitMode } from './split-editor'
import { Btn, ErrorNote, Label, Segmented, TextField } from './ui'

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'mensual', label: 'Cada mes' },
  { value: 'anual', label: 'Cada año' },
]

/** Crear o editar una plantilla de gasto fijo. */
export function RecurringSheet({ editing, onClose, onSaved }: {
  editing: RecurringWithState | null
  onClose: () => void
  onSaved: () => void
}) {
  const { categories, people, reload } = useFinanzas()

  const [name, setName] = useState(editing?.name ?? '')
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null)
  const [iconOpen, setIconOpen] = useState(false)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? 'USD')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '')
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? 'mensual')
  // Un solo picker de fecha: empieza y vence son el mismo dato. Elegir el 31
  // de un mes largo ya alcanza para "último día de cada mes" — `periodOf` topa
  // `day_of_month` contra el largo real de cada mes futuro (28 en febrero, 30
  // en abril), así que no hace falta un toggle aparte para eso.
  const [fecha, setFecha] = useState(() => editing ? dateFromFields(editing) : todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)

  const [sharedOn, setSharedOn] = useState((editing?.splits.length ?? 0) > 0)
  const [drafts, setDrafts] = useState<SplitDraft[]>(
    () => (editing?.splits ?? []).map(sp => ({
      person_id: sp.person_id,
      name: people.find(p => p.id === sp.person_id)?.name ?? 'Persona',
      // Una parte pareja no tiene monto propio: se calcula al registrar.
      amount: sp.amount == null ? '' : String(sp.amount),
    })),
  )
  // Si todas las partes venían sin monto, el reparto es parejo.
  const [mode, setMode] = useState<SplitMode>(
    () => (editing?.splits ?? []).every(sp => sp.amount == null) ? 'igual' : 'manual',
  )

  const decimals = decimalsFor(currency)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const gastos = categories.filter(c => !c.archived && c.kind === 'gasto')

  // Anual compara por año (es lo único que `periodOf` usa de `starts_on` ahí);
  // mensual compara por mes — mismo criterio que antes tenía "Empezar desde".
  const [fy, fm, fd] = fecha.split('-').map(Number)
  const [hy, hm] = todayISO().slice(0, 7).split('-').map(Number)
  const futuro = frequency === 'anual' ? fy > hy : (fy > hy || (fy === hy && fm > hm))
  const pasado = frequency === 'anual' ? fy < hy : (fy < hy || (fy === hy && fm < hm))
  const periodoMsg = futuro
    ? 'Todavía no arranca: no te lo va a pedir hasta que llegue.'
    : pasado
      ? 'Vas a poder registrar también los períodos que ya pasaron, de a uno.'
      : frequency === 'anual' ? 'Arranca este año.' : 'Arranca este mes.'

  async function submit() {
    setError('')
    if (!name.trim()) return setError('Ponle un nombre')

    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')

    const payload: Record<string, unknown> = {
      name: name.trim(),
      icon,
      amount: value,
      currency,
      category_id: categoryId || null,
      frequency,
      ...fieldsFromDate(fecha, frequency),
      // En modo parejo el monto va en null: se recalcula con el precio de cada
      // mes, así una suba de Spotify se reparte sola.
      splits: sharedOn
        ? drafts.map(d => ({
            person_id: d.person_id,
            amount: mode === 'igual' ? null : amountFromInput(d.amount, { decimals }),
          }))
        : [],
    }

    setSaving(true)
    const res = await fetch(
      editing ? `/api/finanzas/recurring/${editing.id}` : '/api/finanzas/recurring',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }
    await reload()
    onSaved()
  }

  async function remove() {
    if (!editing) return
    setRemoving(true)
    const res = await fetch(`/api/finanzas/recurring/${editing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setRemoving(false)
      setConfirmDelete(false)
      return setError(data.error ?? 'No se pudo borrar')
    }
    // Se apaga `removing` recién después de reload(): antes, el slider se
    // resetearía solo mientras el sheet sigue en pantalla (ver el efecto de
    // <SlideToConfirm>), y se ve como un parpadeo justo antes de cerrar.
    await reload()
    setRemoving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={editing ? 'Editar fijo' : 'Nuevo fijo'}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            {editing ? 'Editar fijo' : 'Nuevo gasto fijo'}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="grid grid-cols-[56px_1fr] gap-2 items-end">
            <div>
              <Label>Ícono</Label>
              <button
                type="button"
                onClick={() => setIconOpen(v => !v)}
                aria-expanded={iconOpen}
                aria-label="Elegir ícono"
              >
                <CategoryIcon slug={icon} name={name || '?'} size={48} />
              </button>
            </div>
            <div>
              <Label>Nombre</Label>
              <TextField value={name} onChange={e => setName(e.target.value)} placeholder="Spotify" />
            </div>
          </div>

          {iconOpen && (
            <div className="-mt-2 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
              <IconPickerGrid
                value={icon}
                onChange={slug => { setIcon(slug); setIconOpen(false) }}
              />
            </div>
          )}

          <div>
            <Label>Monto ({currency})</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="0.00" className="fz-num"
            />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              Es el valor por defecto. Lo puedes cambiar al registrar cada mes.
            </p>
          </div>

          <div>
            <Label>Moneda</Label>
            {/* De qué cuenta sale se elige recién al registrar cada mes (§
                RegisterSheet) — acá solo hace falta saber en qué moneda está
                el monto, para el label y los decimales del campo. */}
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {CURRENCIES.map(c => (
                <button
                  key={c} type="button" onClick={() => setCurrency(c)}
                  aria-pressed={c === currency}
                  className={`shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    c === currency
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  <CurrencyIcon currency={c} size={18} />
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Categoría</Label>
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {gastos.map(c => (
                <button
                  key={c.id} type="button"
                  onClick={() => setCategoryId(c.id === categoryId ? '' : c.id)}
                  aria-pressed={c.id === categoryId}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    c.id === categoryId
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  <CategoryGlyph slug={c.icon} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <Segmented options={FREQ_OPTIONS} value={frequency} onChange={setFrequency} />

          <div>
            <Label>{frequency === 'anual' ? 'Primera vez que cae' : 'Empieza'}</Label>
            <TextField type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">{periodoMsg}</p>
            {/* El día se guarda tal cual — un 30 sigue siendo 30 en los meses que lo
                tienen. Solo febrero puede no tenerlo, así que el aviso es sobre eso,
                no sobre "esto va a ser siempre el último día en todos lados". */}
            {frequency === 'mensual' && fd >= 29 && (
              <p className="text-[12px] text-[var(--fz-ink-3)] mt-1">
                Si algún mes no llega a tener el día {fd}, ese mes cae en su último día.
              </p>
            )}
            {frequency === 'anual' && fm === 2 && fd === 29 && (
              <p className="text-[12px] text-[var(--fz-ink-3)] mt-1">
                Elegiste el 29 de febrero: en los años no bisiestos, va a caer el 28.
              </p>
            )}
          </div>

          <button
            type="button" onClick={() => setSharedOn(v => !v)} aria-pressed={sharedOn}
            className="flex items-center gap-3 h-11 px-3.5 rounded-[var(--fz-r-field)] bg-[var(--fz-surface-sunk)] border border-[var(--fz-hairline)] text-left"
          >
            <span
              aria-hidden
              className={`grid place-items-center w-5 h-5 rounded-[6px] border-2 text-white transition-colors ${
                sharedOn ? 'bg-[var(--fz-accent)] border-[var(--fz-accent)]' : 'border-[var(--fz-ink-3)]'
              }`}
            >
              {sharedOn && '✓'}
            </span>
            <span className="text-[15px] font-semibold flex-1">Lo comparto con alguien</span>
          </button>

          {sharedOn && (
            <>
              <SplitEditor
                drafts={drafts} setDrafts={setDrafts}
                mode={mode} setMode={setMode}
                amount={amount} currency={currency}
              />
              {mode === 'igual' && (
                <p className="text-[12px] text-[var(--fz-ink-3)] -mt-2">
                  En partes iguales el reparto se recalcula con el precio de cada mes:
                  si sube, a cada uno le toca un poco más sin que tengas que tocar nada.
                </p>
              )}
            </>
          )}

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear fijo'}
            </Btn>
          </div>
        </div>
      </div>

      <DeleteConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar fijo"
        confirming={removing}
      >
        {editing && (
          <DeletePreview
            icon={<CategoryIcon slug={editing.icon} name={editing.name} size={40} />}
            title={editing.name}
            subtitle={editing.frequency === 'anual' ? 'Cada año' : 'Cada mes'}
            amount={formatAmount(editing.amount, editing.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}
