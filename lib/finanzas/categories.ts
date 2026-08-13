export type CategoryKind = 'ingreso' | 'gasto'

export interface Category {
  id:                  string
  parent_category_id:  string | null
  name:                string
  kind:                CategoryKind
}

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(categories.map(c => [c.id, { ...c, children: [] }]))
  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    if (node.parent_category_id && nodes.has(node.parent_category_id)) {
      nodes.get(node.parent_category_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// Semilla inicial de categorías — ver sección 22 de documentos/finanzas/documento_maestro_finanzas.md.
export const CATEGORY_SEED: { name: string; kind: CategoryKind; children: string[] }[] = [
  { name: 'Ingresos',            kind: 'ingreso', children: ['Trabajo principal', 'Freelance', 'Bonos', 'Negocios digitales', 'Otros'] },
  { name: 'Alimentación',        kind: 'gasto',   children: ['Comida', 'Desayuno', 'Restaurantes', 'Cafés', 'Postres', 'Delivery', 'Otros'] },
  { name: 'Transporte',          kind: 'gasto',   children: ['Gasolina', 'Taxi', 'Mantenimiento', 'Otros'] },
  { name: 'Pareja',              kind: 'gasto',   children: ['Restaurantes', 'Cafés', 'Cine', 'Flores', 'Regalos', 'Actividades', 'Otros'] },
  { name: 'Entretenimiento',     kind: 'gasto',   children: ['Streaming', 'Cine', 'Amigos', 'Fiestas', 'Otros'] },
  { name: 'Salud y bienestar',   kind: 'gasto',   children: ['Gym', 'Salud', 'Cuidado personal', 'Otros'] },
  { name: 'Tecnología/Software', kind: 'gasto',   children: ['Claude', 'APIs', 'iCloud', 'Google One', 'Spotify', 'Netflix', 'Dominios', 'Otros'] },
  { name: 'Trabajo/Negocios',    kind: 'gasto',   children: ['Publicidad', 'Herramientas', 'Software', 'APIs', 'Freelance', 'Negocios digitales', 'Otros'] },
  { name: 'Gastos irregulares',  kind: 'gasto',   children: ['Regalos', 'Cumpleaños', 'Viajes', 'Mantenimiento', 'Ropa', 'Compras grandes', 'Otros'] },
  { name: 'Finanzas',            kind: 'gasto',   children: ['Inversión', 'Trading', 'Bitcoin', 'Comisiones', 'Otros'] },
  { name: 'Reembolsos',          kind: 'gasto',   children: ['Spotify', 'TradingView', 'Otros gastos compartidos'] },
]
