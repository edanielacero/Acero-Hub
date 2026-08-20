'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconArchive, IconChartLine, IconGripVertical, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, Currency } from '@/lib/finanzas/types'
import { CURRENCIES, CURRENCY_META } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, formatUSD, HIDDEN, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CurrencyIcon } from '../components/currency-icon'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, formatDayLabel, Label, Panel, RowMenu, SearchField, SectionTitle, TextField } from '../components/ui'

interface Draft {
  id?: string
  name: string
  currency: Currency
  initial_balance: string
  initial_balance_date: string
  is_investment: boolean
}

const emptyDraft = (): Draft => ({
  name: '',
  currency: 'USD',
  initial_balance: '',
  initial_balance_date: new Date().toISOString().slice(0, 10),
  is_investment: false,
})

export function CuentasScreen() {
  const { accounts, totalUsd, hidden, reload } = useFinanzas()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [viewing, setViewing] = useState<AccountWithBalance | null>(null)
  const [deleting, setDeleting] = useState<AccountWithBalance | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [search, setSearch] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState<Currency | 'todas'>('todas')
  // Solo las monedas que el usuario realmente tiene — no tiene sentido un chip
  // de BTC si nunca cargó una cuenta en BTC.
  const monedas = useMemo(() => Array.from(new Set(accounts.map(a => a.currency))), [accounts])
  const hayFiltro = !!search.trim() || currencyFilter !== 'todas'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter(a =>
      (currencyFilter === 'todas' || a.currency === currencyFilter) &&
      (!q || a.name.toLowerCase().includes(q)),
    )
  }, [accounts, search, currencyFilter])

  const visible = filtered.filter(a => !a.archived)
  const archived = filtered.filter(a => a.archived)

  /**
   * Orden optimista durante y justo después de un drag: sin esto, la fila
   * soltada rebotaría a su posición vieja mientras se espera la respuesta del
   * server y volvería a saltar a la nueva cuando `reload()` termina. Se pisa
   * con `null` en cuanto `accounts` ya trae el orden real, así que nunca queda
   * un estado local viejo compitiendo con el del server.
   */
  const [order, setOrder] = useState<string[] | null>(null)

  const orderedVisible = useMemo(() => {
    if (!order) return visible
    const byId = new Map(visible.map(a => [a.id, a]))
    const ordered = order.map(id => byId.get(id)).filter((a): a is AccountWithBalance => !!a)
    // Una cuenta que no estaba en el snapshot del drag (se creó justo en el
    // medio) no se pierde: se agrega al final en vez de desaparecer.
    const missing = visible.filter(a => !order.includes(a.id))
    return [...ordered, ...missing]
  }, [visible, order])

  const sensors = useSensors(
    // `distance: 6` deja que un tap normal (editar, abrir el menú) no dispare
    // un drag por 1px de temblor del dedo.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function save() {
    if (!draft) return
    setError('')
    if (!draft.name.trim()) return setError('La cuenta necesita un nombre')

    const payload = {
      name: draft.name.trim(),
      currency: draft.currency,
      initial_balance: draft.initial_balance === '' ? 0 : amountFromInput(draft.initial_balance, { allowNegative: true, decimals: decimalsFor(draft.currency) }),
      initial_balance_date: draft.initial_balance_date,
      is_investment: draft.is_investment,
    }

    setBusy(true)
    const res = await fetch(
      draft.id ? `/api/finanzas/accounts/${draft.id}` : '/api/finanzas/accounts',
      {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    setBusy(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }
    await reload()
    setDraft(null)
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/accounts/${id}`, {
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

  /** Soltar una cuenta en otro lugar de la lista reordena y persiste el orden
      completo — ver el comentario de `/api/finanzas/accounts/reorder` sobre
      por qué se manda la lista entera y no un intercambio de a pares. */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const ids = orderedVisible.map(a => a.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    const next = arrayMove(ids, oldIndex, newIndex)
    setOrder(next)
    setError('')

    const res = await fetch('/api/finanzas/accounts/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next }),
    })
    if (!res.ok) {
      setOrder(null)
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo reordenar')
    }
    await reload()
    setOrder(null)
  }

  async function remove(id: string) {
    setError('')
    const res = await fetch(`/api/finanzas/accounts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  async function confirmDelete() {
    if (!deleting) return
    setConfirming(true)
    await remove(deleting.id)
    setConfirming(false)
    setDeleting(null)
  }

  function openEdit(a: AccountWithBalance) {
    setError('')
    setDraft({
      id: a.id,
      name: a.name,
      currency: a.currency,
      initial_balance: String(a.initial_balance),
      initial_balance_date: a.initial_balance_date,
      is_investment: a.is_investment,
    })
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Cuentas"
        subtitle="Dónde está tu plata"
        action={
          <>
            <HideToggle />
            <Btn size="sm" onClick={() => { setDraft(emptyDraft()); setError('') }}>
              <IconPlus size={18} stroke={2} /> Nueva
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--fz-r-card)] bg-[var(--fz-hero)] p-6 text-white">
          <p className="text-[13px] font-medium text-white/60">Patrimonio total</p>
          <p className="mt-1 text-[30px] min-[400px]:text-[34px] font-bold tracking-[-0.02em] leading-none fz-num truncate">
            {hidden ? HIDDEN : formatUSD(totalUsd)}
          </p>
        </div>

        <ErrorNote>{error}</ErrorNote>

        {draft && (
          <Panel>
            <SectionTitle
              action={
                <button type="button" onClick={() => setDraft(null)} aria-label="Cancelar"
                  className="grid place-items-center w-8 h-8 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]">
                  <IconX size={16} stroke={1.8} />
                </button>
              }
            >
              {draft.id ? 'Editar cuenta' : 'Nueva cuenta'}
            </SectionTitle>

            {/* `grid-cols-1` no es redundante: sin él la grilla queda con una
                columna implícita `auto`, cuyo ancho lo fija el hijo de mayor
                min-content. El carrusel de monedas mide sus 5 chips enteros
                (~490px), así que la columna se estiraba a ese ancho y arrastraba
                a TODOS los campos fuera de la pantalla —y de paso el carrusel
                dejaba de scrollear, porque ya le entraba todo. `grid-cols-1` es
                `minmax(0,1fr)`: mínimo 0, y la columna vuelve a valer el ancho
                de la card. */}
            <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
              <div className="min-[900px]:col-span-2">
                <Label>Nombre</Label>
                <TextField
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Airtm, Efectivo, Banco…"
                  autoFocus
                />
              </div>
              <div className="min-[900px]:col-span-2">
                <Label>Moneda</Label>
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {CURRENCIES.map(c => {
                    const selected = draft.currency === c
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft({ ...draft, currency: c })}
                        aria-pressed={selected}
                        className={`shrink-0 flex items-center gap-2 h-12 pl-2 pr-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold transition-colors ${
                          selected
                            ? 'bg-[var(--fz-accent)] text-white'
                            : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                        }`}
                      >
                        <CurrencyIcon currency={c} size={28} />
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <Label>Saldo inicial</Label>
                <TextField
                  value={draft.initial_balance}
                  onChange={e => setDraft({ ...draft, initial_balance: parseDecimalInput(e.target.value, { allowNegative: true, decimals: decimalsFor(draft.currency) }) })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="fz-num"
                />
              </div>
              <div className="min-[900px]:col-span-2">
                <Label>Fecha del saldo inicial</Label>
                <TextField
                  type="date"
                  value={draft.initial_balance_date}
                  onChange={e => setDraft({ ...draft, initial_balance_date: e.target.value })}
                />
              </div>
              <div className="min-[900px]:col-span-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, is_investment: !draft.is_investment })}
                  aria-pressed={draft.is_investment}
                  className={`w-full flex items-center justify-between gap-3 h-12 px-3.5 rounded-[var(--fz-r-field)] border transition-colors ${
                    draft.is_investment
                      ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
                      : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <IconChartLine size={18} stroke={1.8} />
                    Cuenta de inversión
                  </span>
                  <span className="text-[12px] font-bold">{draft.is_investment ? 'Sí' : 'No'}</span>
                </button>
                {/* Broker, cripto en cuenta propia, lo que se sume después: el
                    valor sube y baja por el mercado, no porque entró o salió
                    plata real (§7.1 de contexto_finanzas.md). */}
                <p className="mt-1.5 text-[12px] text-[var(--fz-ink-3)] px-0.5">
                  Sus movimientos no cuentan como ingreso ni gasto real del mes.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Btn onClick={save} disabled={busy} full>
                {busy ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear cuenta'}
              </Btn>
            </div>
          </Panel>
        )}

        <Panel>
          <SectionTitle
            action={
              hayFiltro && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setCurrencyFilter('todas') }}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--fz-accent)]"
                >
                  <IconX size={14} stroke={2.4} /> Limpiar
                </button>
              )
            }
          >
            Activas
          </SectionTitle>

          {accounts.length > 0 && (
            <div className="flex flex-col gap-2 mb-3.5">
              <SearchField value={search} onChange={setSearch} placeholder="Buscar cuenta…" />
              {monedas.length > 1 && (
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  <button
                    type="button" onClick={() => setCurrencyFilter('todas')}
                    aria-pressed={currencyFilter === 'todas'}
                    className={`shrink-0 h-9 px-3.5 rounded-[var(--fz-r-pill)] text-[13px] font-semibold whitespace-nowrap transition-colors ${
                      currencyFilter === 'todas'
                        ? 'bg-[var(--fz-accent)] text-white'
                        : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                    }`}
                  >
                    Todas
                  </button>
                  {monedas.map(c => (
                    <button
                      key={c} type="button" onClick={() => setCurrencyFilter(c)}
                      aria-pressed={currencyFilter === c}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--fz-r-pill)] text-[13px] font-semibold whitespace-nowrap transition-colors ${
                        currencyFilter === c
                          ? 'bg-[var(--fz-accent)] text-white'
                          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                      }`}
                    >
                      <CurrencyIcon currency={c} size={16} />
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              {accounts.length === 0
                ? 'Todavía no hay cuentas. Creá la primera para empezar a registrar.'
                : 'Ninguna cuenta coincide con la búsqueda.'}
            </p>
          ) : hayFiltro ? (
            // Con un filtro activo el orden por arrastre no es confiable —
            // "soltar entre A y B" no significa nada cuando A y B dejaron de
            // ser vecinos reales de la lista completa. Se ve la misma card,
            // sin el handle, hasta que se limpia el filtro.
            <div className="flex flex-col gap-2.5">
              {visible.map(a => (
                <AccountRow
                  key={a.id}
                  account={a}
                  hidden={hidden}
                  sortable={false}
                  onView={() => setViewing(a)}
                  onEdit={() => openEdit(a)}
                  onArchive={() => patch(a.id, { archived: true })}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedVisible.map(a => a.id)} strategy={verticalListSortingStrategy}>
                {/* Cards con gap en vez de un `divide-y`: cada cuenta es su
                    propio bloque con borde + sombra propia, no una fila más
                    de una lista continua. */}
                <div className="flex flex-col gap-2.5">
                  {orderedVisible.map(a => (
                    <AccountRow
                      key={a.id}
                      account={a}
                      hidden={hidden}
                      sortable
                      onView={() => setViewing(a)}
                      onEdit={() => openEdit(a)}
                      onArchive={() => patch(a.id, { archived: true })}
                      onDelete={() => setDeleting(a)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Panel>

        {archived.length > 0 && (
          <Panel>
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              className="w-full flex items-center justify-between text-[15px] font-semibold"
            >
              Archivadas ({archived.length})
              <span className="text-[13px] font-medium text-[var(--fz-accent)]">
                {showArchived ? 'Ocultar' : 'Ver'}
              </span>
            </button>
            {showArchived && (
              <div className="flex flex-col gap-2.5 mt-3">
                {archived.map(a => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-[var(--fz-r-tile)] border border-[var(--fz-hairline)] bg-[var(--fz-surface)] px-3.5 py-3.5 shadow-[var(--fz-sh-rest)]"
                  >
                    <CurrencyIcon currency={a.currency} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold truncate text-[var(--fz-ink-2)]">{a.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {hidden ? HIDDEN : formatAmount(a.balance, a.currency)}
                      </p>
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => patch(a.id, { archived: false })}>
                      Restaurar
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Cuenta"
        onEdit={() => { const a = viewing!; setViewing(null); openEdit(a) }}
        onDelete={() => { const a = viewing!; setViewing(null); setDeleting(a) }}
      >
        {viewing && (
          <>
            <DeletePreview
              icon={<CurrencyIcon currency={viewing.currency} size={40} />}
              title={viewing.name}
              subtitle={CURRENCY_META[viewing.currency].name}
              amount={hidden ? HIDDEN : formatAmount(viewing.balance, viewing.currency)}
            />
            <div>
              <DetailField
                label="Saldo inicial"
                value={hidden ? HIDDEN : formatAmount(viewing.initial_balance, viewing.currency)}
              />
              <DetailField label="Desde" value={formatDayLabel(viewing.initial_balance_date, todayISO())} />
              {viewing.currency !== 'USD' && (
                <DetailField label="≈ USD" value={hidden ? HIDDEN : formatUSD(viewing.balance_usd)} />
              )}
              <DetailField
                label="Cuenta de inversión"
                value={viewing.is_investment ? 'Sí — sus movimientos no cuentan como ingreso/gasto' : 'No'}
              />
            </div>
          </>
        )}
      </DetailSheet>

      <DeleteConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminar cuenta"
        confirming={confirming}
      >
        {deleting && (
          <DeletePreview
            icon={<CurrencyIcon currency={deleting.currency} size={40} />}
            title={deleting.name}
            subtitle={CURRENCY_META[deleting.currency].name}
            amount={hidden ? HIDDEN : formatAmount(deleting.balance, deleting.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

function AccountRow({ account, hidden, sortable, onView, onEdit, onArchive, onDelete }: {
  account: AccountWithBalance
  hidden: boolean
  /** Falso mientras hay un buscador/filtro activo: sin handle, sin drag. */
  sortable: boolean
  onView: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  // Fuera de un <DndContext> (lista filtrada) el hook queda inerte: dnd-kit
  // provee un contexto default para justamente este caso, así que llamarlo
  // siempre acá adentro es seguro aunque `sortable` sea falso.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: account.id })

  const style: React.CSSProperties = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
      }
    : {}

  return (
    /*
      Composición prestada del hero de Home ("Patrimonio total": etiqueta
      chica, valor grande) pero invertida — acá lo grande es el NOMBRE de la
      cuenta, no el saldo. Por eso la card se apila en dos bloques en vez de
      ir en columnas como antes:
        1. Fila superior "de metadatos": handle + ícono a la izquierda,
           badge de inversión + RowMenu a la derecha — cada uno con su
           propio espacio, nada compitiendo por ancho con el nombre.
        2. Bloque tappable: nombre grande, subtítulo chico, y el saldo —
           más chico que el nombre a propósito — separado por una línea fina
           que lo marca como un dato aparte, no una continuación del texto.
      Todas las cards miden lo mismo porque cada línea siempre está presente
      (el saldo y el ≈USD van en la MISMA fila con items-baseline, así que
      la ausencia de equivalencia no le saca una línea entera a la card).
    */
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-[var(--fz-r-tile)] border border-[var(--fz-hairline)] bg-[var(--fz-surface)] p-4 transition-shadow ${
        isDragging ? 'shadow-[var(--fz-sh-float)]' : 'shadow-[var(--fz-sh-rest)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* El handle es el único punto de la card que arrastra — el resto
              sigue siendo tap normal para abrir el menú o editar, sin
              ambigüedad entre "quiero arrastrar" y "quiero tocar".
              `touch-none` evita que el navegador le dispute el gesto al
              scroll en móvil. */}
          {sortable && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reordenar ${account.name}`}
              className="grid place-items-center w-8 h-8 shrink-0 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] cursor-grab active:cursor-grabbing touch-none"
            >
              <IconGripVertical size={18} stroke={1.8} />
            </button>
          )}
          <CurrencyIcon currency={account.currency} size={36} />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Ya no compite con el nombre por ancho: tiene toda esta fila
              para sí, así que entra completo sin estrujarse. */}
          {account.is_investment && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]">
              <IconChartLine size={13} stroke={2.2} /> Inversión
            </span>
          )}
          <RowMenu
            items={[
              { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
              { label: 'Archivar', icon: <IconArchive size={16} stroke={1.8} />, onClick: onArchive },
              { label: 'Borrar', icon: <IconTrash size={16} stroke={1.8} />, onClick: onDelete, danger: true },
            ]}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onView}
        className="block w-full mt-3 -mx-2 px-2 py-1.5 text-left rounded-[var(--fz-r-field)] transition-colors hover:bg-[var(--fz-surface-sunk)] active:scale-[0.99]"
      >
        <p className="text-[20px] font-bold tracking-[-0.01em] truncate">{account.name}</p>
        <p className="mt-0.5 text-[12.5px] text-[var(--fz-ink-3)] truncate">
          {CURRENCY_META[account.currency].name} · inicial {hidden ? HIDDEN : formatAmount(account.initial_balance, account.currency)}
        </p>

        <div className="mt-3 pt-3 border-t border-[var(--fz-hairline)] flex items-baseline gap-2">
          <span className="text-[15px] font-semibold fz-num">
            {hidden ? HIDDEN : formatAmount(account.balance, account.currency)}
          </span>
          {account.currency !== 'USD' && !hidden && (
            <span className="text-[12px] text-[var(--fz-ink-3)] fz-num">
              ≈ {formatUSD(account.balance_usd)}
            </span>
          )}
        </div>
      </button>
    </div>
  )
}
