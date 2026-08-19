'use client'

import { TabNav } from '../components/tab-nav'

interface AdAccountRow {
  id: string
  accountId: string
  clientName: string
  platform: 'Meta Ads' | 'Google Ads'
  activeCampaigns: number
  totalCampaigns: number
  spentYesterday: boolean
  budgetLimitPct: number
}

// Prototipo: sin integración real con Meta/Google Ads todavía — datos de
// ejemplo para mostrar cómo se vería la revisión diaria de cuentas.
const AD_ACCOUNTS: AdAccountRow[] = [
  {
    id: '1', accountId: 'act_2847193650182', clientName: 'Lulos Painting & Home Restoration',
    platform: 'Meta Ads', activeCampaigns: 3, totalCampaigns: 4, spentYesterday: true, budgetLimitPct: 42,
  },
  {
    id: '2', accountId: 'act_9273841056729', clientName: 'Lulos Painting & Home Restoration',
    platform: 'Google Ads', activeCampaigns: 1, totalCampaigns: 1, spentYesterday: false, budgetLimitPct: 15,
  },
  {
    id: '3', accountId: 'act_5610284739201', clientName: 'Café Andina',
    platform: 'Meta Ads', activeCampaigns: 2, totalCampaigns: 2, spentYesterday: true, budgetLimitPct: 91,
  },
  {
    id: '4', accountId: 'act_1039485726154', clientName: 'Bella Nails Studio',
    platform: 'Meta Ads', activeCampaigns: 0, totalCampaigns: 3, spentYesterday: true, budgetLimitPct: 5,
  },
]

const BUDGET_WARNING_THRESHOLD = 85

type AdStatus = 'ok' | 'alerta' | 'pausada'

function getStatus(row: AdAccountRow): AdStatus {
  if (row.activeCampaigns === 0) return 'pausada'
  if (!row.spentYesterday) return 'alerta'
  if (row.budgetLimitPct >= BUDGET_WARNING_THRESHOLD) return 'alerta'
  return 'ok'
}

const AD_STATUS_CLS: Record<AdStatus, string> = {
  ok: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
  alerta: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
  pausada: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700',
}

const AD_STATUS_LABEL: Record<AdStatus, string> = {
  ok: 'OK',
  alerta: 'Atención',
  pausada: 'Pausada',
}

export function CampanasScreen() {
  const alertCount = AD_ACCOUNTS.filter(a => getStatus(a) === 'alerta').length
  const activeCampaignsTotal = AD_ACCOUNTS.reduce((sum, a) => sum + a.activeCampaigns, 0)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-slate-400 dark:text-zinc-500 mb-3">Expandlogy</p>
          <TabNav />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Campañas</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Revisión diaria de cuentas publicitarias — quién gastó ayer y quién está cerca del límite.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Cuentas</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{AD_ACCOUNTS.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Campañas activas</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{activeCampaignsTotal}</p>
          </div>
          <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-1">Con alerta</p>
            <p className={`text-xl font-bold ${alertCount > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {alertCount}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Ad Account</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Campañas</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Gasto de ayer</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Límite de gasto</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody>
                {AD_ACCOUNTS.map(row => {
                  const status = getStatus(row)
                  const budgetWarn = row.budgetLimitPct >= BUDGET_WARNING_THRESHOLD
                  return (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-zinc-900 last:border-0">
                      <td className="px-4 py-3 align-top">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{row.clientName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-500">{row.platform}</p>
                        <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-600 mt-0.5">{row.accountId}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-[13px] font-mono font-semibold text-slate-700 dark:text-zinc-200">
                          {row.activeCampaigns}/{row.totalCampaigns}
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-500">activas</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.activeCampaigns === 0 ? (
                          <span className="text-[12px] text-slate-400 dark:text-zinc-600">—</span>
                        ) : row.spentYesterday ? (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                            ✓ Todas gastaron
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400">
                            ⚠ Sin gasto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${budgetWarn ? 'bg-rose-500' : 'accent-bar'}`}
                              style={{ width: `${row.budgetLimitPct}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-mono font-semibold ${budgetWarn ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                            {row.budgetLimitPct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${AD_STATUS_CLS[status]}`}>
                          {AD_STATUS_LABEL[status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-zinc-600">
          Vista previa — en la versión final estos datos vienen de la integración con Meta/Google Ads y se revisan automáticamente todos los días (~8am).
        </p>
      </div>
    </div>
  )
}
