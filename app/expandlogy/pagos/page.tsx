'use client'

import { useState, useMemo } from 'react'
import { TabNav } from '../components/tab-nav'

interface PaymentEntry {
  id: string
  date: string // YYYY-MM-DD
  type: 'hora' | 'proyecto'
  detail: string
  hours?: number
  rate?: number
  amount: number
}

interface PaymentMethod {
  label: string
  value: string
  isLink: boolean
}

interface PaymentPerson {
  id: string
  name: string
  method: PaymentMethod
  entries: PaymentEntry[]
}

// Prototipo: sin time-tracking real — horas, proyectos y montos hardcodeados.
const PAYMENT_PEOPLE: PaymentPerson[] = [
  {
    id: 'daniel',
    name: 'Daniel',
    method: { label: 'Zelle', value: 'daniel.pagos@example.com', isLink: false },
    entries: [
      { id: 'd1', date: '2026-07-22', type: 'hora', detail: 'Desarrollo Expandlogy — Onboarding y Home', hours: 6, rate: 25, amount: 150 },
      { id: 'd2', date: '2026-07-25', type: 'hora', detail: 'Desarrollo Expandlogy — Ad Generator', hours: 4, rate: 25, amount: 100 },
      { id: 'd3', date: '2026-07-28', type: 'proyecto', detail: 'Setup inicial de Campañas', amount: 300 },
    ],
  },
  {
    id: 'luis',
    name: 'Luis',
    method: { label: 'PayPal', value: 'https://paypal.me/luisexample', isLink: true },
    entries: [
      { id: 'l1', date: '2026-07-23', type: 'hora', detail: 'Gestión de campañas — Lulos', hours: 5, rate: 20, amount: 100 },
      { id: 'l2', date: '2026-07-27', type: 'proyecto', detail: 'Diseño de creativos — Lulos', amount: 150 },
    ],
  },
  {
    id: 'paula',
    name: 'Paula',
    method: { label: 'Transferencia bancaria', value: 'Banco Ejemplo · Cuenta 000-123456-7', isLink: false },
    entries: [
      { id: 'p1', date: '2026-07-22', type: 'hora', detail: 'Copywriting — Café Andina', hours: 3, rate: 18, amount: 54 },
      { id: 'p2', date: '2026-07-26', type: 'hora', detail: 'Copywriting — Lulos', hours: 4, rate: 18, amount: 72 },
    ],
  },
]

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function formatUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PagosPage() {
  const [selectedId, setSelectedId] = useState(PAYMENT_PEOPLE[0].id)
  const [showMethod, setShowMethod] = useState(false)

  const person = PAYMENT_PEOPLE.find(p => p.id === selectedId)!
  const sortedEntries = useMemo(() => [...person.entries].sort((a, b) => a.date.localeCompare(b.date)), [person])
  const total = person.entries.reduce((sum, e) => sum + e.amount, 0)

  function selectPerson(id: string) {
    setSelectedId(id)
    setShowMethod(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-slate-400 dark:text-zinc-500 mb-3">Expandlogy</p>
          <TabNav />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pagos</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Detalle de horas y proyectos por integrante del equipo.
          </p>
        </div>

        <div className="flex gap-2">
          {PAYMENT_PEOPLE.map(p => (
            <button
              key={p.id}
              onClick={() => selectPerson(p.id)}
              className={`px-4 py-2 rounded-full border text-[13px] font-semibold transition-colors cursor-pointer ${
                p.id === selectedId
                  ? 'accent-btn border-transparent'
                  : 'bg-transparent border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-500'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Detalle</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide">Tiempo</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 dark:border-zinc-900 last:border-0">
                    <td className="px-4 py-3 align-top text-[13px] text-slate-700 dark:text-zinc-200 whitespace-nowrap">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] text-slate-500 dark:text-zinc-400">
                      {entry.type === 'hora' ? 'Por hora' : 'Por proyecto'}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] text-slate-700 dark:text-zinc-200">{entry.detail}</td>
                    <td className="px-4 py-3 align-top text-[13px] font-mono text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {entry.type === 'hora' ? `${entry.hours}h · ${formatUSD(entry.rate ?? 0)}/h` : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] font-mono font-semibold text-slate-900 dark:text-white text-right whitespace-nowrap">
                      {formatUSD(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-zinc-800">
                  <td colSpan={4} className="px-4 py-3 text-[13px] font-bold text-slate-900 dark:text-white text-right">
                    Total a pagar
                  </td>
                  <td className="px-4 py-3 text-[15px] font-mono font-bold text-slate-900 dark:text-white text-right whitespace-nowrap">
                    {formatUSD(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowMethod(v => !v)}
            className="accent-btn accent-btn-shadow self-start h-11 px-5 rounded-xl font-bold text-[13px] cursor-pointer transition-colors"
          >
            Pagar {formatUSD(total)} a {person.name}
          </button>

          {showMethod && (
            <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3.5">
              <div>
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wide mb-0.5">Método de pago</p>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{person.method.label}</p>
              </div>
              {person.method.isLink ? (
                <a
                  href={person.method.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="accent-txt text-[12px] font-semibold hover:opacity-80 underline underline-offset-2 break-all text-right"
                >
                  {person.method.value}
                </a>
              ) : (
                <span className="text-[12px] font-mono text-slate-600 dark:text-zinc-300 text-right">{person.method.value}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
