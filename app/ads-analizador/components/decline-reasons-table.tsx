'use client'

import { sumarDeclines } from '@/lib/ads-analizador/calc'
import { fmtEntero } from '@/lib/ads-analizador/format'
import type { PagoStripeDia } from '@/lib/ads-analizador/types'

/** Los decline codes de Stripe más comunes, en palabras. */
const MOTIVOS: Record<string, string> = {
  do_not_honor: 'El banco lo rechazó sin decir por qué',
  insufficient_funds: 'Fondos insuficientes',
  generic_decline: 'Rechazo genérico',
  card_declined: 'Tarjeta rechazada',
  expired_card: 'Tarjeta vencida',
  incorrect_cvc: 'CVC incorrecto',
  incorrect_number: 'Número de tarjeta incorrecto',
  lost_card: 'Tarjeta reportada perdida',
  stolen_card: 'Tarjeta reportada robada',
  fraudulent: 'Marcado como fraude',
  transaction_not_allowed: 'Transacción no permitida por el banco',
  card_not_supported: 'Tarjeta no admite este tipo de compra',
  currency_not_supported: 'La tarjeta no admite la moneda',
  authentication_required: 'Faltó la verificación 3D Secure',
  processing_error: 'Error del procesador',
  payment_intent_authentication_failure: 'Falló la verificación 3D Secure',
  pickup_card: 'El banco pidió retener la tarjeta',
  restricted_card: 'Tarjeta restringida',
  try_again_later: 'El banco pidió reintentar más tarde',
}

export function DeclineReasonsTable({ pagos }: { pagos: PagoStripeDia[] }) {
  const filas = sumarDeclines(pagos.map(p => p.declineReasons))
  const fallidos = pagos.reduce((s, p) => s + p.pagosFallidos, 0)
  const incompletos = pagos.reduce((s, p) => s + p.pagosIncompletos, 0)
  const exitosos = pagos.reduce((s, p) => s + p.comprasExitosas, 0)
  const tresDs = pagos.reduce((s, p) => s + p.tresDsSolicitados, 0)
  const tresDsOk = pagos.reduce((s, p) => s + p.tresDsExitosos, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Mini etiqueta="Exitosos" valor={fmtEntero(exitosos)} />
        <Mini etiqueta="Rechazados" valor={fmtEntero(fallidos)} />
        <Mini etiqueta="Abandonados" valor={fmtEntero(incompletos)} />
      </div>
      {tresDs > 0 && (
        <p className="text-sm text-[var(--ads-ink-2)]">
          3D Secure pedido {fmtEntero(tresDs)} veces, aprobado {fmtEntero(tresDsOk)}.
        </p>
      )}
      {filas.length === 0 ? (
        <p className="text-sm text-[var(--ads-ink-3)]">Sin rechazos en este rango.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--ads-ink-3)]">
              <th className="pb-2 font-medium">Motivo del rechazo</th>
              <th className="pb-2 text-right font-medium">Veces</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([motivo, n]) => (
              <tr key={motivo} className="border-t border-[var(--ads-hairline)]">
                <td className="py-2 pr-3">
                  {MOTIVOS[motivo] ?? motivo}
                  {MOTIVOS[motivo] && <span className="block text-xs text-[var(--ads-ink-3)]">{motivo}</span>}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{fmtEntero(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl bg-[var(--ads-surface-2)] px-3 py-2 ring-1 ring-inset ring-[var(--ads-hairline)]">
      <p className="text-xs text-[var(--ads-ink-2)]">{etiqueta}</p>
      <p className="text-lg font-semibold">{valor}</p>
    </div>
  )
}
