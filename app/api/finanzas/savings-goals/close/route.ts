import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { applySavingsClosure, loadSavingsClosureProposal } from '@/lib/finanzas/load'
import { isValidPeriod, periodStart } from '@/lib/finanzas/budgets'
import { todayISO } from '@/lib/finanzas/transactions'

/** La propuesta de reparto del período pendiente más viejo, si hay alguno. */
export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const today = new URL(request.url).searchParams.get('today') || todayISO()
  return NextResponse.json(await loadSavingsClosureProposal(supabase, userId, today))
}

/**
 * Confirma el cierre de un período — con la propuesta tal cual, o ajustada a
 * mano. `skip: true` decide no repartir nada ese mes (§4.4/Ronda 3).
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  if (!isValidPeriod(body.period)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })

  // Solo se reparte un mes que YA terminó. Sin este guard se podía cerrar el
  // mes en curso (repartiendo un sobrante todavía a medias) o directamente uno
  // futuro — y como `pendingSavingsPeriod` saltea los períodos ya cerrados, ese
  // mes nunca volvería a preguntarse cuando de verdad terminara.
  const today = typeof body.today === 'string' && body.today ? body.today : todayISO()
  if (body.period >= periodStart(today)) {
    return NextResponse.json({ error: 'Ese mes todavía no terminó' }, { status: 400 })
  }

  const allocations = Array.isArray(body.allocations)
    ? body.allocations
        .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a: Record<string, unknown>) => ({
          goal_id: typeof a.goal_id === 'string' ? a.goal_id : '',
          amount: num(a.amount, 0),
          from_account_id: typeof a.from_account_id === 'string' ? a.from_account_id : '',
          to_account_id: typeof a.to_account_id === 'string' ? a.to_account_id : '',
        }))
    : []

  if (!body.skip) {
    for (const a of allocations) {
      if (a.amount <= 0) continue
      if (!a.goal_id || !a.from_account_id || !a.to_account_id) {
        return NextResponse.json({ error: 'Cada línea del reparto necesita ahorro, cuenta de origen y de destino' }, { status: 400 })
      }
    }
  }

  const result = await applySavingsClosure(supabase, userId, {
    period: body.period, allocations, skip: Boolean(body.skip),
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ ok: true })
}
