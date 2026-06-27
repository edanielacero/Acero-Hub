'use client'

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  'gpt-image-2': 'Imagen',
}

interface ModelSuggestionProps {
  currentModel: string
  suggestedModel: string
  reason: string
  onAccept: () => void
  onReject: () => void
}

export default function ModelSuggestion({
  currentModel,
  suggestedModel,
  reason,
  onAccept,
  onReject,
}: ModelSuggestionProps) {
  const suggestedLabel = MODEL_LABELS[suggestedModel] ?? suggestedModel
  const currentLabel = MODEL_LABELS[currentModel] ?? currentModel

  return (
    <div className="flex justify-center mb-4">
      <div
        className="max-w-md w-full rounded-xl px-5 py-4"
        style={{
          backgroundColor: 'var(--aia-bg-elevated)',
          border: '1px solid var(--aia-border-active)',
        }}
      >
        <p className="text-[13px] mb-1" style={{ color: 'var(--aia-text-primary)' }}>
          Esta tarea parece compleja.
        </p>
        <p className="text-[13px] mb-1" style={{ color: 'var(--aia-text-primary)' }}>
          ¿Quieres que use <strong style={{ color: 'var(--aia-amber)' }}>{suggestedLabel}</strong>?
        </p>
        <p className="text-[11px] mb-3" style={{ color: 'var(--aia-text-muted)' }}>
          {reason}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-opacity duration-200 hover:opacity-90"
            style={{
              backgroundColor: 'var(--aia-amber)',
              color: '#08090a',
            }}
          >
            Sí, usar {suggestedLabel}
          </button>
          <button
            onClick={onReject}
            className="flex-1 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-colors duration-200"
            style={{
              backgroundColor: 'var(--aia-bg-hover)',
              color: 'var(--aia-text-secondary)',
            }}
          >
            No, usar {currentLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
