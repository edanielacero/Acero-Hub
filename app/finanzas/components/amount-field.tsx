'use client'

import { useRef, type ReactNode, type RefObject } from 'react'
import type { Currency } from '@/lib/finanzas/types'
import { formatAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { CurrencyIcon } from './currency-icon'

/**
 * El campo de monto, uno solo para toda la mini-app.
 *
 * Antes había **dos** tratamientos distintos: un display de 40px sin fondo en
 * el quick-add, "Actualizar valor" y el traslado de ahorros; y un `<TextField>`
 * común con su `<Label>Monto</Label>` en los otros siete formularios. El
 * usuario lo resumió bien: *"muy blanco, muy vacío y desigual"* — lo desigual
 * era literal, el mismo dato se pedía de dos formas según la pantalla.
 *
 * Diseño elegido (2026-08-26, "Display con aire"): el monto es el protagonista,
 * centrado sobre una superficie tintada, con el disponible y el botón MÁX
 * **dentro del mismo bloque** separados por un hairline. Un solo objeto visual
 * en vez de tres elementos sueltos que había que leer en orden.
 *
 * Cuando el monto excede lo disponible, el bloque entero pasa a tinte guindo:
 * el error no es una línea de texto que aparece abajo, es el campo cambiando de
 * color. Mismo par de tokens que usa el resto de la app para "sale plata"
 * (§ Semántica de dinero en `contexto_ui_finanzas.md`).
 */
export function AmountField({
  value,
  onChange,
  currency,
  decimals,
  autoFocus,
  disabled,
  exceeded,
  footer,
  available,
  availableLabel = 'Disponible',
  onMax,
  maxDisabled,
  ariaLabel,
  allowNegative,
  inputRef: externalRef,
}: {
  value: string
  onChange: (next: string) => void
  /** `null` mientras no haya cuenta elegida: se muestra el hueco, no un cero. */
  currency: Currency | null
  decimals: number
  autoFocus?: boolean
  disabled?: boolean
  /** Pinta el bloque en guindo. */
  exceeded?: boolean
  /** Pie libre — reemplaza al par disponible/MÁX cuando hace falta otra cosa. */
  footer?: ReactNode
  available?: number
  availableLabel?: string
  onMax?: (redondeado: string) => void
  maxDisabled?: boolean
  ariaLabel?: string
  /** "Actualizar valor" de una inversión sí acepta negativos: el mercado puede
      dejar una cuenta apalancada bajo cero. */
  allowNegative?: boolean
  /** Para enfocarlo desde afuera — el quick-add lo hace al abrirse. */
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = externalRef ?? ownRef

  const mostrarPie = footer != null || (available != null && currency != null)

  return (
    <div
      className={`rounded-[var(--fz-r-tile)] border transition-colors ${
        exceeded
          ? 'border-[color-mix(in_srgb,var(--fz-out)_35%,transparent)] bg-[var(--fz-out-tint)]'
          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
      }`}
    >
      {/* El monto. Se clickea todo el bloque para enfocar: un número centrado
          con aire alrededor no deja claro dónde está el cursor. */}
      <div
        className={`flex items-center justify-center gap-2.5 px-4 ${mostrarPie ? 'pt-5 pb-4' : 'py-5'}`}
        onClick={() => inputRef.current?.focus()}
      >
        <span className="flex items-center gap-2 shrink-0">
          {currency
            ? <CurrencyIcon currency={currency} size={26} />
            : <span className="w-[26px] h-[26px] rounded-full bg-[var(--fz-hairline)]" />}
          <span className={`text-[13px] font-bold tracking-wide ${exceeded ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-3)]'}`}>
            {currency ?? '—'}
          </span>
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(parseDecimalInput(e.target.value, { decimals, allowNegative }))}
          inputMode="decimal"
          placeholder="0"
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel ?? `Monto${currency ? ` en ${currency}` : ''}`}
          // `field-sizing: content` (Chrome/Safari 17+) encoge el input a lo
          // que ocupa el número, para que el conjunto ícono+moneda+monto quede
          // centrado como una unidad. Sin soporte cae al ancho máximo y el
          // número queda a la izquierda del centro, que es como se veía antes.
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          className={`fz-num min-w-[3ch] max-w-full bg-transparent text-[38px] font-bold tracking-[-0.02em] leading-none outline-none text-center placeholder:text-[var(--fz-ink-3)] disabled:opacity-50 ${
            exceeded ? 'text-[var(--fz-out-text)]' : ''
          }`}
        />
      </div>

      {mostrarPie && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 border-t ${
            exceeded ? 'border-[color-mix(in_srgb,var(--fz-out)_25%,transparent)]' : 'border-[var(--fz-hairline)]'
          }`}
        >
          {footer ?? (
            <>
              <span className={`text-[12.5px] font-medium fz-num min-w-0 truncate ${
                exceeded ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'
              }`}>
                {availableLabel} {formatAmount(available!, currency!)}
              </span>
              {onMax && (
                <button
                  type="button"
                  disabled={maxDisabled ?? available! <= 0}
                  onClick={() => onMax(String(roundFor(available!, currency!)))}
                  className="shrink-0 h-7 px-2.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[11.5px] font-bold tracking-wide text-[var(--fz-ink-2)] disabled:opacity-40 disabled:pointer-events-none"
                >
                  MÁX
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
