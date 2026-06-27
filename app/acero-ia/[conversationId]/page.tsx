import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getSignedUrl } from '@/lib/acero-ia/image-utils'
import Chat from '../components/chat'

interface Props {
  params: Promise<{ conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: conversation } = await supabase
    .from('aia_conversations')
    .select('id, last_model_used, preset_id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) redirect('/acero-ia')

  let presetName: string | null = null
  if (conversation.preset_id) {
    const { data: preset } = await supabase
      .from('aia_presets')
      .select('name')
      .eq('id', conversation.preset_id)
      .single()
    presetName = preset?.name ?? null
  }

  const { data: messages } = await supabase
    .from('aia_messages')
    .select('id, role, content, model_used, image_ids')
    .eq('conversation_id', conversationId)
    .eq('is_regenerated', false)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  const admin = createAdminClient()

  const formattedMessages = await Promise.all(
    (messages || []).map(async (m) => {
      const base = {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        model_used: m.model_used,
      }

      const imageIds = m.image_ids as string[] | null
      if (imageIds && imageIds.length > 0) {
        const { data: img } = await supabase
          .from('aia_images')
          .select('storage_path, prompt, size, quality')
          .eq('id', imageIds[0])
          .single()

        if (img) {
          try {
            const url = await getSignedUrl(admin, img.storage_path)
            return {
              ...base,
              image: {
                url,
                prompt: img.prompt,
                size: img.size,
                quality: img.quality,
              },
            }
          } catch {
            return base
          }
        }
      }

      return base
    })
  )

  return (
    <Chat
      conversationId={conversationId}
      initialMessages={formattedMessages}
      lastModelUsed={conversation.last_model_used}
      initialPresetName={presetName}
    />
  )
}
