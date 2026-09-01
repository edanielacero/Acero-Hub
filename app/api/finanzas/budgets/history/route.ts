import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { loadBudgetHistory } from '@/lib/finanzas/load'
import { todayISO } from '@/lib/finanzas/transactions'

/**
 * El mes a mes de cada presupuesto: cuánto se presupuestó, cuánto se gastó y
 * cuánto sobró o se pasó.
 *
 * Ruta aparte y no un campo más de `/bootstrap`: es una pantalla que se abre
 * a propósito, y arrastrar dos años de meses en cada arranque de la app sería
 * pagar siempre por algo que se mira de vez en cuando.
 */
export async function GET(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El día del usuario, no el del servidor (Vercel corre en UTC) — igual que
  // en `GET /budgets`: de él depende cuál es el mes en curso.
  const today = new URL(request.url).searchParams.get('today') || todayISO()
  return NextResponse.json(await loadBudgetHistory(supabase, { userId, profileId }, today))
}
