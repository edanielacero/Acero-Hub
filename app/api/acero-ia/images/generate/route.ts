import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { generateStoragePath, uploadImageToStorage, getSignedUrl, getImageCost } from '@/lib/acero-ia/image-utils'
import { AIA_MODELS, type ImageSize, type ImageQuality } from '@/lib/acero-ia/models'
import { checkUsageLimit, logUsage } from '@/lib/acero-ia/usage'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const VALID_SIZES: ImageSize[] = ['1024x1024', '1792x1024', '1024x1792']
const VALID_QUALITIES: ImageQuality[] = ['low', 'medium', 'high']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  const { conversationId, prompt, size: reqSize, quality: reqQuality } = body
  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt vacío' }, { status: 400 })

  const size: ImageSize = VALID_SIZES.includes(reqSize) ? reqSize : '1024x1024'
  const quality: ImageQuality = VALID_QUALITIES.includes(reqQuality) ? reqQuality : 'medium'

  const usageCheck = await checkUsageLimit(supabase, user.id, createAdminClient())
  if (!usageCheck.allowed) {
    return NextResponse.json({
      error: 'Límite de uso alcanzado',
      spent: usageCheck.spent,
      limit: usageCheck.limit,
    }, { status: 429 })
  }

  let convId = conversationId
  if (!convId) {
    const { data: conv, error } = await supabase
      .from('aia_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (error || !conv) return NextResponse.json({ error: 'Error creando conversación' }, { status: 500 })
    convId = conv.id
  } else {
    const { data: conv } = await supabase
      .from('aia_conversations')
      .select('id')
      .eq('id', convId)
      .eq('user_id', user.id)
      .single()
    if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  await supabase.from('aia_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: prompt.trim(),
  })

  try {
    const openai = getOpenAI()
    const response = await openai.images.generate({
      model: AIA_MODELS['gpt-image-2'].id,
      prompt: prompt.trim(),
      n: 1,
      size,
      quality,
    })

    const imageB64 = response.data?.[0]?.b64_json
    if (!imageB64) throw new Error('No image data returned')

    const imageBuffer = Buffer.from(imageB64, 'base64')
    const imageId = crypto.randomUUID()
    const storagePath = generateStoragePath(user.id, imageId)

    const admin = createAdminClient()
    await uploadImageToStorage(admin, storagePath, imageBuffer)

    const costUsd = getImageCost(size, quality)

    const { data: imageRecord } = await supabase
      .from('aia_images')
      .insert({
        id: imageId,
        user_id: user.id,
        conversation_id: convId,
        prompt: prompt.trim(),
        revised_prompt: response.data?.[0]?.revised_prompt || null,
        storage_path: storagePath,
        size,
        quality,
        cost_usd: costUsd,
      })
      .select('id')
      .single()

    const { data: assistantMsg } = await supabase
      .from('aia_messages')
      .insert({
        conversation_id: convId,
        role: 'assistant',
        content: `Imagen generada: "${prompt.trim()}"`,
        model_used: 'gpt-image-2',
        cost_usd: costUsd,
        image_ids: imageRecord ? [imageRecord.id] : [],
      })
      .select('id')
      .single()

    await supabase
      .from('aia_conversations')
      .update({ last_model_used: 'gpt-image-2', updated_at: new Date().toISOString() })
      .eq('id', convId)

    await logUsage(supabase, user.id, {
      conversationId: convId,
      messageId: assistantMsg?.id,
      model: 'gpt-image-2',
      costUsd: costUsd,
    })

    const signedUrl = await getSignedUrl(admin, storagePath)

    return NextResponse.json({
      conversationId: convId,
      messageId: assistantMsg?.id,
      imageId,
      imageUrl: signedUrl,
      prompt: prompt.trim(),
      revisedPrompt: response.data?.[0]?.revised_prompt,
      size,
      quality,
      costUsd,
    })
  } catch (err) {
    const errorContent = `Error generando imagen: ${err instanceof Error ? err.message : 'Error desconocido'}`

    await supabase.from('aia_messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: errorContent,
      model_used: 'gpt-image-2',
    })

    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Error generando imagen',
      conversationId: convId,
    }, { status: 500 })
  }
}
