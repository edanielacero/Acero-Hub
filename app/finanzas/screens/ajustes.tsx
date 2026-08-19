'use client'

import { useEffect, useState } from 'react'
import { IconArchive, IconCheck, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import type { Category, CategoryKind, Currency, PersonWithDebt } from '@/lib/finanzas/types'
import { CURRENCY_META, RATED_CURRENCIES } from '@/lib/finanzas/types'
import { PAIRS_FOR_CURRENCY, QUOTE_META } from '@/lib/finanzas/quotes'
import { amountFromInput, formatUSD, parseDecimalInput } from '@/lib/finanzas/money'
import { CurrencyIcon } from '../components/currency-icon'
import { CategoryIcon, IconPickerGrid } from '../components/category-icon'
import { useFinanzas } from '../components/data-context'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, Label, Panel, PersonAvatar, SectionTitle, SelectField, TextField } from '../components/ui'

/** "hace 3 min" es más útil que un timestamp para saber si una tasa está fresca. */
function relativo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.round(mins / 60)
  if (hs < 24) return `hace ${hs} h`
  return `hace ${Math.round(hs / 24)} d`
}

export function AjustesScreen() {
  const { categories, people, rates, rateList, reload } = useFinanzas()

  const [draftRates, setDraftRates] = useState<Partial<Record<Currency, string>>>({})
  const [savingRate, setSavingRate] = useState<Currency | null>(null)
  const [savedRate, setSavedRate] = useState<Currency | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<CategoryKind>('gasto')
  const [newIcon, setNewIcon] = useState<string | null>(null)
  const [newIconOpen, setNewIconOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const [newPerson, setNewPerson] = useState('')

  useEffect(() => {
    setDraftRates(Object.fromEntries(RATED_CURRENCIES.map(c => [c, String(rates[c] ?? CURRENCY_META[c].defaultRate)])))
  }, [rates])

  async function patchRate(currency: Currency, body: Record<string, unknown>) {
    setError('')
    setSavingRate(currency)
    const res = await fetch('/api/finanzas/rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, ...body }),
    })
    setSavingRate(null)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar la tasa')
    }
    await reload()
    setSavedRate(currency)
    setTimeout(() => setSavedRate(null), 2000)
  }

  async function saveManualRate(currency: Currency) {
    const value = amountFromInput(draftRates[currency] ?? '', { decimals: 8 })
    if (!Number.isFinite(value) || value <= 0) return setError('La tasa debe ser mayor a cero')
    await patchRate(currency, { rate: value, auto: false })
  }

  async function refreshNow() {
    setError('')
    setRefreshing(true)
    const res = await fetch('/api/finanzas/rates/refresh', { method: 'POST' })
    setRefreshing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudieron traer las cotizaciones')
    }
    await reload()
  }

  async function seed() {
    setError('')
    setSeeding(true)
    const res = await fetch('/api/finanzas/seed', { method: 'POST' })
    setSeeding(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo sembrar')
    }
    await reload()
  }

  async function addCategory() {
    setError('')
    if (!newName.trim()) return setError('La categoría necesita un nombre')

    const res = await fetch('/api/finanzas/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), kind: newKind, icon: newIcon }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }
    setNewName('')
    setNewIcon(null)
    setNewIconOpen(false)
    await reload()
  }

  async function patchCategory(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo actualizar')
    }
    await reload()
  }

  async function removeCategory(id: string) {
    setError('')
    const res = await fetch(`/api/finanzas/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  async function addPerson() {
    setError('')
    const name = newPerson.trim()
    if (!name) return setError('La persona necesita un nombre')

    const res = await fetch('/api/finanzas/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }
    setNewPerson('')
    await reload()
  }

  async function patchPerson(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo actualizar')
    }
    await reload()
  }

  async function removePerson(p: PersonWithDebt) {
    setError('')
    const res = await fetch(`/api/finanzas/people/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  const gastos = categories.filter(c => c.kind === 'gasto')
  const ingresos = categories.filter(c => c.kind === 'ingreso')


  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader title="Ajustes" subtitle="Tasas y categorías" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <SectionTitle
            action={
              <Btn size="sm" variant="soft" onClick={refreshNow} disabled={refreshing}>
                <IconRefresh size={16} stroke={2} />
                {refreshing ? 'Trayendo…' : 'Actualizar'}
              </Btn>
            }
          >
            Tipo de cambio
          </SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
            Se actualizan solas cuando abrís la app. Cada movimiento congela la tasa
            del momento en que lo registrás, así que esto <strong>no altera</strong> nada
            de lo ya guardado — solo cuánto vale hoy tu patrimonio.
          </p>

          <div className="flex flex-col gap-4">
            {RATED_CURRENCIES.map(c => {
              const meta = CURRENCY_META[c]
              const row = rateList.find(r => r.currency === c)
              const opciones = PAIRS_FOR_CURRENCY[c] ?? []
              const auto = row?.auto ?? true
              return (
                <div key={c} className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <CurrencyIcon currency={c} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{meta.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {row ? `${row.source} · ${relativo(row.updated_at)}` : meta.rateLabel}
                      </p>
                    </div>
                    <p className="text-[20px] font-bold fz-num shrink-0">
                      {(row?.rate ?? meta.defaultRate).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </p>
                  </div>

                  {/* El Bs es el único con dos cotizaciones posibles. */}
                  {auto && opciones.length > 1 && (
                    <div className="flex gap-2 mb-2">
                      {opciones.map(pair => (
                        <button
                          key={pair}
                          type="button"
                          onClick={() => patchRate(c, { quote_pair: pair, auto: true })}
                          aria-pressed={row?.quote_pair === pair}
                          className={`flex-1 h-9 rounded-[var(--fz-r-pill)] text-[12px] font-semibold transition-colors ${
                            row?.quote_pair === pair
                              ? 'bg-[var(--fz-accent)] text-white'
                              : 'bg-[var(--fz-surface)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                          }`}
                        >
                          {QUOTE_META[pair].hint}
                        </button>
                      ))}
                    </div>
                  )}

                  {auto ? (
                    <button
                      type="button"
                      onClick={() => patchRate(c, { auto: false })}
                      className="text-[12px] font-semibold text-[var(--fz-ink-3)] hover:text-[var(--fz-ink)]"
                    >
                      Fijar a mano
                    </button>
                  ) : (
                    <div className="flex flex-col min-[420px]:flex-row gap-2 min-[420px]:items-end">
                      <div className="flex-1 min-w-0">
                        <Label>{meta.rateLabel}</Label>
                        <TextField
                          value={draftRates[c] ?? ''}
                          onChange={e => setDraftRates(d => ({ ...d, [c]: parseDecimalInput(e.target.value, { decimals: 8 }) }))}
                          inputMode="decimal"
                          className="fz-num"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Btn onClick={() => saveManualRate(c)} disabled={savingRate === c} className="flex-1">
                          {savedRate === c ? <IconCheck size={18} stroke={2.2} /> : 'Guardar'}
                        </Btn>
                        <Btn variant="ghost" onClick={() => patchRate(c, { auto: true })}>Auto</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            action={
              categories.length === 0 ? (
                <Btn size="sm" variant="soft" onClick={seed} disabled={seeding}>
                  {seeding ? 'Sembrando…' : 'Sembrar categorías iniciales'}
                </Btn>
              ) : undefined
            }
          >
            Categorías
          </SectionTitle>

          <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[56px_1fr_150px_auto] items-end">
            <div>
              <Label>Ícono</Label>
              <button
                type="button"
                onClick={() => setNewIconOpen(v => !v)}
                aria-expanded={newIconOpen}
                aria-label="Elegir ícono"
                className="mx-auto min-[900px]:mx-0"
              >
                <CategoryIcon slug={newIcon} name={newName || '?'} size={48} />
              </button>
            </div>
            <div>
              <Label>Nombre</Label>
              <TextField
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nueva categoría"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <SelectField value={newKind} onChange={e => setNewKind(e.target.value as CategoryKind)}>
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </SelectField>
            </div>
            <Btn onClick={addCategory}><IconPlus size={18} stroke={2} /> Agregar</Btn>
          </div>

          {newIconOpen && (
            <div className="mt-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
              <IconPickerGrid
                value={newIcon}
                onChange={slug => { setNewIcon(slug); setNewIconOpen(false) }}
              />
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay categorías. Sembrá las 14 iniciales o creá la tuya.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2 mt-5">
              <CategoryList title="Gastos" items={gastos} onPatch={patchCategory} onRemove={removeCategory} />
              <CategoryList title="Ingresos" items={ingresos} onPatch={patchCategory} onRemove={removeCategory} />
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Personas</SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] -mt-2 mb-3">
            Con quiénes compartís gastos. Son etiquetas tuyas: nadie más las ve ni entra a la app.
          </p>

          <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[1fr_auto] items-end">
            <div>
              <Label>Nombre</Label>
              <TextField
                value={newPerson}
                onChange={e => setNewPerson(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addPerson() } }}
                placeholder="Ana"
              />
            </div>
            <Btn onClick={addPerson}><IconPlus size={18} stroke={2} /> Agregar</Btn>
          </div>

          {people.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay personas. También podés crearlas al vuelo desde el quick-add.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--fz-hairline)] mt-4">
              {people.map(p => (
                <div key={p.id} className={`flex items-center gap-3 py-2.5 ${p.archived ? 'opacity-50' : ''}`}>
                  <PersonAvatar name={p.name} size={36} />

                  <input
                    defaultValue={p.name}
                    onBlur={e => {
                      const next = e.target.value.trim()
                      if (next && next !== p.name) patchPerson(p.id, { name: next })
                    }}
                    aria-label={`Nombre de ${p.name}`}
                    className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none focus:underline decoration-[var(--fz-accent)] underline-offset-4"
                  />

                  {p.open_usd > 0 && (
                    <span className="shrink-0 text-[13px] font-semibold fz-num text-[var(--fz-out-text)]">
                      debe {formatUSD(p.open_usd)}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      // Archivar a alguien que todavía te debe es válido, pero
                      // conviene saberlo antes: la deuda no desaparece con la
                      // persona.
                      if (!p.archived && p.open_usd > 0 &&
                          !window.confirm(`${p.name} todavía te debe ${formatUSD(p.open_usd)}. ¿Archivar igual?`)) return
                      patchPerson(p.id, { archived: !p.archived })
                    }}
                    aria-label={p.archived ? 'Restaurar' : 'Archivar'}
                    title={p.archived ? 'Restaurar' : 'Archivar'}
                    className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]"
                  >
                    <IconArchive size={16} stroke={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePerson(p)}
                    aria-label="Borrar"
                    title={p.open_count > 0 ? 'Tiene historial: archivala en vez de borrarla' : 'Borrar'}
                    className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-out-tint)] hover:text-[var(--fz-out-text)]"
                  >
                    <IconTrash size={16} stroke={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function CategoryList({ title, items, onPatch, onRemove }: {
  title: string
  items: Category[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRemove: (id: string) => void
}) {
  // El ícono se edita en el lugar: tocar el chip abre la grilla justo debajo
  // de esa fila, y elegir cierra — no hay un modo edición aparte que mantener.
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-[var(--fz-ink-2)] mb-2">{title}</h3>
      <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
        {items.map(c => {
          const open = openId === c.id
          return (
            <div key={c.id} className={c.archived ? 'opacity-50' : ''}>
              <div className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  aria-expanded={open}
                  aria-label={`Cambiar ícono de ${c.name}`}
                  className="shrink-0"
                >
                  <CategoryIcon slug={c.icon} name={c.name} size={36} />
                </button>
                <input
                  defaultValue={c.name}
                  onBlur={e => {
                    const next = e.target.value.trim()
                    if (next && next !== c.name) onPatch(c.id, { name: next })
                  }}
                  aria-label={`Nombre de ${c.name}`}
                  className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none focus:underline decoration-[var(--fz-accent)] underline-offset-4"
                />
                <button
                  type="button"
                  onClick={() => onPatch(c.id, { archived: !c.archived })}
                  aria-label={c.archived ? 'Restaurar' : 'Archivar'}
                  title={c.archived ? 'Restaurar' : 'Archivar'}
                  className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]"
                >
                  <IconArchive size={16} stroke={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  aria-label="Borrar"
                  title="Borrar"
                  className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-out-tint)] hover:text-[var(--fz-out-text)]"
                >
                  <IconTrash size={16} stroke={1.8} />
                </button>
              </div>
              {open && (
                <div className="mb-3 ml-[48px] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
                  <IconPickerGrid
                    value={c.icon}
                    onChange={slug => { onPatch(c.id, { icon: slug }); setOpenId(null) }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
