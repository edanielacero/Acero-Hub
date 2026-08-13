export interface CategoryRule {
  id:           string
  keyword:      string
  category_id:  string
  priority:     number
}

// Match simple por palabra clave (substring, case-insensitive). Prioridad más alta
// gana cuando varias reglas matchean la misma descripción. El usuario siempre puede
// corregir manualmente — esto es solo una sugerencia (ver quick-add.tsx).
export function matchCategory(description: string, rules: CategoryRule[]): string | null {
  const desc = description.trim().toLowerCase()
  if (!desc) return null
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  for (const rule of sorted) {
    const keyword = rule.keyword.trim().toLowerCase()
    if (keyword && desc.includes(keyword)) return rule.category_id
  }
  return null
}
