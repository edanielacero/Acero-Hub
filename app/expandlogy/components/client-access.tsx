'use client'

import { useMockStore } from './mock-store'
import { TEAM_MEMBERS } from '../mock-data'

export function ClientAccess({ clientId }: { clientId: string }) {
  const { accessByClient, grantAccess, revokeAccess } = useMockStore()
  const granted = accessByClient[clientId] ?? []
  const candidates = TEAM_MEMBERS.filter(m => !granted.includes(m))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {granted.map(member => (
          <div key={member} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{member}</p>
            <button
              onClick={() => revokeAccess(clientId, member)}
              className="shrink-0 text-[11px] text-slate-500 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer px-2 py-1"
            >
              Quitar acceso
            </button>
          </div>
        ))}
        {granted.length === 0 && <p className="text-[13px] text-slate-500 dark:text-zinc-500">Nadie tiene acceso todavía.</p>}
      </div>

      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {candidates.map(member => (
            <button
              key={member}
              onClick={() => grantAccess(clientId, member)}
              className="accent-txt text-[12px] font-semibold hover:opacity-80 transition-opacity cursor-pointer px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700"
            >
              + Dar acceso a {member}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
