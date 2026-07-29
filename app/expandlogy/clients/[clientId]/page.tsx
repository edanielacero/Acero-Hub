'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ClientForm } from '../../components/client-form'
import { ClientAccess } from '../../components/client-access'
import { ClientProcess } from '../../components/client-process'
import { linkify } from '../../components/ui'
import { useMockStore } from '../../components/mock-store'
import { STATUS_LABEL, STATUS_BADGE_CLS } from '../../status'

export default function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const router = useRouter()
  const { getClient } = useMockStore()
  const client = getClient(clientId)
  const [showEdit, setShowEdit] = useState(false)

  if (!client) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080808] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-slate-500 dark:text-zinc-400">No encontramos este cliente.</p>
        <button
          onClick={() => router.push('/expandlogy/onboardings')}
          className="text-[12px] text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 cursor-pointer transition-colors"
        >
          ← Volver a clientes
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <button
          onClick={() => router.push('/expandlogy/onboardings')}
          className="self-start text-[12px] text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 cursor-pointer transition-colors"
        >
          ← Volver a clientes
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{client.name}</h1>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_BADGE_CLS[client.status]}`}>
              {STATUS_LABEL[client.status]}
            </span>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="shrink-0 h-10 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 text-[13px] font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
          >
            Editar
          </button>
        </div>

        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-3">Proceso</p>
          <ClientProcess />
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-[0.1em] mb-2">Información</p>
          {client.info ? (
            <div className="bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5">
              <p className="text-[13px] font-mono text-slate-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
                {linkify(client.info)}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-slate-500 dark:text-zinc-500">Sin información todavía — usa &quot;Editar&quot; para completarla.</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-3">Acceso al cliente</p>
          <ClientAccess clientId={client.id} />
        </div>
      </div>

      {showEdit && (
        <ClientForm
          initial={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
