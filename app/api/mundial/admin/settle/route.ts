import { createClient } from '@/lib/supabase-server'
import { settleDebts } from '@/lib/mundial/settle'
import { NextResponse } from 'next/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

export async function POST() {
  const admin_user = await verifyAdmin()
  if (!admin_user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const settled = await settleDebts()
  return NextResponse.json({ settled })
}
