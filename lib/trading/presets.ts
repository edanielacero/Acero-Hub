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
    key: 'timeframe_analysis',
    label: 'Timeframe de análisis',
    description: 'TF en el que se analizó el contexto',
    type: 'select_single',
    options: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'],
    defaultSortOrder: 3,
  },
  {
    key: 'setup_type',
    label: 'Tipo de setup',
    description: 'Nombre o descripción del setup utilizado',
    type: 'text',
    defaultSortOrder: 4,
  },
  {
    key: 'confluences',
    label: 'Confluencias',
    description: 'Factores que confirmaron la entrada',
    type: 'select_multiple',
    options: ['Soporte', 'Resistencia', 'Tendencia', 'BOS', 'CHoCH', 'FVG', 'OB', 'Liquidez', 'EMA', 'Fibonacci', 'Otro'],
    defaultSortOrder: 5,
  },
  {
    key: 'asset_type',
    label: 'Tipo de activo',
    description: 'Categoría del instrumento operado',
    type: 'select_single',
    options: ['Forex', 'Crypto', 'Índices', 'Acciones', 'Materias primas'],
    defaultSortOrder: 6,
  },
  {
    key: 'order_type',
    label: 'Tipo de orden',
    description: 'Cómo se ejecutó la entrada',
    type: 'select_single',
    options: ['Market', 'Limit', 'Stop'],
    defaultSortOrder: 7,
  },
  {
    key: 'exit_reason',
    label: 'Razón de salida',
    description: 'Por qué se cerró el trade',
    type: 'select_single',
    options: ['TP', 'SL', 'Manual', 'Trailing', 'BE'],
    defaultSortOrder: 8,
  },
  {
    key: 'trade_managed',
    label: '¿Gestión activa?',
    description: 'Si se gestionó el trade vs. set & forget',
    type: 'boolean',
    defaultSortOrder: 9,
  },
  {
    key: 'followed_plan',
    label: '¿Seguí el plan?',
    description: 'Si se respetó el plan de trading',
    type: 'boolean',
    defaultSortOrder: 10,
  },
  {
    key: 'partial_close',
    label: '¿Cierre parcial?',
    description: 'Si se cerró solo una parte de la posición',
    type: 'boolean',
    defaultSortOrder: 11,
  },
  {
    key: 'emotion_pre',
    label: 'Emoción pre-trade',
    description: 'Estado emocional antes de entrar',
    type: 'select_single',
    options: ['Neutral', 'Confiado', 'Ansioso', 'Dudoso', 'FOMO', 'Impaciente'],
    defaultSortOrder: 12,
  },
  {
    key: 'emotion_post',
    label: 'Emoción post-trade',
    description: 'Estado emocional después de cerrar',
    type: 'select_single',
    options: ['Neutral', 'Satisfecho', 'Frustrado', 'Arrepentido', 'Eufórico', 'Calmado'],
    defaultSortOrder: 13,
  },
  {
    key: 'setup_quality',
    label: 'Calidad del setup',
    description: 'Qué tan claro y limpio era el setup (1–5)',
    type: 'number',
    defaultSortOrder: 14,
  },
  {
    key: 'subjective_rating',
    label: 'Calificación subjetiva',
    description: 'Tu evaluación general del trade (1–10)',
    type: 'number',
    defaultSortOrder: 15,
  },
  {
    key: 'price_entry',
    label: 'Precio de entrada',
    description: 'Precio exacto de la entrada',
    type: 'number',
    defaultSortOrder: 16,
  },
  {
    key: 'price_exit',
    label: 'Precio de salida',
    description: 'Precio exacto de la salida',
    type: 'number',
    defaultSortOrder: 17,
  },
  {
    key: 'sl_pips',
    label: 'SL en pips/puntos',
    description: 'Distancia del Stop Loss desde la entrada',
    type: 'number',
    defaultSortOrder: 18,
  },
  {
    key: 'tp_pips',
    label: 'TP en pips/puntos',
    description: 'Distancia del Take Profit desde la entrada',
    type: 'number',
    defaultSortOrder: 19,
  },
  {
    key: 'commission',
    label: 'Comisión / Swap',
    description: 'Costo de la operación (en USD)',
    type: 'number',
    defaultSortOrder: 20,
  },
  {
    key: 'tags',
    label: 'Tags',
    description: 'Etiquetas libres para clasificar el trade',
    type: 'select_multiple',
    options: [],
    defaultSortOrder: 21,
  },
]
