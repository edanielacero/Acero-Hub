import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

  const maxBytes = 10 * 1024 * 1024 // 10 MB
  if (file.size > maxBytes) return NextResponse.json({ error: 'Archivo demasiado grande (máx 10 MB)' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const bytes = await file.arrayBuffer()

  const admin = createAdminClient()
  await admin.storage.createBucket('mundial', { public: true }).catch(() => {})

  const { error } = await admin.storage.from('mundial').upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('mundial').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
