'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import type { Frequency, RecurringWithState } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { SplitEditor, type SplitDraft, type SplitMode } from './split-editor'
import { Btn, ErrorNote, Label, Segmented, SelectField, TextField } from './ui'

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'mensual', label: 'Cada mes' },
  { value: 'anual', label: 'Cada año' },
]

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/** Crear o editar una plantilla de gasto fijo. */
export function RecurringSheet({ editing, onClose, onSaved }: {
  editing: RecurringWithState | null
  onClose: () => void
  onSaved: () => void
}) {
  const { accounts, categories, people, reload } = useFinanzas()
  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [accountId, setAccountId] = useState(editing?.account_id ?? active[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '')
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? 'mensual')
  const [day, setDay] = useState(String(editing?.day_of_month ?? 1))
  // Se trabaja en meses (YYYY-MM) y no en fechas: "desde marzo" es la pregunta,
  // el día ya lo define `day_of_month`.
  const [desde, setDesde] = useState(
    () => (editing?.starts_on ?? todayISO()).slice(0, 7),
  )
  const [month, setMonth] = useState(String(editing?.month_of_year ?? 1))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  const account = active.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency)

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

  async function submit() {
    setError('')
    if (!name.trim()) return setError('Ponele un nombre')
    if (!accountId) return setError('Elegí de qué cuenta sale')

    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')

    const payload: Record<string, unknown> = {
      name: name.trim(),
      emoji: emoji || null,
      amount: value,
      account_id: accountId,
      category_id: categoryId || null,
      frequency,
      day_of_month: Number(day) || 1,
      starts_on: `${desde}-01`,
      month_of_year: frequency === 'anual' ? Number(month) || 1 : null,
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
    setSaving(true)
    const res = await fetch(`/api/finanzas/recurring/${editing.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
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
          <div className="grid grid-cols-[70px_1fr] gap-2">
            <div>
              <Label>Emoji</Label>
              <TextField
                value={emoji}
                onChange={e => setEmoji(e.target.value.slice(0, 2))}
                placeholder="📱"
                className="text-center"
              />
            </div>
            <div>
              <Label>Nombre</Label>
              <TextField value={name} onChange={e => setName(e.target.value)} placeholder="Spotify" />
            </div>
          </div>

          <div>
            <Label>Monto {account ? `(${account.currency})` : ''}</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="0.00" className="fz-num"
            />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              Es el valor por defecto. Lo podés cambiar al registrar cada mes.
            </p>
          </div>

          <div>
            <Label>Sale de</Label>
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {active.map(a => (
                <button
                  key={a.id} type="button" onClick={() => setAccountId(a.id)}
                  aria-pressed={a.id === accountId}
                  className={`shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    a.id === accountId
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  <CurrencyIcon currency={a.currency} size={18} />
                  {a.name}
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
                  className={`shrink-0 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    c.id === categoryId
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  {`${c.emoji ?? ''} ${c.name}`.trim()}
                </button>
              ))}
            </div>
          </div>

          <Segmented options={FREQ_OPTIONS} value={frequency} onChange={setFrequency} />

          <div>
            <Label>Empezar desde</Label>
            <TextField type="month" value={desde} onChange={e => setDesde(e.target.value)} />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              {desde > todayISO().slice(0, 7)
                ? 'Todavía no arranca: no te lo va a pedir hasta ese mes.'
                : desde < todayISO().slice(0, 7)
                  ? 'Vas a poder registrar también los meses que ya pasaron, de a uno.'
                  : 'Arranca este mes.'}
            </p>
          </div>

          <div className={`grid gap-2 ${frequency === 'anual' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {frequency === 'anual' && (
              <div>
                <Label>Mes</Label>
                <SelectField value={month} onChange={e => setMonth(e.target.value)}>
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </SelectField>
              </div>
            )}
            <div>
              <Label>Día</Label>
              <SelectField value={day} onChange={e => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </SelectField>
              {Number(day) > 28 && (
                <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
                  En los meses más cortos cae el último día.
                </p>
              )}
            </div>
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
                amount={amount} currency={account?.currency}
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
              <Btn variant="danger" onClick={remove} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear fijo'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
