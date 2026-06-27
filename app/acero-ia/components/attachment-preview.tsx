'use client'

export interface AttachmentData {
  fileId: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  extractedText: string | null
  isImage: boolean
}

interface AttachmentPreviewProps {
  attachments: AttachmentData[]
  onRemove: (fileId: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {attachments.map(att => (
        <div
          key={att.fileId}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px]"
          style={{
            backgroundColor: 'var(--aia-bg-elevated)',
            border: '1px solid var(--aia-border)',
            color: 'var(--aia-text-secondary)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {att.isImage ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </>
            ) : (
              <>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </>
            )}
          </svg>
          <span className="max-w-[120px] truncate">{att.fileName}</span>
          <span style={{ color: 'var(--aia-text-muted)' }}>{formatSize(att.fileSize)}</span>
          <button
            onClick={() => onRemove(att.fileId)}
            className="p-0.5 rounded cursor-pointer transition-colors duration-200"
            style={{ color: 'var(--aia-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-error)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-muted)')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
