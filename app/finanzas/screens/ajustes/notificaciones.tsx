'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconBellOff, IconDeviceMobileMessage, IconShare2 } from '@tabler/icons-react'
import { usePush } from '../../components/push-setup'
import { Btn, ErrorNote, Label, Panel, TextField } from '../../components/ui'
import { SettingsHeader, SettingsPage } from './shared'

interface Prefs {
  fijos: boolean
  presupuesto: boolean
  ahorro: boolean
  deudas: boolean
  recordar_anotar: boolean
  recordar_mediodia: string
  recordar_noche: string
  timezone: string
}

/**
 * Cada tipo con un EJEMPLO real del aviso debajo.
 *
 * Es más barato entender "Comida al 90% · Te quedan $32" que la etiqueta
 * "Presupuesto". La lista de arriba dice de qué te avisa; el ejemplo dice cómo
 * se va a ver a las 9 de la noche en la pantalla de bloqueo.
 */
const TIPOS: { key: keyof Prefs; label: string; ejemplo: string }[] = [
  { key: 'fijos', label: 'Fijos y cuotas', ejemplo: 'Alquiler vence en 2 días · Bs 2.100' },
  { key: 'presupuesto', label: 'Presupuesto', ejemplo: 'Comida al 90% · Te quedan $32,00' },
  { key: 'ahorro', label: 'Ahorro', ejemplo: 'Te sobraron $214,00 en julio · Sin repartir' },
  { key: 'deudas', label: 'Deudas por cobrar', ejemplo: 'Ana te debe hace 30 días · $20,00' },
  { key: 'recordar_anotar', label: 'Recordarme anotar', ejemplo: '¿Gastaste algo hoy?' },
]

export function AjustesNotificacionesScreen() {
  const push = usePush()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [devices, setDevices] = useState(0)
  const [error, setError] = useState('')

  const cargar = useCallback(async (endpoint: string | null) => {
    const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''
    const res = await fetch(`/api/finanzas/push/prefs${qs}`)
    if (!res.ok) return setError('No se pudieron cargar las preferencias')
    const d = await res.json()
    setPrefs(d.prefs)
    setDevices(d.devices)
  }, [])

  useEffect(() => {
    if (push.estado === 'cargando') return
    void cargar(push.endpoint)
  }, [push.estado, push.endpoint, cargar])

  async function guardar(patch: Partial<Prefs>) {
    // Optimista: un switch que espera al servidor para moverse se siente roto.
    setPrefs(p => (p ? { ...p, ...patch } : p))
    setError('')
    const res = await fetch('/api/finanzas/push/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar')
      void cargar(push.endpoint)
    }
  }

  async function activar() {
    await push.activar()
    // La zona horaria del dispositivo, para que el recordatorio de las 21:00
    // llegue a las 21:00 y no en UTC.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) await guardar({ timezone: tz } as Partial<Prefs>)
  }

  return (
    <SettingsPage>
      <SettingsHeader title="Notificaciones" />

      {error && <ErrorNote>{error}</ErrorNote>}
      {push.error && <ErrorNote>{push.error}</ErrorNote>}

      <Panel>
        <EstadoDelDispositivo push={push} devices={devices} onActivar={activar} />
      </Panel>

      {push.estado === 'activo' && prefs && (
        <>
          <Panel>
            <p className="text-[13px] font-semibold mb-1">De qué avisarte</p>
            <p className="text-[12px] text-[var(--fz-ink-3)] mb-3">
              Te llegan cuando pasan, no una vez al día.
            </p>

            <div className="flex flex-col">
              {TIPOS.map(t => (
                <label
                  key={t.key}
                  className="flex items-start gap-3 py-3 border-b border-[var(--fz-hairline)] last:border-0 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[t.key])}
                    onChange={e => void guardar({ [t.key]: e.target.checked } as Partial<Prefs>)}
                    className="mt-0.5 w-[18px] h-[18px] accent-[var(--fz-accent)] shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{t.label}</span>
                    <span className="block text-[12px] text-[var(--fz-ink-3)] truncate">{t.ejemplo}</span>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          {prefs.recordar_anotar && (
            <Panel>
              <p className="text-[13px] font-semibold mb-1">A qué hora recordarte</p>
              <p className="text-[12px] text-[var(--fz-ink-3)] mb-3">
                Dos por día. Llegan aunque ya hayas anotado algo.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Mediodía</Label>
                  <TextField
                    type="time"
                    value={prefs.recordar_mediodia.slice(0, 5)}
                    onChange={e => void guardar({ recordar_mediodia: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Label>Noche</Label>
                  <TextField
                    type="time"
                    value={prefs.recordar_noche.slice(0, 5)}
                    onChange={e => void guardar({ recordar_noche: e.target.value })}
                  />
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <p className="text-[12px] text-[var(--fz-ink-3)]">
              Cada perfil decide si genera avisos por su cuenta. Ese interruptor está en
              Ajustes → Perfiles.
            </p>
          </Panel>
        </>
      )}
    </SettingsPage>
  )
}

/* ─── El estado de ESTE dispositivo ────────────────────────────────────────── */

function EstadoDelDispositivo({ push, devices, onActivar }: {
  push: ReturnType<typeof usePush>
  devices: number
  onActivar: () => void
}) {
  if (push.estado === 'cargando') {
    return <p className="text-[13px] text-[var(--fz-ink-3)]">Comprobando…</p>
  }

  // El caso que decide si esta feature funciona o parece rota en el celular: en
  // iOS, `requestPermission()` desde Safari sin instalar NO falla — no hace
  // nada. Un botón que no hace nada es peor que no tener botón.
  if (push.estado === 'ios-sin-instalar') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">Primero agregá Finanzas a tu inicio</p>
        <p className="text-[13px] text-[var(--fz-ink-2)]">
          En iPhone, las notificaciones solo funcionan con la app instalada.
        </p>
        <ol className="flex flex-col gap-1.5 mt-1 text-[13px] text-[var(--fz-ink-2)]">
          <li className="flex items-center gap-2">
            <IconShare2 size={16} stroke={1.8} className="shrink-0 text-[var(--fz-ink-3)]" />
            Tocá Compartir, abajo en Safari
          </li>
          <li>2 · Elegí <strong className="font-semibold text-[var(--fz-ink)]">Agregar a inicio</strong></li>
          <li>3 · Abrí Finanzas desde el ícono nuevo y volvé acá</li>
        </ol>
      </div>
    )
  }

  if (push.estado === 'bloqueado') {
    return (
      <div className="flex items-start gap-3">
        <IconBellOff size={20} stroke={1.8} className="mt-0.5 shrink-0 text-[var(--fz-ink-3)]" />
        <div>
          <p className="text-[15px] font-semibold">Están bloqueadas en este navegador</p>
          <p className="text-[13px] text-[var(--fz-ink-2)]">
            La app no puede volver a pedir permiso: hay que habilitarlo en los ajustes del
            sitio, en la barra de direcciones.
          </p>
        </div>
      </div>
    )
  }

  if (push.estado === 'no-soportado') {
    return (
      <p className="text-[13px] text-[var(--fz-ink-2)]">
        Este navegador no soporta notificaciones. Probá desde Chrome en Android o desde la
        computadora.
      </p>
    )
  }

  if (push.estado === 'activo') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <IconDeviceMobileMessage size={20} stroke={1.8} className="mt-0.5 shrink-0 text-[var(--fz-accent)]" />
          <div>
            <p className="text-[15px] font-semibold">Activadas en este dispositivo</p>
            <p className="text-[13px] text-[var(--fz-ink-2)]">
              {devices === 1 ? 'Es el único que tenés conectado' : `Tenés ${devices} dispositivos conectados`}
            </p>
          </div>
        </div>
        <Btn variant="ghost" onClick={() => void push.desactivar()} disabled={push.ocupado}>
          {push.ocupado ? 'Desactivando…' : 'Desactivar acá'}
        </Btn>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[15px] font-semibold">Notificaciones apagadas</p>
        <p className="text-[13px] text-[var(--fz-ink-2)]">
          Te avisamos cuando venza un fijo, te pases del presupuesto o quede un mes sin cerrar.
          {devices > 0 && ` Ya las tenés en ${devices === 1 ? 'otro dispositivo' : `otros ${devices} dispositivos`}.`}
        </p>
      </div>
      <Btn onClick={onActivar} disabled={push.ocupado}>
        {push.ocupado ? 'Activando…' : 'Activar en este dispositivo'}
      </Btn>
    </div>
  )
}
