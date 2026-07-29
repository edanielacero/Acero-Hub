'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ClientForm } from '../components/client-form'
import { TabNav } from '../components/tab-nav'
import { useMockStore } from '../components/mock-store'
import { STATUS_LABEL, STATUS_BADGE_CLS } from '../status'

export default function OnboardingsPage() {
  const router = useRouter()
  const { clients } = useMockStore()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.name.toLowerCase().includes(q) || c.info.toLowerCase().includes(q))
  }, [clients, search])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-slate-400 dark:text-zinc-500 mb-3">Expandlogy</p>
          <TabNav />
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Clientes</h1>
          <button
            onClick={() => setShowForm(true)}
            className="accent-btn accent-btn-shadow flex items-center gap-2 h-11 px-4 rounded-xl font-bold text-[13px] cursor-pointer transition-colors shrink-0"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo cliente
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o información…"
          className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none accent-input transition-colors"
        />

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-[14px] text-slate-500 dark:text-zinc-400">
              {clients.length === 0 ? 'Todavía no hay clientes.' : 'Sin resultados para esa búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/expandlogy/clients/${c.id}`)}
                className="group flex flex-col gap-2 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600/60 shadow-sm dark:shadow-none rounded-2xl p-5 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE_CLS[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ClientForm
          onClose={() => setShowForm(false)}
          onSaved={(client) => { setShowForm(false); router.push(`/expandlogy/clients/${client.id}`) }}
        />
      )}
    </div>
  )
}
