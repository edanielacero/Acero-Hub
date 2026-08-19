'use client'

import { useRef, useState } from 'react'
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react'
import type { Person } from '@/lib/finanzas/types'
import { normalizeName } from '@/lib/finanzas/splits'
import { useFinanzas } from './data-context'
import { PersonAvatar } from './ui'

/**
 * Chips de personas para el reparto, con creación al vuelo.
 *
 * Que se pueda crear una persona sin salir del sheet no es comodidad: si
 * hubiera que ir primero a Ajustes, la mitad de las veces el gasto se
 * registraría sin marcar como compartido y la feature quedaría sin usar.
 */
export function PersonPicker({ selected, onToggle, onCreated, showMe = true }: {
  selected: string[]
  onToggle: (person: Person) => void
  onCreated: (person: Person) => void
  /** El chip "Yo" solo tiene sentido repartiendo un gasto: ahí siempre
      participás. En una deuda no — no podés deberte a vos mismo — así que
      quien arma un picker para elegir "quién te debe" lo apaga. */
  showMe?: boolean
}) {
  const { people, reload } = useFinanzas()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Los archivados no se ofrecen para repartos nuevos, pero si uno ya está en
  // este reparto tiene que verse: si no, su fila aparece en la lista de montos
  // y no hay ningún chip que tocar para sacarlo. Quedabas trabado editando un
  // gasto viejo de alguien que archivaste después.
  const activos = people.filter(p => !p.archived || selected.includes(p.id))

  async function create() {
    const value = name.trim()
    if (!value) return setAdding(false)

    // Si ya existe, se selecciona en vez de duplicar. El endpoint también es
    // idempotente, pero resolverlo acá evita el viaje.
    const yaEsta = people.find(p => !p.archived && normalizeName(p.name) === normalizeName(value))
    if (yaEsta) {
      if (!selected.includes(yaEsta.id)) onToggle(yaEsta)
      setName(''); setAdding(false); setError('')
      return
    }

    setBusy(true)
    const res = await fetch('/api/finanzas/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value }),
    })
    setBusy(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }

    const { person } = await res.json()
    onCreated(person)
    setName(''); setAdding(false); setError('')
    void reload()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {/* "Yo" no es una persona: no existe en fin_people ni genera fila de
            reparto. Está acá porque cuenta para dividir, y sacarlo dejaría la
            división pareja sin sentido visual. */}
        {showMe && (
          <span className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-hero)] text-white text-[14px] font-semibold">
            <IconCheck size={15} stroke={2.4} className="text-[var(--fz-lime)]" />
            Yo
          </span>
        )}

        {activos.map(p => {
          const on = selected.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p)}
              aria-pressed={on}
              className={`shrink-0 inline-flex items-center gap-1.5 h-10 pl-1.5 pr-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                on
                  ? 'bg-[var(--fz-accent)] text-white'
                  : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
              }`}
            >
              <PersonAvatar name={p.name} size={22} />
              {p.name}
              {p.archived && <span className="text-[11px] font-medium opacity-70">archivada</span>}
              {on && <IconX size={14} stroke={2.4} className="opacity-70" />}
            </button>
          )
        })}

        {adding ? (
          <span className="shrink-0 inline-flex items-center h-10 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface-sunk)] border border-[var(--fz-accent)] px-3">
            <input
              ref={inputRef}
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void create() }
                if (e.key === 'Escape') { setAdding(false); setName(''); setError('') }
              }}
              onBlur={() => { if (!name.trim()) { setAdding(false); setError('') } }}
              placeholder="Nombre"
              disabled={busy}
              aria-label="Nombre de la persona"
              className="w-[110px] bg-transparent text-[16px] font-semibold outline-none placeholder:text-[var(--fz-ink-3)]"
            />
            <button
              type="button" onMouseDown={e => e.preventDefault()} onClick={() => void create()}
              disabled={busy} aria-label="Agregar persona"
              className="text-[var(--fz-accent)] disabled:opacity-40"
            >
              <IconCheck size={18} stroke={2.4} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0) }}
            aria-label="Agregar una persona nueva"
            className="shrink-0 grid place-items-center w-10 h-10 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]"
          >
            <IconPlus size={18} stroke={2.2} />
          </button>
        )}
      </div>

      {error && <p className="text-[12px] font-medium text-[var(--fz-out-text)]">{error}</p>}
    </div>
  )
}
