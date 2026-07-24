import { compareTradesChrono, type ChronoTrade } from './chrono'

export interface CapitalTrade {
  id:            string
  date_entry:    string
  custom_fields: Record<string, unknown> | null | undefined
  created_at:    string
  pnl_usd:       number | null
}

export interface CapitalTransaction {
  id:         string
  type:       'deposit' | 'withdrawal'
  amount:     number
  date:       string
  created_at: string
}

export interface CapitalTimelinePoint {
  id:           string
  kind:         'trade' | 'transaction'
  date:         string
  delta:        number
  capitalAfter: number
}

interface CapitalEvent { id: string; kind: 'trade' | 'transaction'; chrono: ChronoTrade; delta: number }

function toEvents(trades: CapitalTrade[], transactions: CapitalTransaction[]): CapitalEvent[] {
  const tradeEvents: CapitalEvent[] = trades.map(t => ({
    id: t.id,
    kind: 'trade',
    chrono: { date_entry: t.date_entry, custom_fields: t.custom_fields, created_at: t.created_at },
    delta: t.pnl_usd ?? 0,
  }))
  const txEvents: CapitalEvent[] = transactions.map(t => ({
    id: t.id,
    kind: 'transaction',
    chrono: { date_entry: t.date, custom_fields: null, created_at: t.created_at },
    delta: t.type === 'deposit' ? t.amount : -t.amount,
  }))
  return [...tradeEvents, ...txEvents].sort((a, b) => compareTradesChrono(a.chrono, b.chrono))
}

// Serie cronológica: capital acumulado después de cada trade y cada depósito/retiro.
export function buildCapitalTimeline(
  capitalInitial: number, trades: CapitalTrade[], transactions: CapitalTransaction[],
): CapitalTimelinePoint[] {
  let running = capitalInitial
  return toEvents(trades, transactions).map(e => {
    running += e.delta
    return { id: e.id, kind: e.kind, date: e.chrono.date_entry, delta: e.delta, capitalAfter: running }
  })
}

// Tipos mínimos para las funciones que solo necesitan pnl_usd / monto — así los
// callers no tienen que armar un CapitalTrade/CapitalTransaction completo con campos que no usan.
interface PnlTrade { pnl_usd: number | null }
interface CapitalMovement { type: 'deposit' | 'withdrawal'; amount: number }

// Capital actual = inicial + pnl de los trades + depósitos − retiros.
// La suma es conmutativa: el total no depende del orden cronológico.
export function getCapitalActual(
  capitalInitial: number, trades: PnlTrade[], transactions: CapitalMovement[],
): number {
  const tradesPnl = trades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
  const txDelta   = transactions.reduce((s, t) => s + (t.type === 'deposit' ? t.amount : -t.amount), 0)
  return capitalInitial + tradesPnl + txDelta
}

// Rentabilidad % de los trades sobre el capital inicial. Nunca la mueven los depósitos/retiros.
export function getRentabilidadPct(capitalInitial: number, trades: PnlTrade[]): number | null {
  if (!capitalInitial) return null
  const tradesPnl = trades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
  return (tradesPnl / capitalInitial) * 100
}

// Capital disponible hasta el final de una fecha (inclusive, por día calendario).
// Usado para validar que un retiro no deje el capital en negativo a esa fecha.
export function getCapitalUpTo(
  capitalInitial: number,
  trades: (PnlTrade & { date_entry: string })[],
  transactions: (CapitalMovement & { date: string })[],
  date: string,
): number {
  const day = date.slice(0, 10)
  const tradesPnl = trades
    .filter(t => t.date_entry.slice(0, 10) <= day)
    .reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
  const txDelta = transactions
    .filter(t => t.date.slice(0, 10) <= day)
    .reduce((s, t) => s + (t.type === 'deposit' ? t.amount : -t.amount), 0)
  return capitalInitial + tradesPnl + txDelta
}
