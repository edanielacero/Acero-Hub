/**
 * Diagnóstico del puente Deno ↔ lib/finanzas.
 *
 * No toca datos ni manda nada. Solo importa la lógica de dominio copiada y la
 * ejecuta, para probar que el paso de build de `scripts/build-edge-shared.mjs`
 * produce algo que Deno realmente puede correr.
 *
 * Existe porque ese puente es el riesgo técnico del Sprint 9: si no funciona,
 * la arquitectura entera cambia. Mejor descubrirlo con esto que con los cinco
 * evaluadores encima.
 */
import { periodOf, statusOf } from '../_shared/finanzas/recurring.ts'
import { round2, toUsd } from '../_shared/finanzas/money.ts'
import { monthRange, todayISO } from '../_shared/finanzas/transactions.ts'
import { requireInterno } from '../_shared/internal-auth.ts'

Deno.serve((req) => {
  const rechazo = requireInterno(req)
  if (rechazo) return rechazo

  // Tres funciones de tres módulos distintos, para que la prueba cubra también
  // que los imports entre archivos copiados resuelven entre sí.
  const hoy = '2026-08-27'
  return new Response(JSON.stringify({
    ok: true,
    deno: Deno.version.deno,
    periodo: periodOf({ day_of_month: 5, frequency: 'mensual', month_of_year: null } as never, hoy),
    conversion: round2(toUsd(35, 'BOB', { BOB: 6.96 })),
    mes: monthRange(new Date(hoy + 'T12:00:00')),
    hoy_del_runtime: todayISO(),
    statusOf_importado: typeof statusOf === 'function',
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
