import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: logs } = await admin
    .from('aia_usage_logs')
    .select('user_id, model, cost_usd, created_at')
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })

  const allLogs = logs || []
  const totalSpent = allLogs.reduce((s, l) => s + Number(l.cost_usd), 0)

  const byModel: Record<string, number> = {}
  const byUser: Record<string, number> = {}
  const dailyMap: Record<string, number> = {}

  for (const log of allLogs) {
    byModel[log.model] = (byModel[log.model] || 0) + Number(log.cost_usd)
    byUser[log.user_id] = (byUser[log.user_id] || 0) + Number(log.cost_usd)
    const day = log.created_at.slice(0, 10)
    dailyMap[day] = (dailyMap[day] || 0) + Number(log.cost_usd)
  }

  const daily = Object.entries(dailyMap)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const topUserIds = Object.entries(byUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id)

  const { data: userProfiles } = await admin
    .from('profiles')
    .select('id, name, email')
    .in('id', topUserIds.length > 0 ? topUserIds : ['none'])

  const profileMap = new Map((userProfiles || []).map(p => [p.id, p]))
  const topUsers = topUserIds.map(id => {
    const p = profileMap.get(id)
    return {
      userId: id,
      name: p?.name || p?.email || 'Usuario',
      spent: byUser[id],
      percentage: totalSpent > 0 ? Math.round((byUser[id] / totalSpent) * 100) : 0,
    }
  })

  const uniqueUsers = new Set(allLogs.map(l => l.user_id))

  const { count: totalConversations } = await admin
    .from('aia_conversations')
    .select('id', { count: 'exact', head: true })

  const { count: totalMessages } = await admin
    .from('aia_messages')
    .select('id', { count: 'exact', head: true })

  return NextResponse.json({
    totalSpent: Math.round(totalSpent * 10000) / 10000,
    activeUsers: uniqueUsers.size,
    totalConversations: totalConversations || 0,
    totalMessages: totalMessages || 0,
    byModel,
    daily,
    topUsers,
  })
}
