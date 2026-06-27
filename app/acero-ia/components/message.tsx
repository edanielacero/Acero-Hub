'use client'

import { memo } from 'react'
import MarkdownRenderer from './markdown-renderer'
import ImageMessage from './image-message'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  modelUsed?: string | null
  isStreaming?: boolean
  image?: {
    url: string
    prompt: string
    size: string
    quality: string
  }
  isLoadingImage?: boolean
  onImageVariation?: (prompt: string) => void
  onEditPrompt?: (prompt: string) => void
  onRegenerate?: () => void
  onEditMessage?: (content: string) => void
}

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  'gpt-image-2': 'Imagen',
}

function PrismaAvatar() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--aia-amber)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 mt-0.5"
    >
      <polygon points="12,2 20,8 17,18 7,18 4,8" />
      <line x1="12" y1="2" x2="17" y2="18" />
      <line x1="12" y1="2" x2="7" y2="18" />
      <line x1="4" y1="8" x2="20" y2="8" />
    </svg>
  )
}

function ActionButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1 rounded cursor-pointer transition-colors duration-200 opacity-0 group-hover:opacity-100"
      style={{ color: 'var(--aia-text-muted)' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-muted)')}
    >
      {children}
    </button>
  )
}

function Message({ role, content, modelUsed, isStreaming, image, isLoadingImage, onImageVariation, onEditPrompt, onRegenerate, onEditMessage }: MessageProps) {
  if (role === 'user') {
    return (
      <div className="group flex justify-end mb-4 gap-2">
        {onEditMessage && (
          <div className="flex items-center">
            <ActionButton onClick={() => onEditMessage(content)} title="Editar mensaje">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </ActionButton>
          </div>
        )}
        <div
          className="max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-br-md text-[14px] leading-relaxed"
          style={{
            backgroundColor: 'var(--aia-bg-elevated)',
            color: 'var(--aia-text-primary)',
          }}
        >
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="group flex gap-3 mb-4">
      <PrismaAvatar />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {modelUsed && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: 'var(--aia-bg-hover)',
                color: 'var(--aia-text-secondary)',
              }}
            >
              {MODEL_LABELS[modelUsed] ?? modelUsed}
            </span>
          )}
          {!modelUsed && !isLoadingImage && (
            <div
              className="h-4 w-12 rounded animate-pulse"
              style={{ backgroundColor: 'var(--aia-bg-hover)' }}
            />
          )}
        </div>
        <div
          className="pl-3 text-[14px] leading-relaxed border-l-2"
          style={{ borderColor: 'var(--aia-amber)' }}
        >
          {image ? (
            <ImageMessage
              imageUrl={image.url}
              prompt={image.prompt}
              size={image.size}
              quality={image.quality}
              onVariation={() => onImageVariation?.(image.prompt)}
              onEditPrompt={(p) => onEditPrompt?.(p)}
            />
          ) : isLoadingImage ? (
            <div
              className="rounded-xl animate-pulse flex items-center justify-center"
              style={{ backgroundColor: 'var(--aia-bg-hover)', width: '320px', height: '200px' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30 animate-spin" style={{ animationDuration: '3s' }}>
                <polygon points="12,2 20,8 17,18 7,18 4,8" />
                <line x1="12" y1="2" x2="17" y2="18" />
                <line x1="12" y1="2" x2="7" y2="18" />
                <line x1="4" y1="8" x2="20" y2="8" />
              </svg>
            </div>
          ) : (
            <>
              <MarkdownRenderer content={content} />
              {isStreaming && (
                <span
                  className="inline-block w-2 h-4 ml-0.5 animate-pulse rounded-sm"
                  style={{ backgroundColor: 'var(--aia-amber)' }}
                />
              )}
            </>
          )}
        </div>
        {/* Action buttons */}
        {!isStreaming && !isLoadingImage && onRegenerate && (
          <div className="flex items-center gap-1 mt-1 pl-3">
            <ActionButton onClick={onRegenerate} title="Regenerar respuesta">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(Message)
