'use client'

import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { formatAmount, formatSigned, formatUSD, HIDDEN } from '@/lib/finanzas/money'
import type { Currency, TxType } from '@/lib/finanzas/types'
import { useFinanzas } from './data-context'

/** Monto simple, respetando el toggle global de ocultar. */
export function Amount({ value, currency, className = '' }: {
  value: number; currency: Currency; className?: string
}) {
  const { hidden } = useFinanzas()
  return (
    <span className={`fz-num ${className}`}>
      {hidden ? HIDDEN : formatAmount(value, currency)}
    </span>
  )
}

export function AmountUSD({ value, className = '' }: { value: number; className?: string }) {
  const { hidden } = useFinanzas()
  return <span className={`fz-num ${className}`}>{hidden ? HIDDEN : formatUSD(value)}</span>
}

/**
 * Monto de un movimiento: siempre con signo explícito además del color, para no
 * depender solo del color (§9 del documento de UI).
 */
export function SignedAmount({ value, currency, type, className = '' }: {
  value: number; currency: Currency; type: TxType; className?: string
}) {
  const { hidden } = useFinanzas()
  const color =
    type === 'gasto' ? 'text-[var(--fz-out-text)]'
    : type === 'ingreso' ? 'text-[var(--fz-in-text)]'
    : 'text-[var(--fz-ink-2)]'
  return (
    <span className={`fz-num font-semibold ${color} ${className}`}>
      {hidden ? HIDDEN : formatSigned(value, currency, type)}
    </span>
  )
}

export function HideToggle({ onDark = false }: { onDark?: boolean }) {
  const { hidden, toggleHidden } = useFinanzas()
  const Icon = hidden ? IconEyeOff : IconEye
  return (
    <button
      type="button"
      onClick={toggleHidden}
      aria-pressed={hidden}
      aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
      className={`grid place-items-center w-9 h-9 rounded-full transition-colors ${
        onDark
          ? 'bg-white/10 text-white/70 hover:text-white'
          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)]'
      }`}
    >
      <Icon size={18} stroke={1.8} />
    </button>
  )
}
