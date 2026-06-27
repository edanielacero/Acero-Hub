import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const size = searchParams.get('size')
  const quality = searchParams.get('quality')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('aia_images')
    .select('id, prompt, storage_path, size, quality, cost_usd, conversation_id, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (size) query = query.eq('size', size)
  if (quality) query = query.eq('quality', quality)

  query = query.range(offset, offset + limit - 1)

  const { data: images, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const admin = createAdminClient()
  const withUrls = await Promise.all(
    (images || []).map(async (img) => {
      try {
        const { data } = await admin.storage
          .from('acero-ia-images')
          .createSignedUrl(img.storage_path, 3600)
        return { ...img, cost_usd: Number(img.cost_usd), imageUrl: data?.signedUrl || null }
      } catch {
        return { ...img, cost_usd: Number(img.cost_usd), imageUrl: null }
      }
    })
  )

  return NextResponse.json({
    images: withUrls,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
