'use client'

import { useState } from 'react'
import { BottomSheet, inputCls, textareaCls, labelCls } from './ui'
import { useMockStore } from './mock-store'
import { STATUS_ORDER, STATUS_LABEL, STATUS_BADGE_CLS } from '../status'
import type { Client } from '../types'

export function ClientForm({ initial, onClose, onSaved }: {
  initial?: Client | null
  onClose: () => void
  onSaved: (client: Client) => void
}) {
  const { addClient, updateClient } = useMockStore()
  const isEdit = Boolean(initial)
  const [name, setName] = useState(initial?.name ?? '')
  const [info, setInfo] = useState(initial?.info ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'onboarding')
  const [serviceEndsAt, setServiceEndsAt] = useState(initial?.serviceEndsAt ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    if (!name.trim()) { setError('El nombre del negocio es requerido'); return }
    setError(null)

    if (isEdit && initial) {
      const updates = { name: name.trim(), info, status, serviceEndsAt: serviceEndsAt || null }
      updateClient(initial.id, updates)
      onSaved({ ...initial, ...updates })
    } else {
      const client = addClient({ name: name.trim(), info })
      onSaved(client)
    }
  }

  return (
    <BottomSheet title={isEdit ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {isEdit && (
          <div>
            <label className={labelCls}>Estado</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                    status === s
                      ? STATUS_BADGE_CLS[s]
                      : 'bg-transparent border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {isEdit && (
          <div>
            <label className={labelCls}>Fin de servicio</label>
            <input
              type="date"
              className={inputCls}
              value={serviceEndsAt ?? ''}
              onChange={e => setServiceEndsAt(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1.5">
              Se usa para el recordatorio de cobro en el Home cuando se acerca esta fecha.
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Nombre del negocio *</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Ej. Lulos"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Información</label>
          <textarea
            rows={10}
            className={`${textareaCls} font-mono text-[13px]`}
            placeholder="Todos los datos de onboarding del cliente: datos personales, del negocio, del servicio, accesos, etc."
            value={info}
            onChange={e => setInfo(e.target.value)}
          />
        </div>

        {error && <p className="text-[13px] text-rose-500 dark:text-rose-400 text-center">{error}</p>}

        <button
          onClick={handleSave}
          className="accent-btn accent-btn-shadow w-full min-h-[52px] rounded-2xl font-bold text-[15px] cursor-pointer transition-colors mt-2"
        >
          {isEdit ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </BottomSheet>
  )
}
