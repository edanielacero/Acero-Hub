export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const values = parseLine(l)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h.trim()] = (values[i] ?? '').trim()
      })
      return row
    })

  return { headers, rows }
}

function parseLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// Attempts to parse a date string (various formats) to ISO 8601
export function coerceDate(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  // Treat date-only strings as local noon to avoid UTC midnight timezone shift
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const d = new Date(isDateOnly ? trimmed + 'T12:00:00' : trimmed)
  if (!isNaN(d.getTime())) return d.toISOString()
  return null
}

export function coerceDirection(value: string): 'long' | 'short' | null {
  const v = value.toLowerCase().trim()
  if (v === 'long' || v === 'l' || v === 'compra' || v === 'buy') return 'long'
  if (v === 'short' || v === 's' || v === 'venta' || v === 'sell') return 'short'
  return null
}

export function coerceResult(value: string): 'tp' | 'sl' | 'be' | null {
  const v = value.toLowerCase().trim()
  if (v === 'tp' || v === 'win' || v === 'ganado' || v === 'ganada' || v === 'ganancia') return 'tp'
  if (v === 'sl' || v === 'loss' || v === 'perdido' || v === 'perdida') return 'sl'
  if (v === 'be' || v === 'breakeven' || v === 'break even') return 'be'
  return null
}
