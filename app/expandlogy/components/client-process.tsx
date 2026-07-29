'use client'

import { useState } from 'react'

interface ChecklistItem {
  id: string
  label: string
}

// Prototipo: checklist puramente visual, hardcodeada — no se persiste en
// base de datos ni se sincroniza entre usuarios. Se reinicia al recargar.
const PROCESS_ITEMS: ChecklistItem[] = [
  { id: 'kickoff', label: 'Llamada de kickoff con el cliente' },
  { id: 'info', label: 'Recopilar información del negocio' },
  { id: 'brand', label: 'Definir tono y guía de marca' },
  { id: 'drive', label: 'Configurar acceso a Drive y materiales' },
  { id: 'accounts', label: 'Configurar accesos a cuentas publicitarias' },
  { id: 'creatives', label: 'Primera propuesta de creativos' },
  { id: 'copies', label: 'Primera propuesta de copys' },
  { id: 'approval', label: 'Aprobación del cliente' },
]

const USERS = ['Daniel', 'Luis'] as const
type UserName = typeof USERS[number]

export function ClientProcess() {
  const [checkedByUser, setCheckedByUser] = useState<Record<UserName, Set<string>>>({
    Daniel: new Set(),
    Luis: new Set(),
  })

  function toggle(user: UserName, itemId: string) {
    setCheckedByUser(prev => {
      const next = new Set(prev[user])
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return { ...prev, [user]: next }
    })
  }

  const totalItems = USERS.length * PROCESS_ITEMS.length
  const totalChecked = USERS.reduce((sum, u) => sum + checkedByUser[u].size, 0)
  const totalPct = Math.round((totalChecked / totalItems) * 100)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300">Progreso total del cliente</p>
          <span className="text-[13px] font-bold font-mono text-slate-700 dark:text-zinc-200">{totalPct}%</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full accent-bar transition-all duration-500" style={{ width: `${totalPct}%` }} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {USERS.map(user => {
          const checked = checkedByUser[user]
          const pct = Math.round((checked.size / PROCESS_ITEMS.length) * 100)
          return (
            <div key={user} className="bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-bold text-slate-900 dark:text-white">{user}</p>
                <span className="text-[11px] font-bold font-mono text-slate-500 dark:text-zinc-400">
                  {checked.size}/{PROCESS_ITEMS.length}
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full accent-bar transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-col gap-0.5">
                {PROCESS_ITEMS.map(item => {
                  const isChecked = checked.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(user, item.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <span
                        className={`shrink-0 w-[18px] h-[18px] rounded-[6px] border-2 flex items-center justify-center transition-colors ${
                          isChecked ? 'accent-btn border-transparent' : 'border-slate-300 dark:border-zinc-600'
                        }`}
                      >
                        {isChecked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`text-[12.5px] leading-snug ${
                          isChecked ? 'text-slate-400 dark:text-zinc-500 line-through' : 'text-slate-700 dark:text-zinc-200'
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
