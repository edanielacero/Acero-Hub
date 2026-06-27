import { createClient, createAdminClient } from '@/lib/supabase-server'
import { createSSEStream, sseHeaders } from '@/lib/acero-ia/stream'
import { calculateTextCost } from '@/lib/acero-ia/cost-calculator'
import { AIA_MODELS, type TextModelKey } from '@/lib/acero-ia/models'
import { checkUsageLimit, logUsage } from '@/lib/acero-ia/usage'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const VALID_TEXT_MODELS: TextModelKey[] = ['haiku', 'sonnet', 'opus']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new Response('Body inválido', { status: 400 })
  const { conversationId, content, model: requestedModel, modelSuggested, userAccepted, presetId, regenerateMessageId, attachments } = body
  if (!content?.trim()) return new Response('Mensaje vacío', { status: 400 })

  const modelKey: TextModelKey = VALID_TEXT_MODELS.includes(requestedModel) ? requestedModel : 'haiku'

  const usageCheck = await checkUsageLimit(supabase, user.id, createAdminClient())
  if (!usageCheck.allowed) {
    return new Response(JSON.stringify({
      error: 'Límite de uso alcanzado',
      spent: usageCheck.spent,
      limit: usageCheck.limit,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }

  let convId = conversationId
  let convPresetId: string | null = presetId || null

  if (!convId) {
    const insertData: Record<string, unknown> = { user_id: user.id }
    if (presetId) insertData.preset_id = presetId

    const { data: conv, error } = await supabase
      .from('aia_conversations')
      .insert(insertData)
      .select('id')
      .single()
    if (error || !conv) return new Response('Error creando conversación', { status: 500 })
    convId = conv.id
  } else {
    const { data: conv } = await supabase
      .from('aia_conversations')
      .select('id, preset_id')
      .eq('id', convId)
      .eq('user_id', user.id)
      .single()
    if (!conv) return new Response('Conversación no encontrada', { status: 404 })
    convPresetId = conv.preset_id
  }

  if (regenerateMessageId) {
    await supabase
      .from('aia_messages')
      .update({ is_regenerated: true })
      .eq('id', regenerateMessageId)
      .eq('conversation_id', convId)
  } else {
    const userMsgData: Record<string, unknown> = {
      conversation_id: convId,
      role: 'user',
      content: content.trim(),
    }
    if (modelSuggested) userMsgData.model_suggested = modelSuggested
    if (typeof userAccepted === 'boolean') userMsgData.user_accepted = userAccepted

    const { error: userMsgErr } = await supabase
      .from('aia_messages')
      .insert(userMsgData)
      .select('id')
      .single()

    if (userMsgErr) return new Response('Error guardando mensaje', { status: 500 })
  }

  const { data: history } = await supabase
    .from('aia_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .eq('is_regenerated', false)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .limit(50)

  const messages: Anthropic.MessageParam[] = (history || [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  if (attachments?.length > 0 && messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'user') {
      const parts: Anthropic.ContentBlockParam[] = []
      for (const att of attachments) {
        if (att.isImage && att.storagePath) {
          const admin = createAdminClient()
          const { data } = await admin.storage.from('acero-ia-images').createSignedUrl(att.storagePath, 300)
          if (data?.signedUrl) {
            parts.push({ type: 'image', source: { type: 'url', url: data.signedUrl } })
          }
        } else if (att.extractedText) {
          parts.push({ type: 'text', text: `[Archivo: ${att.fileName}]\n${att.extractedText}` })
        }
      }
      parts.push({ type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' })
      lastMsg.content = parts
    }
  }

  let systemPrompt: string | undefined
  if (convPresetId) {
    const { data: preset } = await supabase
      .from('aia_presets')
      .select('system_prompt')
      .eq('id', convPresetId)
      .single()
    if (preset) systemPrompt = preset.system_prompt
  }

  const modelId = AIA_MODELS[modelKey].id
  const { stream, sendToken, sendDone, sendError, close } = createSSEStream()

  const respond = async () => {
    let fullContent = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      const response = await anthropic.messages.stream({
        model: modelId,
        max_tokens: modelKey === 'opus' ? 8192 : 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
      })

      for await (const event of response) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          sendToken(event.delta.text)
          fullContent += event.delta.text
        }
      }

      const finalMessage = await response.finalMessage()
      inputTokens = finalMessage.usage.input_tokens
      outputTokens = finalMessage.usage.output_tokens
    } catch (err) {
      sendError(err instanceof Error ? err.message : 'Error al generar respuesta')
      close()
      return
    }

    const costUsd = calculateTextCost(modelKey, inputTokens, outputTokens)

    const { data: assistantMsg } = await supabase
      .from('aia_messages')
      .insert({
        conversation_id: convId,
        role: 'assistant',
        content: fullContent,
        model_used: modelKey,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        cost_usd: costUsd,
      })
      .select('id')
      .single()

    await supabase
      .from('aia_conversations')
      .update({ last_model_used: modelKey, updated_at: new Date().toISOString() })
      .eq('id', convId)

    await logUsage(supabase, user.id, {
      conversationId: convId,
      messageId: assistantMsg?.id,
      model: modelKey,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      costUsd,
    })

    sendDone({
      messageId: assistantMsg?.id ?? '',
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      costUsd,
      model: modelKey,
    })

    const userMessageCount = (history || []).filter(m => m.role === 'user').length
    if (userMessageCount === 1) {
      generateTitle(convId, content.trim(), fullContent)
    }

    close()
  }

  respond().catch((err) => {
    sendError(err instanceof Error ? err.message : 'Error inesperado')
    close()
  })

  return new Response(stream, {
    headers: {
      ...sseHeaders(),
      'X-Conversation-Id': convId,
    },
  })
}

async function generateTitle(conversationId: string, userMessage: string, assistantResponse: string) {
  try {
    const summary = `user: ${userMessage.slice(0, 200)}\nassistant: ${assistantResponse.slice(0, 200)}`

    const response = await anthropic.messages.create({
      model: AIA_MODELS.haiku.id,
      max_tokens: 60,
      messages: [
        {
          role: 'user',
          content: `Genera un título corto (máximo 50 caracteres) para esta conversación. Responde SOLO con el título, sin comillas ni puntuación extra.\n\n${summary}`,
        },
      ],
    })

    const title = response.content[0].type === 'text'
      ? response.content[0].text.slice(0, 50).trim()
      : 'Nueva conversación'

    const admin = createAdminClient()
    await admin
      .from('aia_conversations')
      .update({ title })
      .eq('id', conversationId)
  } catch {
    // Title generation is non-critical
  }
}
