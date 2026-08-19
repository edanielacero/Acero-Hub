'use client'

import { useState } from 'react'
import { TabNav } from '../components/tab-nav'
import { CreativesPanel } from '../components/creatives-panel'
import { CopiesPanel } from '../components/copies-panel'
import { useMockStore } from '../components/mock-store'

type Mode = 'anuncios' | 'copys'

export default function AdGeneratorPage() {
  const { clients } = useMockStore()
  const [clientId, setClientId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)

  const client = clients.find(c => c.id === clientId) ?? null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-slate-400 dark:text-zinc-500 mb-3">Expandlogy</p>
          <TabNav />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mr-1">Ad Generator</h1>
          {client && (
            <>
              <span className="text-slate-300 dark:text-zinc-700">/</span>
              <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{client.name}</span>
              <button
                onClick={() => { setClientId(null); setMode(null) }}
                className="text-[11px] accent-txt hover:opacity-80 cursor-pointer ml-1"
              >
                Cambiar
              </button>
            </>
          )}
          {client && mode && (
            <>
              <span className="text-slate-300 dark:text-zinc-700">/</span>
              <span className="text-[13px] font-semibold text-slate-700 dark:text-zinc-200">
                {mode === 'anuncios' ? 'Anuncios' : 'Copys'}
              </span>
              <button onClick={() => setMode(null)} className="text-[11px] accent-txt hover:opacity-80 cursor-pointer ml-1">
                Cambiar
              </button>
            </>
          )}
        </div>

        {!client ? (
          clients.length === 0 ? (
            <p className="text-[14px] text-slate-500 dark:text-zinc-400 py-10 text-center">
              No hay clientes todavía. Creá uno primero en la pestaña Onboardings.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">Elegí un cliente para generar anuncios o copys</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {clients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setClientId(c.id)}
                    className="flex items-center gap-3 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600/60 shadow-sm dark:shadow-none rounded-2xl p-4 text-left transition-all cursor-pointer"
                  >
                    <span className="text-[14px] font-bold text-slate-900 dark:text-white">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : !mode ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('anuncios')}
              className="flex flex-col items-start gap-2 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600/60 rounded-2xl p-5 text-left transition-all cursor-pointer"
            >
              <span className="text-[15px] font-bold text-slate-900 dark:text-white">Anuncios</span>
              <span className="text-[12px] text-slate-500 dark:text-zinc-500">Imágenes y videos generados por IA para campañas</span>
            </button>
            <button
              onClick={() => setMode('copys')}
              className="flex flex-col items-start gap-2 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600/60 rounded-2xl p-5 text-left transition-all cursor-pointer"
            >
              <span className="text-[15px] font-bold text-slate-900 dark:text-white">Copys</span>
              <span className="text-[12px] text-slate-500 dark:text-zinc-500">Títulos, CTAs y textos publicitarios</span>
            </button>
          </div>
        ) : mode === 'anuncios' ? (
          <CreativesPanel clientName={client.name} />
        ) : (
          <CopiesPanel clientName={client.name} />
        )}
      </div>
    </div>
  )
}
