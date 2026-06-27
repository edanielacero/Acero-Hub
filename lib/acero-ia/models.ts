export const AIA_MODELS = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku',
    color: 'var(--aia-amber)',
    colorHex: '#e5a000',
    priceInputPer1M: 1.00,
    priceOutputPer1M: 5.00,
  },
  sonnet: {
    id: 'claude-sonnet-4-6-20250514',
    name: 'Sonnet',
    color: 'var(--aia-cyan)',
    colorHex: '#00b8d4',
    priceInputPer1M: 3.00,
    priceOutputPer1M: 15.00,
  },
  opus: {
    id: 'claude-opus-4-8-20250618',
    name: 'Opus',
    color: 'var(--aia-violet)',
    colorHex: '#8b5cf6',
    priceInputPer1M: 15.00,
    priceOutputPer1M: 75.00,
  },
  'gpt-image-2': {
    id: 'gpt-image-1',
    name: 'Imagen',
    color: 'var(--aia-magenta)',
    colorHex: '#d946ef',
    pricePerImage: {
      '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
      '1792x1024': { low: 0.016, medium: 0.063, high: 0.190 },
      '1024x1792': { low: 0.016, medium: 0.063, high: 0.190 },
    },
  },
} as const

export type TextModelKey = 'haiku' | 'sonnet' | 'opus'
export type ImageModelKey = 'gpt-image-2'
export type ModelKey = TextModelKey | ImageModelKey
export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792'
export type ImageQuality = 'low' | 'medium' | 'high'

export const DEFAULT_MONTHLY_LIMIT_USD = 10.00
