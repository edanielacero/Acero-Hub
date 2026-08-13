import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { supabase, userId, claims } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', userId).single()

  return NextResponse.json({ name: profile?.name || profile?.email?.split('@')[0] || 'ahí', email: profile?.email ?? claims?.email })
}
