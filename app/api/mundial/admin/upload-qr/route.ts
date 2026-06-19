import { createAdminClient, createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `qr/payment-qr.${ext}`
  const bytes = await file.arrayBuffer()

  const admin = createAdminClient()
  // Create bucket if it doesn't exist yet
  await admin.storage.createBucket('mundial', { public: true }).catch(() => {})

  const { error } = await admin.storage.from('mundial').upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('mundial').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
