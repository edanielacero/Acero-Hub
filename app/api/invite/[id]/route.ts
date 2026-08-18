import { createAdminClient } from '@/lib/supabase-server'
import { requireApiAdmin } from '@/lib/access'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdmin()
  if (!gate.ok) return gate.response

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('invitations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
