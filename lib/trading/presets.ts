export type VariableType = 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'

export interface PresetVariable {
  key: string
  label: string
  description: string
  type: VariableType
  options?: string[]
  defaultSortOrder: number
}

export const PRESET_VARIABLES: PresetVariable[] = [
  {
    key: 'instrument',
    label: 'Instrumento',
    description: 'Par, activo o ticker del trade (ej. EURUSD, NQ, BTC)',
    type: 'select_single',
    options: [],
    defaultSortOrder: 0,
  },
  {
    key: 'session_time',
    label: 'Sesión horaria',
    description: 'Sesión de mercado al momento del trade',
    type: 'select_single',
    options: ['Asiática', 'Londres', 'Nueva York', 'Overlap L-NY', 'Overlap A-L'],
    defaultSortOrder: 1,
  },
  {
    key: 'timeframe_entry',
    label: 'Timeframe de entrada',
    description: 'TF en el que se ejecutó la entrada',
    type: 'select_single',
    options: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'],
    defaultSortOrder: 2,
  },
  {
    key: 'setup_type',
    label: 'Tipo de setup',
    description: 'Nombre o descripción del setup utilizado',
    type: 'text',
    defaultSortOrder: 3,
  },
  {
    key: 'confluences',
    label: 'Confluencias',
    description: 'Factores que confirmaron la entrada',
    type: 'select_multiple',
    options: ['BOS', 'CHoCH', 'FVG', 'OB', 'Liquidez', 'Soporte', 'Resistencia', 'Tendencia', 'EMA', 'Fibonacci', 'Otro'],
    defaultSortOrder: 4,
  },
  {
    key: 'exit_reason',
    label: 'Razón de salida',
    description: 'Por qué se cerró el trade',
    type: 'select_single',
    options: ['TP', 'SL', 'Manual', 'Trailing', 'BE'],
    defaultSortOrder: 5,
  },
  {
    key: 'followed_plan',
    label: '¿Seguí el plan?',
    description: 'Si se respetó el plan de trading',
    type: 'boolean',
    defaultSortOrder: 6,
  },
  {
    key: 'emotion_pre',
    label: 'Emoción pre-trade',
    description: 'Estado emocional antes de entrar',
    type: 'select_single',
    options: ['Neutral', 'Confiado', 'Ansioso', 'Dudoso', 'FOMO', 'Impaciente'],
    defaultSortOrder: 7,
  },
  {
    key: 'setup_quality',
    label: 'Calidad del setup',
    description: 'Qué tan claro y limpio era el setup (1–5)',
    type: 'number',
    defaultSortOrder: 8,
  },
  {
    key: 'tags',
    label: 'Tags',
    description: 'Etiquetas para clasificar el trade (editables)',
    type: 'select_multiple',
    options: ['Buena ejecución', 'Error de entrada', 'FOMO', 'Gestión correcta', 'Revenge trade'],
    defaultSortOrder: 9,
  },
]
