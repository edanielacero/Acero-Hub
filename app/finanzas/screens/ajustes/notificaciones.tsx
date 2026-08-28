'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconBellOff, IconDeviceMobile, IconShare2 } from '@tabler/icons-react'
import { usePush } from '../../components/push-setup'
import { Btn, ErrorNote, Label, Panel, TimeField, Toggle } from '../../components/ui'
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

const TIPOS: { key: keyof Prefs; label: string }[] = [
  { key: 'fijos', label: 'Fijos y cuotas' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'ahorro', label: 'Ahorro' },
  { key: 'deudas', label: 'Deudas por cobrar' },
  { key: 'recordar_anotar', label: 'Recordarme anotar' },
]

export function AjustesNotificacionesScreen() {
  const push = usePush()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async (endpoint: string | null) => {
    const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''
    const res = await fetch(`/api/finanzas/push/prefs${qs}`)
    if (!res.ok) return setError('No se pudieron cargar las preferencias')
    const d = await res.json()
    setPrefs(d.prefs)
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
    // La zona del dispositivo, para que el recordatorio de las 21:00 llegue a
    // las 21:00 y no en UTC.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) await guardar({ timezone: tz } as Partial<Prefs>)
  }

  const activo = push.estado === 'activo'

  return (
    <SettingsPage>
      <SettingsHeader title="Notificaciones" />

      {/* `SettingsPage` no separa a sus hijos: cada pantalla arma su propia
          columna. Sin esto los paneles quedaban pegados uno contra el otro. */}
      <div className="flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {push.error && <ErrorNote>{push.error}</ErrorNote>}

        <Panel>
          <Estado push={push} onActivar={activar} />
        </Panel>

        {activo && prefs && (
          <>
            <Panel>
              <SeccionTitulo
                titulo="De qué avisarte"
                nota="Te llegan cuando pasan, no una vez al día."
              />

              <div className="flex flex-col">
                {TIPOS.map(t => (
                  <div
                    key={t.key}
                    className="flex items-center justify-between gap-4 py-3 border-b border-[var(--fz-hairline)] last:border-0 last:pb-0 first:pt-0"
                  >
                    <span className="min-w-0 text-[15px] font-semibold truncate">{t.label}</span>
                    <Toggle
                      checked={Boolean(prefs[t.key])}
                      label={t.label}
                      onChange={v => void guardar({ [t.key]: v } as Partial<Prefs>)}
                    />
                  </div>
                ))}
              </div>
            </Panel>

            {prefs.recordar_anotar && (
              <Panel>
                <SeccionTitulo
                  titulo="A qué hora recordarte"
                  nota="Dos por día. Llegan aunque ya hayas anotado algo."
                />
                {/* Grilla y no flex: dos columnas exactamente iguales. Con
                    `flex-1` cada campo se dimensionaba por su propio contenido
                    y quedaban de anchos distintos. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label>Mediodía</Label>
                    <TimeField
                      value={prefs.recordar_mediodia.slice(0, 5)}
                      onChange={e => void guardar({ recordar_mediodia: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Noche</Label>
                    <TimeField
                      value={prefs.recordar_noche.slice(0, 5)}
                      onChange={e => void guardar({ recordar_noche: e.target.value })}
                    />
                  </div>
                </div>
              </Panel>
            )}

            <Panel>
              <SeccionTitulo
                titulo="Perfiles"
                nota="Cada perfil decide por su cuenta si genera avisos. Ese interruptor está en Ajustes → Perfiles."
              />
            </Panel>
          </>
        )}
      </div>
    </SettingsPage>
  )
}

/** Mismo encabezado en los tres bloques: sin esto cada panel arrancaba con un
 *  tamaño y un margen distinto, y la pantalla se leía desprolija. */
function SeccionTitulo({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="mb-4">
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</p>
      <p className="mt-0.5 text-[13px] text-[var(--fz-ink-2)] leading-snug">{nota}</p>
    </div>
  )
}

/* ─── El estado de ESTE dispositivo ────────────────────────────────────────── */

function Estado({ push, onActivar }: {
  push: ReturnType<typeof usePush>
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
      <Bloque
        icono={<IconShare2 size={20} stroke={1.8} />}
        titulo="Primero agregá Mis Finanzas a tu inicio"
        nota="En iPhone las notificaciones solo funcionan con la app instalada."
      >
        <ol className="flex flex-col gap-1 text-[13px] text-[var(--fz-ink-2)]">
          <li>1 · Tocá <strong className="font-semibold text-[var(--fz-ink)]">Compartir</strong>, abajo en Safari</li>
          <li>2 · Elegí <strong className="font-semibold text-[var(--fz-ink)]">Agregar a inicio</strong></li>
          <li>3 · Abrí Mis Finanzas desde el ícono nuevo y volvé acá</li>
        </ol>
      </Bloque>
    )
  }

  if (push.estado === 'bloqueado') {
    return (
      <Bloque
        icono={<IconBellOff size={20} stroke={1.8} />}
        titulo="Están bloqueadas en este navegador"
        nota="La app no puede volver a pedir permiso: hay que habilitarlo en los ajustes del sitio, desde la barra de direcciones."
      />
    )
  }

  if (push.estado === 'no-soportado') {
    return (
      <Bloque
        icono={<IconBellOff size={20} stroke={1.8} />}
        titulo="Este navegador no las soporta"
        nota="Probá desde Chrome en Android, o desde la computadora."
      />
    )
  }

  if (push.estado === 'activo') {
    return (
      <Bloque
        icono={<IconDeviceMobile size={20} stroke={1.8} />}
        titulo="Activadas en este dispositivo"
        nota="Te van a llegar aunque tengas la app cerrada."
        acento
      >
        <Btn variant="ghost" onClick={() => void push.desactivar()} disabled={push.ocupado}>
          {push.ocupado ? 'Desactivando…' : 'Desactivar acá'}
        </Btn>
      </Bloque>
    )
  }

  return (
    <Bloque
      icono={<IconDeviceMobile size={20} stroke={1.8} />}
      titulo="Notificaciones apagadas"
      nota="Te avisamos cuando venza un fijo, te pases del presupuesto o quede un mes sin cerrar."
    >
      <Btn onClick={onActivar} disabled={push.ocupado}>
        {push.ocupado ? 'Activando…' : 'Activar en este dispositivo'}
      </Btn>
    </Bloque>
  )
}

/** Los cinco estados comparten la misma forma. Antes cada uno armaba su propio
 *  layout y ninguno alineaba con el siguiente. */
function Bloque({ icono, titulo, nota, acento = false, children }: {
  icono: React.ReactNode
  titulo: string
  nota: string
  acento?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid place-items-center w-10 h-10 rounded-[var(--fz-r-chip)] shrink-0 ${
            acento
              ? 'bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
              : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-3)]'
          }`}
        >
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.01em]">{titulo}</span>
          <span className="block mt-0.5 text-[13px] text-[var(--fz-ink-2)] leading-snug">{nota}</span>
        </span>
      </div>
      {children}
    </div>
  )
}
