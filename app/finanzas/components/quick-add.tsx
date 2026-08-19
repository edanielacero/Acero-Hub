'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconArrowsExchange, IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, TxType } from '@/lib/finanzas/types'
import { availableFrom, consumesBalance, todayISO } from '@/lib/finanzas/transactions'
import { amountFromInput, decimalsFor, formatAmount, formatUSD, fromUsd, parseDecimalInput, roundFor, toUsd } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { CategoryGlyph, CategoryIcon } from './category-icon'
import { SignedAmount } from './amount'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { IconGasto, IconIngreso } from './flow-icon'
import { useQuickAddApi } from './quick-add-context'
import { Btn, DateField, ErrorNote, IconChip, Label, Segmented, TextArea, TextField } from './ui'

const LAST_ACCOUNT_KEY = 'fz:lastAccount'

// Mismos íconos que los tres botones de acción rápida de la Home (§ home.tsx
// <QuickAction>): el segmento de acá arriba es la misma elección, así que
// tiene que reconocerse igual de un vistazo.
const TYPE_OPTIONS: { value: TxType; label: string; icon: ReactNode }[] = [
  { value: 'gasto', label: 'Gasto', icon: <IconGasto size={15} stroke={2.2} /> },
  { value: 'ingreso', label: 'Ingreso', icon: <IconIngreso size={15} stroke={2.2} /> },
  { value: 'transferencia', label: 'Transferir', icon: <IconArrowsExchange size={15} stroke={2.2} /> },
]

const NEW_TITLES: Record<TxType, string> = {
  gasto: 'Nuevo gasto', ingreso: 'Nuevo ingreso', transferencia: 'Nueva transferencia',
}

export function QuickAdd() {
  const { open, editing, initialType, lockType, close } = useQuickAddApi()
  const { accounts, categories, rates, reload } = useFinanzas()

  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  const [type, setType] = useState<TxType>('gasto')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  // Si el usuario escribió el monto recibido a mano, la sugerencia deja de pisarlo.
  const [toAmountTouched, setToAmountTouched] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)

  // Al abrir: modo edición carga el movimiento; modo alta arranca en Gasto con
  // la última cuenta usada y el foco puesto en el monto.
  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setType(editing.type)
      setAmount(String(editing.amount))
      setToAmount(editing.to_amount != null ? String(editing.to_amount) : '')
      setToAmountTouched(true)
      setAccountId(editing.account_id)
      setToAccountId(editing.to_account_id ?? '')
      setCategoryId(editing.category_id ?? '')
      setDate(editing.date)
      setDescription(editing.description ?? '')

    } else {
      const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
      setType(initialType)
      setAmount('')
      setToAmount('')
      setToAmountTouched(false)
      setAccountId(active.some(a => a.id === last) ? last : (active[0]?.id ?? ''))
      setToAccountId('')
      setCategoryId('')
      setDate(todayISO())
      setDescription('')
    }
    const t = setTimeout(() => amountRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // `active` queda fuera de las dependencias a propósito: es un array nuevo
    // en cada recarga de cuentas, y al guardar un movimiento se recarga ANTES
    // de cerrar el sheet. Si estuviera acá, el formulario se reseteaba solo
    // mientras el usuario todavía lo estaba viendo. El valor capturado es el
    // del momento en que se abrió, que es exactamente el que corresponde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, initialType])

  // Si las cuentas todavía no habían llegado cuando se abrió el sheet, se
  // completa la cuenta por defecto en cuanto aparecen — sin pisar nada que el
  // usuario ya haya elegido.
  useEffect(() => {
    if (!open || accountId || active.length === 0) return
    const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
    setAccountId(active.some(a => a.id === last) ? last : active[0].id)
  }, [open, accountId, active])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  const hoy = todayISO()

  const from = active.find(a => a.id === accountId)
  const to = active.find(a => a.id === toAccountId)
  const crossCurrency = type === 'transferencia' && !!from && !!to && from.currency !== to.currency
  // 8 decimales si la cuenta es BTC, 2 en cualquier otra.
  const fromDecimals = decimalsFor(from?.currency)
  const toDecimals = decimalsFor(to?.currency)

  // Gastos y transferencias no pueden dejar la cuenta en negativo.
  const limita = consumesBalance(type) && !!from
  const disponible = from ? availableFrom(from.balance, editing, from.id) : 0
  const montoActual = amountFromInput(amount, { decimals: fromDecimals })
  const excede = limita && Number.isFinite(montoActual) && montoActual > disponible
  const sinFondos = limita && disponible <= 0

  /**
   * Lo que debería llegar según las tasas de hoy: origen → USD → destino.
   * Es una sugerencia, no una imposición: lo que se guarda es lo que realmente
   * llegó, que casi nunca coincide por las comisiones de conversión.
   */
  const sugerido = useMemo(() => {
    if (!crossCurrency || !from || !to) return null
    const value = amountFromInput(amount, { decimals: fromDecimals })
    if (!Number.isFinite(value) || value <= 0) return null
    return fromUsd(toUsd(value, from.currency, rates), to.currency, rates)
  }, [crossCurrency, from, to, amount, fromDecimals, rates])

  // Diferencia en USD entre lo que salió y lo que llegó: es la comisión real.
  const recibido = amountFromInput(toAmount, { decimals: toDecimals })
  const diferenciaUsd = useMemo(() => {
    if (!crossCurrency || !from || !to) return null
    const salida = amountFromInput(amount, { decimals: fromDecimals })
    if (!Number.isFinite(salida) || salida <= 0) return null
    if (!Number.isFinite(recibido) || recibido <= 0) return null
    return toUsd(recibido, to.currency, rates) - toUsd(salida, from.currency, rates)
  }, [crossCurrency, from, to, amount, recibido, fromDecimals, rates])

  // Mientras el usuario no escriba el monto recibido, se mantiene sincronizado
  // con la sugerencia a medida que cambia el monto que sale.
  useEffect(() => {
    if (!crossCurrency || toAmountTouched || sugerido == null) return
    setToAmount(String(sugerido))
  }, [sugerido, crossCurrency, toAmountTouched])

  const visibleCategories = useMemo(
    () => categories.filter(c => !c.archived && c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto')),
    [categories, type],
  )


  if (!open) return null

  // Vista previa para la confirmación de borrado — misma resolución de
  // título que usa <TxRow>, simplificada: acá no hace falta el reparto.
  const deletePreview = editing && (() => {
    const isTransfer = editing.type === 'transferencia'
    const category = categories.find(c => c.id === editing.category_id)
    const fromAcc = accounts.find(a => a.id === editing.account_id)
    const toAcc = accounts.find(a => a.id === editing.to_account_id)
    const title = isTransfer
      ? `${fromAcc?.name ?? 'Cuenta'} → ${toAcc?.name ?? 'Cuenta'}`
      : (editing.description || category?.name || 'Sin categoría')
    return { isTransfer, category, fromAcc, title }
  })()

  async function submit() {
    setError('')
    const value = amountFromInput(amount, { decimals: fromDecimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')
    if (!accountId) return setError('Elegí una cuenta')
    if (type === 'transferencia' && !toAccountId) return setError('Elegí la cuenta destino')
    if (limita && value > disponible) {
      return setError(
        `${from!.name} tiene ${formatAmount(disponible, from!.currency)} disponibles`,
      )
    }

    const payload: Record<string, unknown> = {
      type,
      date,
      account_id: accountId,
      amount: value,
      description: description.trim() || null,
    }
    if (type === 'transferencia') {
      payload.to_account_id = toAccountId
      payload.to_amount = crossCurrency ? recibido : null
      if (crossCurrency && (!Number.isFinite(recibido) || recibido <= 0)) {
        return setError(`Indicá cuánto llegó realmente a ${to?.name}`)
      }
    } else {
      payload.category_id = categoryId || null
    }

    setSaving(true)
    const res = await fetch(
      editing ? `/api/finanzas/transactions/${editing.id}` : '/api/finanzas/transactions',
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

    window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    await reload()
    close()
  }

  async function remove() {
    if (!editing) return
    setRemoving(true)
    const res = await fetch(`/api/finanzas/transactions/${editing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setRemoving(false)
      setConfirmDelete(false)
      return setError(data.error ?? 'No se pudo borrar')
    }
    // `removing` sigue en true hasta que reload() termina: si se apaga antes,
    // el slider se resetea solo (ver el efecto en <SlideToConfirm>) mientras
    // el sheet todavía está en pantalla, y se ve como un parpadeo justo antes
    // de cerrar.
    await reload()
    setRemoving(false)
    close()
  }

  // Con tipo fijado por un botón puntual, no hay selector que mostrar: el
  // título dice de qué se trata en su lugar.
  const title = editing ? 'Editar movimiento' : lockType ? NEW_TITLES[type] : 'Nuevo movimiento'

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={close} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        {/* Handle de arrastre: solo tiene sentido en el bottom sheet. */}
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h2>
          <button
            type="button" onClick={close} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* El selector solo aparece cuando hay algo que elegir: al editar
              (podés corregirte) o al entrar por un "+" genérico (tab bar
              móvil, "Nuevo" de Movimientos). Si el tipo ya vino fijado por un
              botón puntual —Gasto/Ingreso/Transferir en la Home— mostrarlo
              igual dejaba pasarte a otro tipo desde ahí, y entonces esos tres
              botones no eran más que un "+" con pasos extra (§3 feedback). */}
          {(!lockType || editing) && (
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          )}

          {/*
            El monto es lo primero y lo más grande: es el dato que siempre se
            escribe. La moneda va SIEMPRE a la izquierda, con el mismo ícono y
            el mismo tamaño — antes el símbolo saltaba de lado según la moneda
            ($ y Bs a la izquierda, USDT y BTC a la derecha, y encima con otro
            cuerpo de letra), así que el campo cambiaba de forma al elegir otra
            cuenta.
          */}
          <div className="flex items-center justify-center gap-3 py-3">
            <span className="flex items-center gap-2 shrink-0">
              {from
                ? <CurrencyIcon currency={from.currency} size={26} />
                : <span className="w-[26px] h-[26px] rounded-full bg-[var(--fz-surface-sunk)]" />}
              {/* Ancho fijo: USDT y USDC tienen 4 letras y USD/BOB/BTC 3, así que
                  sin esto el número arrancaba en un punto distinto según la
                  cuenta elegida — el mismo salto que se quería eliminar. */}
              <span className="w-[48px] text-[13px] font-bold text-[var(--fz-ink-3)] tracking-wide">
                {from?.currency ?? '—'}
              </span>
            </span>

            <input
              ref={amountRef}
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals: fromDecimals }))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Monto en ${from?.currency ?? ''}`}
              className={`fz-num w-full min-w-0 max-w-[190px] bg-transparent text-[40px] font-bold tracking-[-0.02em] leading-none outline-none placeholder:text-[var(--fz-ink-3)] ${excede ? 'text-[var(--fz-out-text)]' : ''}`}
            />
          </div>

          {limita && (
            <div className="flex items-center justify-center gap-3 -mt-2">
              <span className={`text-[13px] font-medium fz-num ${excede || sinFondos ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'}`}>
                Disponible {from ? formatAmount(disponible, from.currency) : '—'}
              </span>
              <button
                type="button"
                onClick={() => setAmount(String(roundFor(disponible, from!.currency)))}
                disabled={sinFondos}
                className="h-7 px-2.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-accent-tint)] text-[var(--fz-accent)] text-[12px] font-bold tracking-wide disabled:opacity-40 disabled:pointer-events-none"
              >
                MAX
              </button>
            </div>
          )}

          <div>
            <Label>{type === 'transferencia' ? 'Desde' : 'Cuenta'}</Label>
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {active.map(a => (
                <AccountCard
                  key={a.id}
                  account={a}
                  selected={a.id === accountId}
                  onClick={() => setAccountId(a.id)}
                />
              ))}
            </div>
            {/* Cuenta de inversión: este movimiento va a sumar al saldo pero no
                al gasto/ingreso del mes (§7.1 de contexto_finanzas.md) — el
                usuario tiene que verlo justo antes de guardar, no después. */}
            {type !== 'transferencia' && from?.is_investment && (
              <p className="mt-1.5 text-[12px] text-[var(--fz-accent)] px-0.5">
                {from.name} es de inversión — esto no cuenta como {type === 'gasto' ? 'gasto' : 'ingreso'} real del mes.
              </p>
            )}
          </div>

          {type === 'transferencia' ? (
            <>
              <div>
                <Label>Hacia</Label>
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {active.filter(a => a.id !== accountId).map(a => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      selected={a.id === toAccountId}
                      onClick={() => setToAccountId(a.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Solo entre monedas distintas: se guarda lo que REALMENTE llegó,
                  en vez de derivarlo de la tasa y mentir sobre la operación. */}
              {crossCurrency && (
                <div>
                  <Label>Cuánto llegó a {to?.name} ({to?.currency})</Label>
                  <TextField
                    value={toAmount}
                    onChange={e => {
                      setToAmountTouched(true)
                      setToAmount(parseDecimalInput(e.target.value, { decimals: toDecimals }))
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="fz-num"
                  />

                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    {/* La diferencia contra la tasa de referencia es, en la
                        práctica, lo que te cobró la plataforma. */}
                    {diferenciaUsd != null && Math.abs(diferenciaUsd) >= 0.01 ? (
                      <span className={`text-[12px] font-medium fz-num ${diferenciaUsd < 0 ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-in-text)]'}`}>
                        {diferenciaUsd < 0 ? 'Comisión ≈ ' : 'A favor ≈ '}
                        {formatUSD(Math.abs(diferenciaUsd))}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--fz-ink-3)]">
                        {sugerido != null ? 'Según la tasa de hoy' : 'Poné el monto que sale'}
                      </span>
                    )}

                    {toAmountTouched && sugerido != null && (
                      <button
                        type="button"
                        onClick={() => { setToAmountTouched(false); setToAmount(String(sugerido)) }}
                        className="text-[12px] font-semibold text-[var(--fz-accent)] shrink-0"
                      >
                        Usar {formatAmount(sugerido, to!.currency)}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <Label>Categoría</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {visibleCategories.map(c => (
                  <ChipButton
                    key={c.id}
                    selected={c.id === categoryId}
                    onClick={() => setCategoryId(c.id === categoryId ? '' : c.id)}
                    label={c.name}
                    icon={<CategoryGlyph slug={c.icon} />}
                  />
                ))}
                {visibleCategories.length === 0 && (
                  <p className="text-[13px] text-[var(--fz-ink-3)] py-2">
                    Todavía no hay categorías. Sembralas desde Ajustes.
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label>Fecha</Label>
            <DateField value={date} onChange={setDate} today={hoy} />
          </div>

          <div>
            <Label>Descripción</Label>
            <TextArea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcional — en qué fue, con quién, para qué"
              rows={3}
            />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving || excede || sinFondos} full>
              {saving ? 'Guardando…'
                : sinFondos ? 'Sin saldo disponible'
                : excede ? 'Supera el saldo'
                : editing ? 'Guardar cambios' : 'Guardar'}
            </Btn>
          </div>
        </div>
      </div>

      <DeleteConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar movimiento"
        confirming={removing}
      >
        {editing && deletePreview && (
          <DeletePreview
            icon={
              deletePreview.isTransfer
                ? <IconChip><IconArrowsExchange size={18} stroke={1.8} /></IconChip>
                : <CategoryIcon slug={deletePreview.category?.icon} name={deletePreview.title} />
            }
            title={deletePreview.title}
            subtitle={deletePreview.fromAcc?.name}
            amount={<SignedAmount value={editing.amount} currency={editing.currency} type={editing.type} />}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

/**
 * Elegir cuenta es elegir "de dónde sale la plata" — un pill con solo el
 * nombre no alcanza para eso, hace falta ver cuánto queda ahí antes de
 * tocarlo (feedback del usuario). El card se queda chico a propósito: bandera
 * + código de moneda arriba, nombre, disponible — nada que no haga falta
 * para decidir entre dos cuentas.
 */
function AccountCard({ account, selected, onClick }: {
  account: AccountWithBalance; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`shrink-0 w-[132px] rounded-[var(--fz-r-tile)] p-3 text-left border transition-colors ${
        selected
          ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <CurrencyIcon currency={account.currency} size={24} />
        <span className="text-[11px] font-bold text-[var(--fz-ink-3)] tracking-wide">{account.currency}</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold truncate">{account.name}</p>
      <p className="text-[12px] text-[var(--fz-ink-3)] fz-num truncate">
        {formatAmount(account.balance, account.currency)}
      </p>
    </button>
  )
}

function ChipButton({ label, icon, selected, onClick }: {
  label: string; icon?: ReactNode; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
        selected
          ? 'bg-[var(--fz-accent)] text-white'
          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
