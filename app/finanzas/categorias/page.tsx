'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { api } from '@/lib/finanzas/api-client'
import { buildCategoryTree, type Category, type CategoryKind, type CategoryNode } from '@/lib/finanzas/categories'
import type { CategoryRule } from '@/lib/finanzas/auto-categorize'

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newRootName, setNewRootName] = useState('')
  const [newRootKind, setNewRootKind] = useState<CategoryKind>('gasto')
  const [showAddRoot, setShowAddRoot] = useState(false)
  const [addingChildTo, setAddingChildTo] = useState<CategoryNode | null>(null)
  const [newChildName, setNewChildName] = useState('')

  async function load() {
    setLoading(true)
    const [catRes, ruleRes] = await Promise.all([api('/categories'), api('/category-rules')])
    const [catJson, ruleJson] = await Promise.all([catRes.json(), ruleRes.json()])
    setCategories(catJson.categories ?? [])
    setRules(ruleJson.rules ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tree = useMemo(() => buildCategoryTree(categories), [categories])
  const ingresos = tree.filter(c => c.kind === 'ingreso')
  const gastos = tree.filter(c => c.kind === 'gasto')
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  async function handleSeed() {
    setSeeding(true)
    setError(null)
    const res = await api('/categories/seed', { method: 'POST' })
    const json = await res.json()
    setSeeding(false)
    if (!res.ok) { setError(json.error ?? 'Error al sembrar categorías'); return }
    load()
  }

  async function handleAddRoot() {
    if (!newRootName.trim()) return
    setError(null)
    const res = await api('/categories', { method: 'POST', body: JSON.stringify({ name: newRootName.trim(), kind: newRootKind }) })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Error al crear categoría'); return }
    setNewRootName('')
    setShowAddRoot(false)
    load()
  }

  async function handleAddChild() {
    if (!addingChildTo || !newChildName.trim()) return
    setError(null)
    const res = await api('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newChildName.trim(), kind: addingChildTo.kind, parent_category_id: addingChildTo.id }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Error al crear subcategoría'); return }
    setNewChildName('')
    setAddingChildTo(null)
    load()
  }

  async function handleDelete(node: CategoryNode) {
    const label = node.children.length > 0 ? `"${node.name}" y sus ${node.children.length} subcategorías` : `"${node.name}"`
    if (!confirm(`¿Eliminar ${label}?`)) return
    await api(`/categories/${node.id}`, { method: 'DELETE' })
    load()
  }

  async function handleDeleteRule(id: string) {
    await api(`/category-rules/${id}`, { method: 'DELETE' })
    load()
  }

  function renderGroup(nodes: CategoryNode[]) {
    return (
      <div className="fz-card">
        {nodes.map(node => (
          <div key={node.id} className="fz-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-[14px]" style={{ color: 'var(--text-primary)' }}>{node.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => setAddingChildTo(node)} className="text-[13px] font-medium cursor-pointer" style={{ color: 'var(--text-accent)' }}>+ Sub</button>
                <button onClick={() => handleDelete(node)} className="cursor-pointer" style={{ color: 'var(--text-muted)' }} aria-label="Eliminar">
                  <IconTrash size={14} stroke={1.8} />
                </button>
              </div>
            </div>
            {node.children.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {node.children.map(child => (
                  <span key={child.id} className="fz-chip" style={{ gap: 6 }}>
                    {child.name}
                    <button onClick={() => handleDelete(child)} className="cursor-pointer leading-none opacity-60">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4 flex items-start justify-between gap-3">
        <h1 className="fz-title">Categorías</h1>
        <button onClick={() => setShowAddRoot(true)} className="fz-icon-btn mt-1" aria-label="Nueva categoría">
          <IconPlus size={16} stroke={2} />
        </button>
      </div>

      <div className="px-4 flex flex-col gap-6">
        {error && <p className="text-[12px]" style={{ color: 'var(--text-danger)' }}>{error}</p>}

        {loading ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : categories.length === 0 ? (
          <div className="fz-card p-5 flex flex-col gap-3 items-start">
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Todavía no tenés categorías.</p>
            <button onClick={handleSeed} disabled={seeding} className="fz-btn disabled:opacity-40">
              {seeding ? 'Cargando…' : 'Cargar categorías predefinidas'}
            </button>
          </div>
        ) : (
          <>
            <button onClick={handleSeed} disabled={seeding} className="fz-btn-text text-left disabled:opacity-40">
              {seeding ? 'Cargando…' : 'Cargar categorías predefinidas faltantes'}
            </button>
            {ingresos.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className="fz-section-label">Ingresos</p>
                {renderGroup(ingresos)}
              </div>
            )}
            {gastos.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className="fz-section-label">Gastos</p>
                {renderGroup(gastos)}
              </div>
            )}
          </>
        )}

        {rules.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="fz-section-label">Reglas de auto-categorización</p>
            <div className="fz-card">
              {rules.map(rule => (
                <div key={rule.id} className="fz-row">
                  <p className="flex-1 text-[13px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    &quot;{rule.keyword}&quot; → <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{categoryById.get(rule.category_id)?.name ?? '—'}</span>
                  </p>
                  <button onClick={() => handleDeleteRule(rule.id)} className="cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }} aria-label="Eliminar regla">
                    <IconTrash size={14} stroke={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddRoot && (
        <div className="fz-sheet-overlay" onClick={() => setShowAddRoot(false)}>
          <div className="fz-sheet" onClick={e => e.stopPropagation()}>
            <div className="fz-sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setShowAddRoot(false)} className="fz-btn-text">Cancelar</button>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Nueva categoría</span>
              <button onClick={handleAddRoot} disabled={!newRootName.trim()} className="fz-btn-text font-semibold disabled:opacity-40">Guardar</button>
            </div>
            <div className="px-4 pb-2">
              <div className="fz-card">
                <div className="fz-row">
                  <span className="fz-field-label">Nombre</span>
                  <input autoFocus value={newRootName} onChange={e => setNewRootName(e.target.value)} placeholder="Ej. Vivienda" className="fz-field-input" />
                </div>
                <div className="fz-row">
                  <span className="fz-field-label">Tipo</span>
                  <select value={newRootKind} onChange={e => setNewRootKind(e.target.value as CategoryKind)} className="fz-field-select">
                    <option value="gasto">Gasto</option>
                    <option value="ingreso">Ingreso</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {addingChildTo && (
        <div className="fz-sheet-overlay" onClick={() => setAddingChildTo(null)}>
          <div className="fz-sheet" onClick={e => e.stopPropagation()}>
            <div className="fz-sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setAddingChildTo(null)} className="fz-btn-text">Cancelar</button>
              <span className="text-[15px] font-semibold truncate px-2" style={{ color: 'var(--text-primary)' }}>Sub de {addingChildTo.name}</span>
              <button onClick={handleAddChild} disabled={!newChildName.trim()} className="fz-btn-text font-semibold disabled:opacity-40">Guardar</button>
            </div>
            <div className="px-4 pb-2">
              <div className="fz-card">
                <div className="fz-row">
                  <span className="fz-field-label">Nombre</span>
                  <input autoFocus value={newChildName} onChange={e => setNewChildName(e.target.value)} placeholder="Nombre" className="fz-field-input" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
