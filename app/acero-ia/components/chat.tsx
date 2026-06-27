'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Message from './message'
import ChatInput, { type ChatInputHandle } from './chat-input'
import ModelSuggestion from './model-suggestion'
import { type ModelMode } from './model-selector'
import { type AttachmentData } from './attachment-preview'
import { usePreset, useUsage } from './shell'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  model_used: string | null
  image?: {
    url: string
    prompt: string
    size: string
    quality: string
  }
}

interface PendingSuggestion {
  content: string
  currentModel: string
  suggestedModel: string
  reason: string
  attachments?: AttachmentData[]
}

interface ChatProps {
  conversationId?: string
  initialMessages?: ChatMessage[]
  lastModelUsed?: string | null
  initialPresetName?: string | null
}

const EMPTY_MESSAGES: ChatMessage[] = []

export default function Chat({ conversationId, initialMessages, lastModelUsed, initialPresetName }: ChatProps) {
  const { selectedPreset } = usePreset()
  const { usage, refreshUsage } = useUsage()
  const msgs = initialMessages ?? EMPTY_MESSAGES
  const [messages, setMessages] = useState<ChatMessage[]>(msgs)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState(conversationId)
  const [modelMode, setModelMode] = useState<ModelMode>('auto')
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null)
  const [activeModel, setActiveModel] = useState<string | null>(lastModelUsed ?? null)
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageQuality, setImageQuality] = useState('medium')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)

  useEffect(() => {
    setMessages(initialMessages ?? EMPTY_MESSAGES)
    setCurrentConversationId(conversationId)
    setActiveModel(lastModelUsed ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, pendingSuggestion, scrollToBottom])

  const generateImage = useCallback(async (prompt: string, size: string, quality: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      model_used: null,
    }
    setMessages(prev => [...prev, userMessage])
    setIsGeneratingImage(true)

    const loadingMessage: ChatMessage = {
      id: 'image-loading',
      role: 'assistant',
      content: 'Generando imagen...',
      model_used: 'gpt-image-2',
    }
    setMessages(prev => [...prev, loadingMessage])

    try {
      const res = await fetch('/api/acero-ia/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: currentConversationId, prompt, size, quality }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error generando imagen')

      if (data.conversationId && !currentConversationId) {
        setCurrentConversationId(data.conversationId)
        window.history.replaceState(null, '', `/acero-ia/${data.conversationId}`)
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === 'image-loading'
            ? { ...m, id: data.messageId || crypto.randomUUID(), content: `Imagen generada: "${prompt}"`, image: { url: data.imageUrl, prompt, size, quality } }
            : m
        )
      )
      setActiveModel('gpt-image-2')
      refreshUsage()
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === 'image-loading'
            ? { ...m, id: crypto.randomUUID(), content: `Error: ${err instanceof Error ? err.message : 'No se pudo generar la imagen'}`, model_used: null, image: undefined }
            : m
        )
      )
    } finally {
      setIsGeneratingImage(false)
    }
  }, [currentConversationId, refreshUsage])

  const sendToChat = useCallback(async (
    content: string,
    model: string,
    options?: {
      suggestionData?: { modelSuggested: string; userAccepted: boolean }
      regenerateMessageId?: string
      attachments?: AttachmentData[]
    }
  ) => {
    setIsStreaming(true)

    const streamingMessage: ChatMessage = {
      id: 'streaming',
      role: 'assistant',
      content: '',
      model_used: model,
    }
    setMessages(prev => [...prev, streamingMessage])

    try {
      const res = await fetch('/api/acero-ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversationId,
          content,
          model,
          ...(!currentConversationId && selectedPreset ? { presetId: selectedPreset.id } : {}),
          ...(options?.suggestionData || {}),
          ...(options?.regenerateMessageId ? { regenerateMessageId: options.regenerateMessageId } : {}),
          ...(options?.attachments?.length ? { attachments: options.attachments } : {}),
        }),
      })

      if (!res.ok) throw new Error(await res.text())

      const newConvId = res.headers.get('X-Conversation-Id')
      if (newConvId && !currentConversationId) {
        setCurrentConversationId(newConvId)
        window.history.replaceState(null, '', `/acero-ia/${newConvId}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let finalMessageId = ''
      let finalModel = model

      if (!reader) throw new Error('No stream')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'token') {
                fullContent += data.token
                setMessages(prev =>
                  prev.map(m => m.id === 'streaming' ? { ...m, content: fullContent } : m)
                )
              } else if (eventType === 'done') {
                finalMessageId = data.messageId
                finalModel = data.model
              } else if (eventType === 'error') {
                throw new Error(data.error)
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') throw parseErr
            }
            eventType = ''
          }
        }
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === 'streaming'
            ? { ...m, id: finalMessageId || crypto.randomUUID(), content: fullContent, model_used: finalModel }
            : m
        )
      )
      setActiveModel(finalModel)
      refreshUsage()
    } catch (err) {
      setMessages(prev => {
        const withoutStreaming = prev.filter(m => m.id !== 'streaming')
        return [
          ...withoutStreaming,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: `Error: ${err instanceof Error ? err.message : 'No se pudo generar respuesta'}`,
            model_used: null,
          },
        ]
      })
    } finally {
      setIsStreaming(false)
    }
  }, [currentConversationId, selectedPreset, refreshUsage])

  const handleSend = useCallback(async (content: string, attachments?: AttachmentData[]) => {
    if (modelMode === 'image') {
      await generateImage(content, imageSize, imageQuality)
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      model_used: null,
    }
    setMessages(prev => [...prev, userMessage])

    if (modelMode === 'auto') {
      setIsClassifying(true)
      try {
        const res = await fetch('/api/acero-ia/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, conversationId: currentConversationId }),
        })

        if (!res.ok) throw new Error()

        const classification = await res.json()
        const currentDefault = activeModel || 'haiku'
        const suggested = classification.recommended_model

        if (suggested === 'gpt-image-2') {
          setIsClassifying(false)
          setModelMode('image')
          setMessages(prev => prev.filter(m => m.id !== userMessage.id))
          chatInputRef.current?.setInput(content)
          return
        }

        if (suggested !== currentDefault && suggested !== 'haiku') {
          setPendingSuggestion({
            content,
            currentModel: currentDefault,
            suggestedModel: suggested,
            reason: classification.reason,
            attachments,
          })
          setIsClassifying(false)
          return
        }

        setIsClassifying(false)
        await sendToChat(content, suggested, { attachments })
      } catch {
        setIsClassifying(false)
        await sendToChat(content, 'haiku', { attachments })
      }
    } else {
      await sendToChat(content, modelMode, { attachments })
    }
  }, [modelMode, currentConversationId, activeModel, sendToChat, generateImage, imageSize, imageQuality])

  const handleSuggestionAccept = useCallback(async () => {
    if (!pendingSuggestion) return
    const { content, suggestedModel, attachments } = pendingSuggestion
    setPendingSuggestion(null)
    await sendToChat(content, suggestedModel, {
      suggestionData: { modelSuggested: suggestedModel, userAccepted: true },
      attachments,
    })
  }, [pendingSuggestion, sendToChat])

  const handleSuggestionReject = useCallback(async () => {
    if (!pendingSuggestion) return
    const { content, currentModel, suggestedModel, attachments } = pendingSuggestion
    setPendingSuggestion(null)
    const fallback = currentModel === 'haiku' || !currentModel ? 'haiku' : currentModel
    await sendToChat(content, fallback, {
      suggestionData: { modelSuggested: suggestedModel, userAccepted: false },
      attachments,
    })
  }, [pendingSuggestion, sendToChat])

  const handleRegenerate = useCallback(async (messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex < 0) return

    const lastUserMsg = [...messages].slice(0, msgIndex).reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return

    setMessages(prev => prev.filter(m => m.id !== messageId))

    const model = messages[msgIndex].model_used || activeModel || 'haiku'
    await sendToChat(lastUserMsg.content, model, { regenerateMessageId: messageId })
  }, [messages, activeModel, sendToChat])

  const handleEditMessage = useCallback((content: string) => {
    chatInputRef.current?.setInput(content)
  }, [])

  const handleImageVariation = useCallback((prompt: string) => {
    generateImage(prompt, imageSize, imageQuality)
  }, [generateImage, imageSize, imageQuality])

  const handleEditPrompt = useCallback((prompt: string) => {
    setModelMode('image')
    chatInputRef.current?.setInput(prompt)
  }, [])

  const isEmpty = messages.length === 0 && !pendingSuggestion
  const isBusy = isStreaming || isClassifying || isGeneratingImage
  const limitReached = usage ? !usage.isUnlimited && usage.percentage >= 100 : false
  const activePresetName = initialPresetName || (!conversationId ? selectedPreset?.name : null)

  return (
    <div className="flex flex-col h-full">
      {activePresetName && (
        <div className="flex justify-center pt-3 pb-1">
          <span
            className="text-[11px] px-2.5 py-1 rounded-lg font-medium"
            style={{
              backgroundColor: 'var(--aia-bg-elevated)',
              color: 'var(--aia-text-secondary)',
              border: '1px solid var(--aia-border)',
            }}
          >
            {activePresetName}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-5 opacity-40">
              <polygon points="12,2 20,8 17,18 7,18 4,8" />
              <line x1="12" y1="2" x2="17" y2="18" />
              <line x1="12" y1="2" x2="7" y2="18" />
              <line x1="4" y1="8" x2="20" y2="8" />
            </svg>
            <p className="text-[16px] font-medium mb-1" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
              ¿En qué puedo ayudarte?
            </p>
            <p className="text-[13px]" style={{ color: 'var(--aia-text-muted)' }}>
              Escribe un mensaje para comenzar
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.map(msg => (
              <Message
                key={msg.id}
                role={msg.role}
                content={msg.content}
                modelUsed={msg.model_used}
                isStreaming={msg.id === 'streaming' && isStreaming}
                image={msg.image}
                isLoadingImage={msg.id === 'image-loading'}
                onImageVariation={handleImageVariation}
                onEditPrompt={handleEditPrompt}
                onRegenerate={msg.role === 'assistant' && msg.id !== 'streaming' ? () => handleRegenerate(msg.id) : undefined}
                onEditMessage={msg.role === 'user' ? handleEditMessage : undefined}
              />
            ))}

            {isClassifying && (
              <div className="flex justify-center mb-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: 'var(--aia-amber)' }} />
                  <span className="text-[12px]" style={{ color: 'var(--aia-text-secondary)' }}>Analizando complejidad...</span>
                </div>
              </div>
            )}

            {pendingSuggestion && (
              <ModelSuggestion
                currentModel={pendingSuggestion.currentModel}
                suggestedModel={pendingSuggestion.suggestedModel}
                reason={pendingSuggestion.reason}
                onAccept={handleSuggestionAccept}
                onReject={handleSuggestionReject}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto w-full">
        {limitReached && (
          <div className="flex justify-center px-4 pb-2">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px]"
              style={{ backgroundColor: 'var(--aia-bg-elevated)', border: '1px solid var(--aia-error)', color: 'var(--aia-error)' }}
            >
              Has alcanzado tu límite de ${usage?.limit.toFixed(2)} este mes. Contacta al admin.
            </div>
          </div>
        )}
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          disabled={isBusy || !!pendingSuggestion || limitReached}
          modelMode={modelMode}
          onModelModeChange={setModelMode}
          imageSize={imageSize}
          imageQuality={imageQuality}
          onImageSizeChange={setImageSize}
          onImageQualityChange={setImageQuality}
        />
      </div>
    </div>
  )
}
