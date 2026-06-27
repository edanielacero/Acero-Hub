'use client'

interface ImageOptionsProps {
  size: string
  quality: string
  onSizeChange: (size: string) => void
  onQualityChange: (quality: string) => void
}

const SIZES = [
  { value: '1024x1024', label: 'Cuadrado', icon: '□' },
  { value: '1792x1024', label: 'Horizontal', icon: '▭' },
  { value: '1024x1792', label: 'Vertical', icon: '▯' },
]

const QUALITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function ImageOptions({ size, quality, onSizeChange, onQualityChange }: ImageOptionsProps) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2 text-[11px]"
      style={{ color: 'var(--aia-text-secondary)' }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--aia-text-muted)' }}>Tamaño:</span>
        <div className="flex gap-1">
          {SIZES.map(s => (
            <button
              key={s.value}
              onClick={() => onSizeChange(s.value)}
              className="px-2 py-1 rounded cursor-pointer transition-colors duration-200"
              style={{
                backgroundColor: size === s.value ? 'var(--aia-bg-hover)' : 'transparent',
                color: size === s.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
              }}
              title={s.label}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--aia-text-muted)' }}>Calidad:</span>
        <div className="flex gap-1">
          {QUALITIES.map(q => (
            <button
              key={q.value}
              onClick={() => onQualityChange(q.value)}
              className="px-2 py-1 rounded cursor-pointer transition-colors duration-200"
              style={{
                backgroundColor: quality === q.value ? 'var(--aia-bg-hover)' : 'transparent',
                color: quality === q.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
