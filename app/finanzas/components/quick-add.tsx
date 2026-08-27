'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconArrowsExchange, IconPigMoney, IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, SavingsFlow, SavingsReason, TxType } from '@/lib/finanzas/types'
import { availableFrom, consumesBalance, savingsFlowForType, todayISO } from '@/lib/finanzas/transactions'
import { amountFromInput, decimalsFor, formatAmount, formatUSD, fromUsd, parseDecimalInput, round2, roundFor, toUsd } from '@/lib/finanzas/money'
import { periodStart } from '@/lib/finanzas/budgets'
import { budgetLineFor, useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { AmountField } from './amount-field'
import { CategoryGlyph, CategoryIcon } from './category-icon'
import { SignedAmount } from './amount'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { IconGasto, IconIngreso } from './flow-icon'
import { useQuickAddApi } from './quick-add-context'
import { Btn, DateField, ErrorNote, IconChip, Label, SearchField, Segmented, TextArea, TextField } from './ui'

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

/** Por qué se retira de un ahorro (Sprint 7, §7 de sprint_7_ahorro.md) — el
    "texto opcional" de la Ronda 3 es el campo Descripción de más abajo, no
    hace falta un segundo campo de texto libre para lo mismo. */
const REASON_OPTIONS: { value: SavingsReason; label: string }[] = [
  { value: 'emergencia', label: 'Emergencia real' },
  { value: 'meta_cumplida', label: 'Se cumplió la meta' },
  { value: 'cambio_planes', label: 'Cambio de planes' },
  { value: 'otro', label: 'Otro' },
]

export function QuickAdd() {
  const { open, editing, initialType, lockType, close } = useQuickAddApi()
  const { accounts, categories, rates, budgets, savings, reload } = useFinanzas()

  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])
  // Gasto e Ingreso dejan de ofrecer cuentas de inversión: un ajuste de valor
  // entra por "Actualizar valor" (§7.2 de contexto_finanzas.md), no por acá.
  // Transferencia no cambia — aportar o retirar plata real de una inversión
  // sigue siendo una transferencia legítima.
  const nonInvestment = useMemo(() => active.filter(a => !a.is_investment), [active])

  const [type, setType] = useState<TxType>('gasto')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  // Si el usuario escribió el monto recibido a mano, la sugerencia deja de pisarlo.
  const [toAmountTouched, setToAmountTouched] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [toAccountSearch, setToAccountSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  // Bloqueo de presupuesto (Sprint 6): se resetea al cambiar de categoría o de
  // tipo, para no arrastrar una ampliación pensada para OTRA categoría.
  const [extendBudget, setExtendBudget] = useState(false)
  const [extensionAmount, setExtensionAmount] = useState('')
  // Ahorro (Sprint 7): a qué ahorro corresponde un aporte o un retiro, y por
  // qué se retira. A diferencia de la ampliación de presupuesto, estos NO se
  // resetean al cambiar de cuenta o de tipo: los dos bloques solo se muestran
  // (y solo viajan en el payload) cuando el movimiento sigue siendo un aporte
  // o un retiro, así que un valor que quedó de una combinación anterior no
  // puede colarse — y conservarlo evita hacer re-elegir el mismo ahorro al
  // pasar, por ejemplo, de gasto a transferencia sobre la misma cuenta.
  const [savingsGoalId, setSavingsGoalId] = useState('')
  const [savingsReason, setSavingsReason] = useState<SavingsReason | ''>('')
  /** "Este movimiento involucra un ahorro": lo pedís vos, no se deduce. */
  const [gastarDeAhorros, setGastarDeAhorros] = useState(false)
  /** Solo para transferencias, donde el tipo no alcanza para saber la
      dirección. En gasto/ingreso lo fija `savingsFlowForType`. */

  const amountRef = useRef<HTMLInputElement>(null)

  // Al abrir: modo edición carga el movimiento; modo alta arranca en Gasto con
  // la última cuenta usada y el foco puesto en el monto.
  useEffect(() => {
    if (!open) return
    setError('')
    // Una ampliación preparada en una sesión anterior del sheet (se abrió, se
    // bloqueó, se tocó "Ampliar", se cerró sin guardar) no puede sobrevivir a
    // un reabrir — ni siquiera si la categoría y el tipo coinciden, que es
    // justo el caso que el efecto de abajo (keyed en categoryId/type) no
    // detecta como cambio.
    setExtendBudget(false)
    setExtensionAmount('')
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
      setSavingsGoalId(editing.savings_goal_id ?? '')
      setSavingsReason(editing.savings_reason ?? '')
      setGastarDeAhorros(!!editing.savings_goal_id)

    } else {
      const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
      const pool = initialType === 'transferencia' ? active : nonInvestment
      setType(initialType)
      setAmount('')
      setToAmount('')
      setToAmountTouched(false)
      setAccountId(pool.some(a => a.id === last) ? last : (pool[0]?.id ?? ''))
      setToAccountId('')
      setCategoryId('')
      setDate(todayISO())
      setDescription('')
      setSavingsGoalId('')
      setSavingsReason('')
      setGastarDeAhorros(false)
    }
    setAccountSearch('')
    setToAccountSearch('')
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
  // usuario ya haya elegido. `editing` afuera del guard: en edición la cuenta
  // ya la fija el efecto de arriba con `editing.account_id` directo — sin
  // este chequeo, abrir el sheet en modo edición ANTES de haber abierto nunca
  // uno en alta (accountId todavía '' en ese primer render) dejaba a los dos
  // efectos corriendo en la misma tanda, y este pisaba con un default lo que
  // el otro acababa de fijar bien.
  useEffect(() => {
    if (!open || editing || accountId || active.length === 0) return
    const pool = type === 'transferencia' ? active : nonInvestment
    if (pool.length === 0) return
    const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
    setAccountId(pool.some(a => a.id === last) ? last : pool[0].id)
  }, [open, editing, accountId, active, type, nonInvestment])

  // Si el tipo cambia a Gasto/Ingreso con una cuenta de inversión ya elegida
  // (por ejemplo, se venía armando una Transferencia), esa cuenta deja de ser
  // una opción visible — se resetea para no dejar una selección huérfana.
  // `editing` afuera del guard a propósito, no solo de las dependencias: en
  // edición NUNCA hay que reasignar la cuenta sola — sería mover en silencio
  // un movimiento ya guardado a otra cuenta porque el filtro no lo mostraba
  // lindo. Ahí el chip huérfano (si pasa) lo resuelve `accountOptions` más
  // abajo, no un reset.
  useEffect(() => {
    if (!open || editing || type === 'transferencia') return
    const current = active.find(a => a.id === accountId)
    if (!current?.is_investment) return
    const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
    setAccountId(nonInvestment.some(a => a.id === last) ? last : (nonInvestment[0]?.id ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, open, editing])

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

  // Cambiar de categoría o de tipo invalida cualquier ampliación ya
  // preparada: era para el presupuesto de OTRA categoría. Cambiar la fecha a
  // otro mes también: el bloqueo se apaga fuera del período vigente (ver
  // `dateInCurrentPeriod` más abajo), y una ampliación pensada para ESTE mes
  // no debería colarse silenciosa contra el que quede después del cambio.
  useEffect(() => {
    setExtendBudget(false)
    setExtensionAmount('')
  }, [categoryId, type, date])

  const hoy = todayISO()

  const from = active.find(a => a.id === accountId)
  const to = active.find(a => a.id === toAccountId)
  const crossCurrency = type === 'transferencia' && !!from && !!to && from.currency !== to.currency
  // Toda transferencia con origen y destino elegidos pregunta cuánto llegó:
  // entre monedas distintas es obligatorio (nadie puede adivinar la tasa real
  // que te dieron), y en la misma moneda es opcional — sirve para registrar la
  // comisión que se comió el banco.
  const conDestino = type === 'transferencia' && !!from && !!to
  // 8 decimales si la cuenta es BTC, 2 en cualquier otra.
  const fromDecimals = decimalsFor(from?.currency)
  const toDecimals = decimalsFor(to?.currency)

  // Gastos y transferencias no pueden dejar la cuenta en negativo.
  /**
   * Gastar de los ahorros es un MODO explícito, no algo que se deduzca.
   *
   * Una cuenta puede tener plata libre y plata apartada mezcladas. Por
   * defecto un gasto sale de la libre y **no puede tocar los ahorros**: el
   * tope y el botón MAX se calculan sobre la porción libre. Si de verdad
   * querés romper un ahorro, lo pedís con el botón — y recién ahí se elige
   * cuál y por qué, y el tope pasa a ser lo apartado.
   */
  const ahorradoEnCuenta = from?.savings_balance ?? 0
  const tieneAhorros = ahorradoEnCuenta > 0

  /**
   * Por acá un ahorro solo puede SALIR (Ronda 8).
   *
   * La plata **entra** a un ahorro por dos caminos, los dos deliberados y
   * periódicos: un fijo de ahorro y el reparto del cierre de mes. Ninguno de
   * los dos pasa por esta pantalla, y ninguno debería: aportar es una
   * decisión de plan, no el registro de algo que pasó.
   *
   * **Romper** un ahorro, en cambio, pasa en el momento y sin plan — una
   * emergencia, un cambio de idea — así que vive justo acá, dentro del gasto
   * que lo rompe.
   *
   * Y una transferencia común es solo plata cambiando de billetera: no toca
   * ningún ahorro. Para mover un ahorro de cuenta está "Mover de cuenta" en
   * la pantalla de Ahorros, que mueve lo apartado en las dos a la vez.
   */
  const savingsFlow: SavingsFlow | null = gastarDeAhorros ? savingsFlowForType(type) : null
  const isWithdrawal = savingsFlow === 'retiro'
  const mostrarAhorro = !!from && type === 'gasto' && tieneAhorros

  const limita = consumesBalance(type) && !!from
  const saldoUsable = from ? availableFrom(from.balance, editing, from.id) : 0
  // En modo ahorro el techo es lo apartado; si no, lo libre — nunca el saldo
  // entero, o un gasto común se comería los ahorros sin avisar.
  const disponible = !from
    ? 0
    : gastarDeAhorros && isWithdrawal
      ? Math.min(ahorradoEnCuenta, saldoUsable)
      : Math.max(0, roundFor(saldoUsable - ahorradoEnCuenta, from.currency))
  const montoActual = amountFromInput(amount, { decimals: fromDecimals })
  const excede = limita && Number.isFinite(montoActual) && montoActual > disponible
  const sinFondos = limita && disponible <= 0

  /**
   * Ahorro (Sprint 7, §4.5/§4.6): un aporte es plata ENTRANDO a un ahorro
   * (un `ingreso` en una cuenta de ahorro, o una `transferencia` cuyo
   * destino lo es); un retiro es plata SALIENDO (un `gasto`, o una
   * `transferencia` cuyo origen es de ahorro y el destino no). Entre dos
   * cuentas de ahorro no es ni lo uno ni lo otro — es reacomodar billeteras,
   * no afecta a ningún ahorro (§0.1.2 de sprint_7_ahorro.md).
   */
  // El ahorro ya elegido se mantiene visible aunque esté archivado — mismo
  // criterio que `accountOptions` con una cuenta que pasó a inversión después
  // de crearse el movimiento. Sin esto, editar un aporte viejo cuyo ahorro se
  // archivó no mostraba ningún chip marcado, aunque el dato siguiera guardado
  // y el server lo aceptara igual (§ assertSavingsGoal, allowArchived).
  /**
   * Los ahorros ofrecibles: los vivos **en la moneda del movimiento**.
   *
   * Sin el filtro, gastando en USDT aparecían también los ahorros en Bs — que
   * no podés estar tocando (feedback del 2026-08-26). Se filtra por la moneda
   * declarada del ahorro y no por "dónde hubo movimientos": un ahorro recién
   * creado no tiene ninguno y nunca aparecería.
   *
   * El ya elegido se mantiene visible aunque no pase el filtro (moneda
   * distinta, o archivado): editar un movimiento viejo no puede dejar sin
   * marcar lo que sí está guardado.
   */
  // Solo se retira, y siempre de la cuenta de origen: la moneda es la de ahí.
  const monedaMovimiento = from?.currency
  const activeGoals = useMemo(() => {
    const elegibles = savings.goals.filter(
      g => !g.archived && (!monedaMovimiento || g.input_currency === monedaMovimiento),
    )
    if (!savingsGoalId || elegibles.some(g => g.id === savingsGoalId)) return elegibles
    const elegido = savings.goals.find(g => g.id === savingsGoalId)
    return elegido ? [...elegibles, elegido] : elegibles
  }, [savings.goals, savingsGoalId, monedaMovimiento])

  /**
   * Bloqueo de presupuesto (Sprint 6, §4.6): aplica a cualquier GASTO con una
   * categoría que tiene línea propia — alta o edición. El general ya no es
   * una línea (es la suma de las categorías, ver `sumGeneral`), así que no
   * hay nada que "bloquear por el general": `budgetLineFor` solo resuelve
   * líneas de categoría.
   *
   * `budgetLine.available_usd` es SIEMPRE el disponible del período VIGENTE
   * (`loadBudgets` lo calcula así). Si la fecha elegida cae en otro mes, ese
   * número no dice nada sobre el mes al que el gasto en realidad va a sumar
   * — bloquear ahí sería comparar contra el presupuesto equivocado. Por eso
   * el bloqueo entero se apaga cuando `date` no es del período vigente.
   *
   * En edición, `available_usd` ya viene descontando el efecto ACTUAL del
   * movimiento que se está reemplazando (está guardado, cuenta en
   * `spent_usd`) — hay que devolvérselo antes de medir el monto nuevo, mismo
   * criterio que `availableFrom` ya aplica al saldo de la cuenta. Sin esto,
   * reabrir un gasto ya cargado para corregirle la descripción se leería
   * como "te pasás" por su propio monto de siempre. Pero esa devolución solo
   * vale si la fecha ORIGINAL del movimiento también era del período
   * vigente — si se estaba editando un gasto de otro mes (con o sin cambiar
   * la fecha), nunca estuvo descontado del disponible de este mes, y
   * devolvérselo igual acreditaría de más.
   *
   * Lo que hay que devolver no es `amount_usd` entero: si el gasto tiene
   * reparto, `gastoRealCategoria` ya lo contó neto de lo repartido
   * (`principal_usd` de cada deuda no condonada, §4.1). Devolver el bruto
   * completo acreditaría de más y dejaría pasar un monto que sí se pasa.
   */
  const currentPeriod = periodStart(hoy)
  const dateInCurrentPeriod = periodStart(date) === currentPeriod
  const budgetLine = type === 'gasto' && dateInCurrentPeriod ? budgetLineFor(budgets, categoryId || null) : undefined
  const montoUsd = from && Number.isFinite(montoActual) && montoActual > 0 ? toUsd(montoActual, from.currency, rates) : 0
  const editingOwnContribution =
    editing && editing.type === 'gasto' && editing.flow_type !== 'movimiento'
      && editing.category_id === (categoryId || null) && periodStart(editing.date) === currentPeriod
      ? round2(editing.amount_usd - (editing.debts ?? []).filter(d => !d.waived_at).reduce((s, d) => s + d.principal_usd, 0))
      : 0
  const budgetAvailableRaw = budgetLine?.available_usd ?? null
  const budgetAvailable = budgetAvailableRaw == null ? null : budgetAvailableRaw + editingOwnContribution
  const budgetExceeded = !!budgetLine && budgetAvailable != null && montoUsd > budgetAvailable
  const budgetNeeded = budgetExceeded ? round2(montoUsd - budgetAvailable!) : 0
  // El faltante se muestra y se escribe en la moneda de la línea, nunca en
  // USD. Se convierte con la tasa que la línea tiene CONGELADA, no con la de
  // hoy: así el "te pasás por X" queda a la misma tasa que el tope contra el
  // que se está comparando.
  const budgetNeededDisplay = budgetLine
    ? roundFor(budgetNeeded / (budgetLine.exchange_rate || 1), budgetLine.input_currency)
    : 0
  const budgetBlocked = budgetExceeded && !extendBudget

  /**
   * Lo que debería llegar según las tasas de hoy: origen → USD → destino.
   * Es una sugerencia, no una imposición: lo que se guarda es lo que realmente
   * llegó, que casi nunca coincide por las comisiones de conversión.
   */
  const sugerido = useMemo(() => {
    if (!conDestino || !from || !to) return null
    const value = amountFromInput(amount, { decimals: fromDecimals })
    if (!Number.isFinite(value) || value <= 0) return null
    // Misma moneda: lo esperable es que llegue lo mismo que salió, y el usuario
    // baja el número solo si hubo comisión.
    if (from.currency === to.currency) return value
    return fromUsd(toUsd(value, from.currency, rates), to.currency, rates)
  }, [conDestino, from, to, amount, fromDecimals, rates])

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
    if (!conDestino || toAmountTouched || sugerido == null) return
    setToAmount(String(sugerido))
  }, [sugerido, conDestino, toAmountTouched])

  /** La comisión en la MONEDA de origen, para una transferencia de misma
      moneda: ahí no hay conversión de por medio, así que expresarla en USD
      sería dar una vuelta innecesaria. */
  const comisionMismaMoneda = useMemo(() => {
    if (!conDestino || crossCurrency || !from) return null
    const salida = amountFromInput(amount, { decimals: fromDecimals })
    if (!Number.isFinite(salida) || salida <= 0) return null
    if (!Number.isFinite(recibido) || recibido <= 0) return null
    return roundFor(salida - recibido, from.currency)
  }, [conDestino, crossCurrency, from, amount, recibido, fromDecimals])

  /**
   * Las categorías del tipo actual, filtradas por el buscador.
   *
   * Mismo criterio que el picker de cuentas: la ya elegida se mantiene visible
   * aunque el filtro la excluya, o al escribir en el buscador desaparecía el
   * chip marcado y parecía que se había perdido la selección.
   */
  const visibleCategories = useMemo(() => {
    const delTipo = categories.filter(c => !c.archived && c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto'))
    const q = categorySearch.trim().toLowerCase()
    if (!q) return delTipo
    const filtradas = delTipo.filter(c => c.name.toLowerCase().includes(q))
    if (!categoryId || filtradas.some(c => c.id === categoryId)) return filtradas
    const elegida = delTipo.find(c => c.id === categoryId)
    return elegida ? [elegida, ...filtradas] : filtradas
  }, [categories, type, categorySearch, categoryId])

  const categoriasDelTipo = useMemo(
    () => categories.filter(c => !c.archived && c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto')).length,
    [categories, type],
  )

  const accountOptions = useMemo(() => {
    const pool = type === 'transferencia' ? active : nonInvestment
    // La cuenta ya elegida se mantiene visible aunque el filtro la excluya —
    // por ejemplo, al editar un gasto/ingreso viejo cuya cuenta se marcó como
    // inversión DESPUÉS de crearse ese movimiento. Sin esto, el chip
    // seleccionado desaparecía de la lista aunque `accountId` siguiera
    // apuntando ahí.
    const withSelected = accountId && !pool.some(a => a.id === accountId)
      ? [...pool, ...active.filter(a => a.id === accountId)]
      : pool
    return withSelected.filter(a => a.name.toLowerCase().includes(accountSearch.trim().toLowerCase()))
  }, [active, nonInvestment, type, accountId, accountSearch])
  const toAccountOptions = useMemo(
    () => active
      .filter(a => a.id !== accountId)
      .filter(a => a.name.toLowerCase().includes(toAccountSearch.trim().toLowerCase())),
    [active, accountId, toAccountSearch],
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
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')
    if (!accountId) return setError('Elige una cuenta')
    if (type === 'transferencia' && !toAccountId) return setError('Elige la cuenta destino')
    if (limita && value > disponible) {
      return setError(
        `${from!.name} tiene ${formatAmount(disponible, from!.currency)} disponibles`,
      )
    }
    if (budgetLine && budgetExceeded) {
      if (!extendBudget) {
        return setError(
          `Te pasas el presupuesto de ${budgetLine.name ?? budgetLine.category_names.join(', ')} por ${formatAmount(budgetNeededDisplay, budgetLine.input_currency)}`,
        )
      }
      const extra = amountFromInput(extensionAmount, { decimals: decimalsFor(budgetLine.input_currency) })
      if (!Number.isFinite(extra) || extra <= 0) return setError('Pon cuánto quieres ampliar')
      // Menos que el faltante no saca el gasto de "pasado" — la ampliación
      // tiene que cubrirlo entero, o el bloqueo no significaría nada.
      if (roundFor(extra, budgetLine.input_currency) < budgetNeededDisplay) {
        return setError(`La ampliación tiene que cubrir el faltante: ${formatAmount(budgetNeededDisplay, budgetLine.input_currency)}`)
      }
    }
    // Solo en modo "gastar de ahorros" hay algo que exigir.
    if (gastarDeAhorros) {
      if (!savingsGoalId) return setError('Elige de qué ahorro sale')
      if (!savingsReason) return setError('Elige por qué retiras del ahorro')
    }

    const payload: Record<string, unknown> = {
      type,
      date,
      account_id: accountId,
      amount: value,
      description: description.trim() || null,
    }
    // Siempre viaja en edición (para poder DESetiquetar mandando null); en un
    // alta solo si hay algo que decir.
    if (savingsGoalId || editing) {
      payload.savings_goal_id = gastarDeAhorros ? savingsGoalId : null
      payload.savings_flow = gastarDeAhorros ? savingsFlow : null
      payload.savings_reason = gastarDeAhorros ? savingsReason : null
    }
    if (type === 'transferencia') {
      payload.to_account_id = toAccountId
      if (crossCurrency) {
        if (!Number.isFinite(recibido) || recibido <= 0) {
          return setError(`Indica cuánto llegó realmente a ${to?.name}`)
        }
        payload.to_amount = recibido
      } else {
        // Misma moneda: solo se guarda si de verdad llegó MENOS, o sea si hubo
        // comisión. Igual al monto enviado es el caso normal y no hace falta
        // ensuciar la fila con un dato que no dice nada.
        if (Number.isFinite(recibido) && recibido > value) {
          return setError('En la misma moneda no puede llegar más de lo que salió')
        }
        payload.to_amount = Number.isFinite(recibido) && recibido > 0 && recibido !== value
          ? recibido
          : null
      }
    } else {
      payload.category_id = categoryId || null
      if (type === 'gasto' && extendBudget && budgetLine) {
        const extra = amountFromInput(extensionAmount, { decimals: decimalsFor(budgetLine.input_currency) })
        // `extra` está en la moneda de la línea (comodidad de escritura) — el
        // server lo recibe en USD, a la misma tasa congelada con la que se
        // midió el faltante.
        if (Number.isFinite(extra) && extra > 0) {
          payload.budget_extension_usd = round2(extra * (budgetLine.exchange_rate || 1))
        }
      }
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
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return setError(data.error ?? 'No se pudo guardar')
    }

    window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    await reload()

    // El gasto ya se guardó — no hay nada que reintentar acá. Si la
    // ampliación de presupuesto falló, avisar sin cerrar en vez de dejar la
    // categoría "pasada" sin ninguna explicación (§ POST /transactions).
    if (data.budget_extension_error) {
      return setError(`El gasto se guardó, pero no se pudo ampliar el presupuesto: ${data.budget_extension_error}`)
    }
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
              (podés corregirte) o al entrar por el "Nuevo" genérico de
              Movimientos. Si el tipo ya vino fijado por un botón puntual
              —Gasto/Ingreso/Transferir en la Home— mostrarlo igual dejaba
              pasarte a otro tipo desde ahí, y entonces esos tres botones no
              eran más que un "+" con pasos extra (§3 feedback). */}
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
          <AmountField
            inputRef={amountRef}
            value={amount}
            onChange={setAmount}
            currency={from?.currency ?? null}
            decimals={fromDecimals}
            exceeded={excede}
            available={limita && from ? disponible : undefined}
            onMax={setAmount}
            maxDisabled={sinFondos}
            footer={limita && from && ahorradoEnCuenta > 0 && !gastarDeAhorros ? (
              <>
                <span className={`text-[12.5px] font-medium fz-num min-w-0 truncate ${excede ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'}`}>
                  Disponible {formatAmount(disponible, from.currency)}
                  <span className="text-[var(--fz-ink-3)] font-normal">
                    {' '}· {formatAmount(ahorradoEnCuenta, from.currency)} en ahorros
                  </span>
                </span>
                <button
                  type="button"
                  disabled={sinFondos}
                  onClick={() => setAmount(String(roundFor(disponible, from.currency)))}
                  className="shrink-0 h-7 px-2.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[11.5px] font-bold tracking-wide text-[var(--fz-ink-2)] disabled:opacity-40 disabled:pointer-events-none"
                >
                  MÁX
                </button>
              </>
            ) : undefined}
          />

          <div>
            <Label>{type === 'transferencia' ? 'Desde' : 'Cuenta'}</Label>
            {active.length > 4 && (
              <div className="mb-2">
                <SearchField value={accountSearch} onChange={setAccountSearch} placeholder="Buscar cuenta…" />
              </div>
            )}
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {accountOptions.map(a => (
                <AccountCard
                  key={a.id}
                  account={a}
                  selected={a.id === accountId}
                  onClick={() => setAccountId(a.id)}
                />
              ))}
              {accountOptions.length === 0 && (
                <p className="text-[13px] text-[var(--fz-ink-3)] py-2">Ninguna cuenta coincide.</p>
              )}
            </div>
          </div>

          {type === 'transferencia' ? (
            <>
              <div>
                <Label>Hacia</Label>
                {active.length > 4 && (
                  <div className="mb-2">
                    <SearchField value={toAccountSearch} onChange={setToAccountSearch} placeholder="Buscar cuenta…" />
                  </div>
                )}
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {toAccountOptions.map(a => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      selected={a.id === toAccountId}
                      onClick={() => setToAccountId(a.id)}
                    />
                  ))}
                  {toAccountOptions.length === 0 && (
                    <p className="text-[13px] text-[var(--fz-ink-3)] py-2">Ninguna cuenta coincide.</p>
                  )}
                </div>
              </div>

              {/* Se guarda lo que REALMENTE llegó, en vez de derivarlo de la
                  tasa y mentir sobre la operación. Entre monedas distintas es
                  obligatorio; en la misma moneda es opcional y sirve para
                  anotar la comisión del banco. */}
              {conDestino && (
                <div>
                  <Label>
                    Cuánto llegó a {to?.name} ({to?.currency})
                    {!crossCurrency && <span className="font-normal text-[var(--fz-ink-3)]"> · opcional</span>}
                  </Label>
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
                    {comisionMismaMoneda != null && comisionMismaMoneda > 0 ? (
                      <span className="text-[12px] font-medium fz-num text-[var(--fz-out-text)]">
                        Comisión {formatAmount(comisionMismaMoneda, from!.currency)}
                      </span>
                    ) : diferenciaUsd != null && Math.abs(diferenciaUsd) >= 0.01 ? (
                      <span className={`text-[12px] font-medium fz-num ${diferenciaUsd < 0 ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-in-text)]'}`}>
                        {diferenciaUsd < 0 ? 'Comisión ≈ ' : 'A favor ≈ '}
                        {formatUSD(Math.abs(diferenciaUsd))}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--fz-ink-3)]">
                        {!crossCurrency
                          ? 'Bájalo solo si te cobraron comisión'
                          : sugerido != null ? 'Según la tasa de hoy' : 'Pon el monto que sale'}
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
              {/* Mismo umbral que el picker de cuentas: por debajo de cinco, el
                  buscador estorba más de lo que ayuda. */}
              {categoriasDelTipo > 4 && (
                <div className="mb-2">
                  <SearchField value={categorySearch} onChange={setCategorySearch} placeholder="Buscar categoría…" />
                </div>
              )}
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
                    {categorySearch.trim()
                      ? 'Ninguna categoría coincide.'
                      : 'Todavía no hay categorías. Sembralas desde Ajustes.'}
                  </p>
                )}
              </div>

              {budgetLine && budgetExceeded && (
                <div className="mt-3 rounded-[var(--fz-r-field)] bg-[var(--fz-out-tint)] p-3.5 flex flex-col gap-2.5">
                  <p className="text-[13px] font-medium text-[var(--fz-out-text)]">
                    Te pasas el presupuesto de {budgetLine.name ?? budgetLine.category_names.join(', ')} por {formatAmount(budgetNeededDisplay, budgetLine.input_currency)}
                  </p>
                  {!extendBudget ? (
                    <Btn
                      size="sm" variant="soft"
                      onClick={() => { setExtendBudget(true); setExtensionAmount(String(budgetNeededDisplay)) }}
                    >
                      Ampliar presupuesto
                    </Btn>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TextField
                        value={extensionAmount}
                        onChange={e => setExtensionAmount(parseDecimalInput(e.target.value, { decimals: decimalsFor(budgetLine.input_currency) }))}
                        inputMode="decimal"
                        aria-label={`Cuánto ampliar el presupuesto, en ${budgetLine.input_currency}`}
                        className="fz-num h-10 flex-1"
                      />
                      <button
                        type="button" onClick={() => setExtendBudget(false)}
                        className="text-[12px] font-semibold text-[var(--fz-ink-2)] shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Romper un ahorro se PIDE, no se deduce. Sin tocar esto, el gasto
              sale de la plata libre y los ahorros quedan intactos. Solo
              aparece si esta cuenta de verdad tiene plata apartada. */}
          {mostrarAhorro && (
            <div>
              <button
                type="button"
                onClick={() => {
                  const next = !gastarDeAhorros
                  setGastarDeAhorros(next)
                  if (!next) { setSavingsGoalId(''); setSavingsReason('') }
                }}
                aria-pressed={gastarDeAhorros}
                className={`w-full flex items-center justify-between gap-3 min-h-12 py-2 px-3.5 rounded-[var(--fz-r-field)] border transition-colors ${
                  gastarDeAhorros
                    ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
                    : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]'
                }`}
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold text-left">
                  <IconPigMoney size={18} stroke={1.8} />
                  Gastar de mis ahorros
                </span>
                <span className="text-[12px] font-bold shrink-0">{gastarDeAhorros ? 'Sí' : 'No'}</span>
              </button>
              <p className="mt-1.5 text-[12px] text-[var(--fz-ink-3)] px-0.5 fz-num">
                {gastarDeAhorros
                  ? `Sale de los ${formatAmount(ahorradoEnCuenta, from!.currency)} apartados: baja el ahorro.`
                  : `Tenés ${formatAmount(ahorradoEnCuenta, from!.currency)} apartados en ahorros — este gasto no los toca.`}
              </p>
            </div>
          )}

          {/* Una transferencia puede aportar o retirar: se pregunta, no se
              adivina. En gasto e ingreso el tipo ya lo dice. */}
          {gastarDeAhorros && (
            <div>
              <Label>¿De qué ahorro?</Label>
              {activeGoals.length === 0 ? (
                <p className="text-[13px] text-[var(--fz-ink-3)] py-2">
                  No tenés ahorros en {monedaMovimiento ?? from?.currency}.
                </p>
              ) : (
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {activeGoals.map(g => (
                    <ChipButton
                      key={g.id}
                      selected={g.id === savingsGoalId}
                      onClick={() => setSavingsGoalId(g.id)}
                      label={g.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {gastarDeAhorros && savingsGoalId && (
            <div>
              <Label>¿Por qué retiras?</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {REASON_OPTIONS.map(r => (
                  <ChipButton
                    key={r.value}
                    selected={r.value === savingsReason}
                    onClick={() => setSavingsReason(r.value)}
                    label={r.label}
                  />
                ))}
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
              placeholder={isWithdrawal ? 'Opcional — el detalle del retiro' : 'Opcional — en qué fue, con quién, para qué'}
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
            <Btn onClick={submit} disabled={saving || excede || sinFondos || budgetBlocked} full>
              {saving ? 'Guardando…'
                : sinFondos ? 'Sin saldo disponible'
                : excede ? 'Supera el saldo'
                : budgetBlocked ? 'Supera el presupuesto'
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
