// select_multiple no tiene UI en el formulario de trade hoy (TradeFormSheet la excluye),
// así que no se puede exigir como obligatoria ahí — se ignora en ambos lados (cliente y servidor).
export function isRequirableVariableType(type: string): boolean {
  return type !== 'select_multiple'
}

export function isVariableValueEmpty(type: string, value: unknown): boolean {
  if (type === 'boolean') return false
  if (type === 'select_multiple') return !Array.isArray(value) || value.length === 0
  return value == null || value === ''
}

// Datos de ejecución obligatorios en backtesting y journal por igual.
// El RR de salida solo tiene un input editable cuando el resultado es TP —
// para SL/BE el formulario lo fija automáticamente (-1R / 0R), así que no aplica ahí.
export function findMissingExecutionField(t: {
  direction?: string | null; result?: string | null; rr_exit?: number | null
}): string | null {
  if (!t.direction) return 'Dirección (Long/Short)'
  if (!t.result) return 'Resultado (TP/SL/BE)'
  if (t.result === 'tp' && t.rr_exit == null) return 'RR de salida'
  return null
}

// Capital de un trade de journal completo: los 4 campos que hacen que el trade
// deje de ser "borrador" y empiece a contar en las estadísticas del journal.
export function isCapitalComplete(t: {
  capital_start?: number | null; capital_end?: number | null
  risk_percent?: number | null; pnl_usd?: number | null
}): boolean {
  return t.capital_start != null && t.capital_end != null
    && t.risk_percent != null && t.pnl_usd != null
}
