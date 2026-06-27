import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { DEFAULT_MONTHLY_LIMIT_USD } from '@/lib/acero-ia/models'
import { getPeriodDates } from '@/lib/acero-ia/usage'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let { data: limitRow } = await supabase
    .from('aia_usage_limits')
    .select('monthly_limit, limit_start, is_unlimited')
    .eq('user_id', user.id)
    .single()

  if (!limitRow) {
    const admin = createAdminClient()
    await admin.from('aia_usage_limits').insert({
      user_id: user.id,
      monthly_limit: DEFAULT_MONTHLY_LIMIT_USD,
    })
    limitRow = {
      monthly_limit: DEFAULT_MONTHLY_LIMIT_USD,
      limit_start: new Date().toISOString(),
      is_unlimited: false,
    }
  }

  const { start: periodStart, end: periodEnd } = getPeriodDates(limitRow.limit_start)

  const { data: logs } = await supabase
    .from('aia_usage_logs')
    .select('model, tokens_input, tokens_output, cost_usd, created_at')
    .eq('user_id', user.id)
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })

  const allLogs = logs || []
  const totalSpent = allLogs.reduce((sum, l) => sum + Number(l.cost_usd), 0)

  const byModel: Record<string, number> = {}
  for (const log of allLogs) {
    byModel[log.model] = (byModel[log.model] || 0) + Number(log.cost_usd)
  }

  const dailyMap: Record<string, number> = {}
  for (const log of allLogs) {
    const day = log.created_at.slice(0, 10)
    dailyMap[day] = (dailyMap[day] || 0) + Number(log.cost_usd)
  }
  const daily = Object.entries(dailyMap)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const now = new Date()
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)))
  const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  const dailyRate = totalSpent / daysElapsed
  const projectedTotal = dailyRate * daysInPeriod

  let projectedLimitDate: string | null = null
  if (dailyRate > 0 && !limitRow.is_unlimited) {
    const daysToLimit = (limitRow.monthly_limit - totalSpent) / dailyRate
    if (daysToLimit > 0 && daysToLimit <= daysRemaining) {
      const limitDate = new Date(now.getTime() + daysToLimit * 24 * 60 * 60 * 1000)
      projectedLimitDate = limitDate.toISOString().slice(0, 10)
    }
  }

  const recentLogs = allLogs.slice(0, 20).map(l => ({
    model: l.model,
    tokensInput: l.tokens_input,
    tokensOutput: l.tokens_output,
    cost: Number(l.cost_usd),
    date: l.created_at,
  }))

  return NextResponse.json({
    spent: Math.round(totalSpent * 10000) / 10000,
    limit: limitRow.monthly_limit,
    isUnlimited: limitRow.is_unlimited,
    percentage: limitRow.is_unlimited ? 0 : Math.min(100, Math.round((totalSpent / limitRow.monthly_limit) * 100)),
    byModel,
    daily,
    recentLogs,
    daysRemaining,
    projectedTotal: Math.round(projectedTotal * 100) / 100,
    projectedLimitDate,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  })
}
