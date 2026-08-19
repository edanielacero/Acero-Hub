'use client'

import { useMemo } from 'react'
import { ExpLink, useExpRouter } from '../router'
import { TabNav } from '../components/tab-nav'
import { useMockStore } from '../components/mock-store'
import type { Client } from '../types'

const REMINDER_WINDOW_DAYS = 14

function daysUntil(dateStr: string): number {
  const today = new Date()
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(`${dateStr}T00:00:00Z`).getTime()
  return Math.round((target - todayUTC) / 86400000)
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('es', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

type Severity = 'vencido' | 'urgente' | 'proximo'

function severityOf(days: number): Severity {
  if (days < 0) return 'vencido'
  if (days <= 3) return 'urgente'
  return 'proximo'
}

const SEVERITY_CLS: Record<Severity, string> = {
  vencido: 'border-rose-500 bg-rose-50 dark:bg-rose-950/30',
  urgente: 'border-rose-500 bg-rose-50 dark:bg-rose-950/30',
  proximo: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
}

const SEVERITY_TEXT_CLS: Record<Severity, string> = {
  vencido: 'text-rose-600 dark:text-rose-400',
  urgente: 'text-rose-600 dark:text-rose-400',
  proximo: 'text-amber-600 dark:text-amber-400',
}

function reminderLabel(days: number): string {
  if (days < 0) return `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`
  if (days === 0) return 'Termina hoy'
  return `Termina en ${days} día${days === 1 ? '' : 's'}`
}

interface Reminder {
  client: Client
  days: number
  severity: Severity
}

// Recordatorio manual, sin cliente ni fecha asociada — hardcodeado a pedido.
const MANUAL_REMINDERS: { id: string; label: string }[] = [
  { id: 'newsletter-luqman', label: 'Newsletter Luqman' },
]

export function HomeScreen() {
  const { navigate } = useExpRouter()
  const { clients } = useMockStore()

  const reminders = useMemo<Reminder[]>(() => {
    return clients
      .filter((c): c is Client & { serviceEndsAt: string } => Boolean(c.serviceEndsAt))
      .map(client => {
        const days = daysUntil(client.serviceEndsAt)
        return { client, days, severity: severityOf(days) }
      })
      .filter(r => r.days <= REMINDER_WINDOW_DAYS)
      .sort((a, b) => a.days - b.days)
  }, [clients])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808] px-4 py-10 pb-20">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-slate-400 dark:text-zinc-500 mb-3">Expandlogy</p>
          <TabNav />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Home</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">
            Recordatorios de clientes cuyo servicio está por terminar — para gestionar el cobro de renovación a tiempo.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {reminders.length === 0 && MANUAL_REMINDERS.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-16 text-center">
              <p className="text-[14px] text-slate-500 dark:text-zinc-400">
                No hay vencimientos en los próximos {REMINDER_WINDOW_DAYS} días.
              </p>
              <p className="text-[12px] text-slate-400 dark:text-zinc-600">
                Los recordatorios aparecen acá cuando un cliente se acerca al fin de su servicio.
              </p>
            </div>
          ) : (
            <>
              {MANUAL_REMINDERS.map(reminder => (
                <div
                  key={reminder.id}
                  className="flex items-center border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-950/30 rounded-xl px-4 py-3.5"
                >
                  <p className="text-[14px] font-bold text-rose-600 dark:text-rose-400">{reminder.label}</p>
                </div>
              ))}

              {reminders.map(({ client, days, severity }) => (
                <button
                  key={client.id}
                  onClick={() => navigate(`/expandlogy/clients/${client.id}`)}
                  className={`flex items-center justify-between gap-4 border-l-4 rounded-xl px-4 py-3.5 text-left transition-opacity hover:opacity-90 cursor-pointer ${SEVERITY_CLS[severity]}`}
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{client.name}</p>
                    <p className={`text-[12px] font-semibold ${SEVERITY_TEXT_CLS[severity]}`}>
                      {reminderLabel(days)} · {formatDate(client.serviceEndsAt as string)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold accent-txt">Ver cliente →</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
