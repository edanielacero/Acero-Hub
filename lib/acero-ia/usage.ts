import { type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_MONTHLY_LIMIT_USD } from './models'

interface UsageLimitCheck {
  allowed: boolean
  spent: number
  limit: number
  isUnlimited: boolean
}

export async function checkUsageLimit(
  supabase: SupabaseClient,
  userId: string,
  adminClient: SupabaseClient
): Promise<UsageLimitCheck> {
  let { data: limitRow } = await supabase
    .from('aia_usage_limits')
    .select('monthly_limit, limit_start, is_unlimited')
    .eq('user_id', userId)
    .single()

  if (!limitRow) {
    await adminClient.from('aia_usage_limits').insert({
      user_id: userId,
      monthly_limit: DEFAULT_MONTHLY_LIMIT_USD,
    })
    limitRow = { monthly_limit: DEFAULT_MONTHLY_LIMIT_USD, limit_start: new Date().toISOString(), is_unlimited: false }
  }

  if (limitRow.is_unlimited) {
    return { allowed: true, spent: 0, limit: limitRow.monthly_limit, isUnlimited: true }
  }

  const periodStart = getPeriodStart(limitRow.limit_start)

  const { data: logs } = await supabase
    .from('aia_usage_logs')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', periodStart.toISOString())

  const spent = (logs || []).reduce((sum, l) => sum + Number(l.cost_usd), 0)

  return {
    allowed: spent < limitRow.monthly_limit,
    spent,
    limit: limitRow.monthly_limit,
    isUnlimited: false,
  }
}

export async function logUsage(
  supabase: SupabaseClient,
  userId: string,
  data: {
    conversationId: string
    messageId?: string
    model: string
    tokensInput?: number
    tokensOutput?: number
    costUsd: number
  }
) {
  await supabase.from('aia_usage_logs').insert({
    user_id: userId,
    conversation_id: data.conversationId,
    message_id: data.messageId || null,
    model: data.model,
    tokens_input: data.tokensInput || 0,
    tokens_output: data.tokensOutput || 0,
    cost_usd: data.costUsd,
  })
}

function getPeriodStart(limitStart: string): Date {
  const start = new Date(limitStart)
  const now = new Date()
  const dayOfMonth = start.getDate()

  const periodStart = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (periodStart > now) {
    periodStart.setMonth(periodStart.getMonth() - 1)
  }
  return periodStart
}

export function getPeriodDates(limitStart: string) {
  const start = getPeriodStart(limitStart)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start, end }
}
