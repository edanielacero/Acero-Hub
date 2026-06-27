'use client'

import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import ModelSelector, { type ModelMode } from './model-selector'
import ImageOptions from './image-options'
import AttachmentPreview, { type AttachmentData } from './attachment-preview'

interface ChatInputProps {
  onSend: (content: string, attachments?: AttachmentData[]) => void
  disabled?: boolean
  modelMode: ModelMode
  onModelModeChange: (mode: ModelMode) => void
  imageSize: string
  imageQuality: string
  onImageSizeChange: (size: string) => void
  onImageQualityChange: (quality: string) => void
}

export interface ChatInputHandle {
  setInput: (text: string) => void
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSend, disabled, modelMode, onModelModeChange, imageSize, imageQuality, onImageSizeChange, onImageQualityChange },
  ref
) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<AttachmentData[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    setInput: (text: string) => {
      setValue(text)
      setTimeout(() => textareaRef.current?.focus(), 0)
    },
  }))

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled || isUploading) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, isUploading, onSend, attachments])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = 5 - attachments.length
    const toUpload = Array.from(files).slice(0, remaining)

    setIsUploading(true)
    for (const file of toUpload) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/acero-ia/attachments', {
          method: 'POST',
          body: formData,
        })
        if (res.ok) {
          const data: AttachmentData = await res.json()
          setAttachments(prev => [...prev, data])
        }
      } catch {
        // silent
      }
    }
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [attachments.length])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(prev => prev.filter(a => a.fileId !== fileId))
  }, [])

  const canSend = value.trim() && !disabled && !isUploading

  return (
    <div className="px-4 pb-4 pt-2">
      {modelMode === 'image' && (
        <ImageOptions
          size={imageSize}
          quality={imageQuality}
          onSizeChange={onImageSizeChange}
          onQualityChange={onImageQualityChange}
        />
      )}
      <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />
      <div
        className="flex items-end gap-2 rounded-2xl px-4 py-3 transition-colors duration-200"
        style={{
          backgroundColor: 'var(--aia-bg-surface)',
          border: '1px solid var(--aia-border)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.txt,.csv,.json,.js,.ts,.tsx,.py,.html,.css,.xml"
          multiple
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachments.length >= 5}
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors duration-200"
          style={{ backgroundColor: 'var(--aia-bg-hover)' }}
          title={attachments.length >= 5 ? 'Máximo 5 archivos' : 'Adjuntar archivo'}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
        >
          {isUploading ? (
            <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--aia-amber)', borderTopColor: 'transparent' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={attachments.length >= 5 ? 'var(--aia-text-muted)' : 'var(--aia-text-secondary)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={modelMode === 'image' ? 'Describe la imagen que quieres generar...' : 'Escribe tu mensaje...'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-relaxed"
          style={{
            color: 'var(--aia-text-primary)',
            fontFamily: 'var(--font-aia-body)',
            maxHeight: '200px',
          }}
        />

        <ModelSelector
          value={modelMode}
          onChange={onModelModeChange}
          disabled={disabled}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-200"
          style={{
            backgroundColor: canSend ? 'var(--aia-amber)' : 'var(--aia-bg-hover)',
            opacity: canSend ? 1 : 0.5,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#08090a' : 'var(--aia-text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
})

export default ChatInput
