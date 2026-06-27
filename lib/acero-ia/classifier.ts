import Anthropic from '@anthropic-ai/sdk'
import { AIA_MODELS } from './models'

const anthropic = new Anthropic()

export interface ClassificationResult {
  complexity: 'low' | 'medium' | 'high'
  category: 'text' | 'image'
  recommended_model: 'haiku' | 'sonnet' | 'opus' | 'gpt-image-2'
  reason: string
}

const CLASSIFICATION_PROMPT = `Eres un clasificador de complejidad. Analiza el mensaje del usuario y responde SOLO con un JSON válido, sin markdown ni texto adicional:

{
  "complexity": "low" | "medium" | "high",
  "category": "text" | "image",
  "recommended_model": "haiku" | "sonnet" | "opus" | "gpt-image-2",
  "reason": "explicación breve"
}

Criterios:
- low: preguntas simples, traducciones cortas, respuestas factuales, saludos, conversación casual → haiku
- medium: análisis, redacción larga, código moderado, explicaciones detalladas, comparaciones → sonnet
- high: razonamiento complejo, arquitectura de software, análisis profundo, código avanzado, matemáticas complejas → opus
- image: el usuario quiere generar, crear, dibujar o diseñar una imagen → gpt-image-2`

export async function classifyMessage(
  userMessage: string,
  conversationContext: { role: string; content: string }[] = [],
  lastModelUsed?: string | null,
): Promise<ClassificationResult> {
  const contextSummary = conversationContext
    .slice(-4)
    .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
    .join('\n')

  const prompt = [
    CLASSIFICATION_PROMPT,
    contextSummary ? `\nContexto reciente de la conversación:\n${contextSummary}` : '',
    lastModelUsed ? `\nModelo usado anteriormente en esta conversación: ${lastModelUsed}` : '',
    `\nMensaje del usuario: ${userMessage}`,
  ].join('\n')

  try {
    const response = await anthropic.messages.create({
      model: AIA_MODELS.haiku.id,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const json = text.match(/\{[\s\S]*\}/)
    if (!json) throw new Error('No JSON in response')

    const parsed = JSON.parse(json[0]) as ClassificationResult

    const validModels = ['haiku', 'sonnet', 'opus', 'gpt-image-2']
    if (!validModels.includes(parsed.recommended_model)) {
      parsed.recommended_model = 'haiku'
    }

    return parsed
  } catch {
    return {
      complexity: 'low',
      category: 'text',
      recommended_model: 'haiku',
      reason: 'Clasificación por defecto',
    }
  }
}
