import { AIA_MODELS, type TextModelKey, type ImageSize, type ImageQuality } from './models'

export function calculateTextCost(
  model: TextModelKey,
  tokensInput: number,
  tokensOutput: number
): number {
  const config = AIA_MODELS[model]
  const inputCost = (tokensInput / 1_000_000) * config.priceInputPer1M
  const outputCost = (tokensOutput / 1_000_000) * config.priceOutputPer1M
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}

export function calculateImageCost(
  size: ImageSize,
  quality: ImageQuality
): number {
  return AIA_MODELS['gpt-image-2'].pricePerImage[size][quality]
}

export function formatCostUSD(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

export function getUsagePercentage(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(Math.round((spent / limit) * 100), 100)
}

export function getUsageColor(percentage: number): string {
  if (percentage >= 80) return 'var(--aia-error)'
  if (percentage >= 50) return 'var(--aia-warning)'
  return 'var(--aia-success)'
}
