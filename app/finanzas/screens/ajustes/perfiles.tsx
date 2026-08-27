'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconArchive, IconArchiveOff, IconPalette, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { ACCENT_KEYS, type AccentKey, type ProfileWithUsage } from '@/lib/finanzas/types'
import { useFinanzas } from '../../components/data-context'
import { fzFetch } from '../../components/fz-fetch'
import { ProfileDot } from '../../components/profile-switcher'
import { Btn, ErrorNote, Label, Panel, RowMenu, TextField } from '../../components/ui'
import { SettingsHeader, SettingsPage } from './shared'

const ACCENT_LABEL: Record<AccentKey, string> = {
  verde: 'Verde', naranja: 'Naranja', violeta: 'Violeta', magenta: 'Magenta', teal: 'Teal',
}

/**
 * Ajustes → Perfiles.
 *
 * Cada perfil es un cajón de finanzas aislado: sus cuentas, sus movimientos, su
 * patrimonio. Lo que los distingue de un vistazo es el color, y por eso
 * elegirlo está al mismo nivel que el nombre y no escondido detrás de un menú:
 * registrar en el perfil equivocado es el único error de este sprint que no se
 * puede deshacer.
 */
export function AjustesPerfilesScreen() {
  const { reload, profileId, switchProfile } = useFinanzas()

  const [profiles, setProfiles] = useState<ProfileWithUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAccent, setNewAccent] = useState<AccentKey | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    const res = await fzFetch('/api/finanzas/profiles')
    if (!res.ok) { setError('No se pudieron cargar los perfiles'); setLoading(false); return }
    const data = await res.json()
    setProfiles(data.profiles ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function call(url: string, init: RequestInit, fallback: string): Promise<boolean> {
    setError('')
    const res = await fzFetch(url, init)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? fallback)
      return false
    }
    await load()
    await reload()
    return true
  }

  const json = (body: unknown, method: string): RequestInit => ({
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  const usados = profiles.map(p => p.accent)
  const sugerido = ACCENT_KEYS.find(a => !usados.includes(a)) ?? 'verde'

  async function crear() {
    const name = newName.trim()
    if (!name) return setError('El perfil necesita un nombre')

    setError('')
    const res = await fzFetch('/api/finanzas/profiles', json({ name, accent: newAccent ?? sugerido }, 'POST'))
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear el perfil')
    }
    const { profile } = await res.json()
    setNewName(''); setNewAccent(null); setCreating(false)
    await load()
    // Cambiar a él es lo que uno espera después de crearlo: deja al usuario
    // parado en el perfil vacío, listo para cargar su primera cuenta.
    await reload()
    switchProfile(profile.id)
  }

  async function renombrar(id: string) {
    const name = editName.trim()
    if (!name) return setError('El perfil necesita un nombre')
    if (await call(`/api/finanzas/profiles/${id}`, json({ name }, 'PATCH'), 'No se pudo renombrar')) {
      setEditing(null)
    }
  }

  const activos = profiles.filter(p => !p.archived)
  const archivados = profiles.filter(p => p.archived)

  return (
    <SettingsPage>
      <SettingsHeader title="Perfiles" />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Panel>
        <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
          Cada perfil tiene sus propias cuentas, movimientos, categorías y patrimonio.
          Nada se comparte entre uno y otro — salvo el tipo de cambio, que es del día.
        </p>

        {loading ? (
          <p className="text-[13px] text-[var(--fz-ink-3)]">Cargando…</p>
        ) : (
          <div className="flex flex-col">
            {activos.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-3 border-b border-[var(--fz-hairline)] last:border-0">
                <ProfileDot accent={p.accent} size={14} />

                <div className="min-w-0 flex-1">
                  {editing === p.id ? (
                    <div className="flex items-center gap-2">
                      <TextField
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void renombrar(p.id) }}
                        autoFocus
                      />
                      <Btn onClick={() => void renombrar(p.id)}>Guardar</Btn>
                      <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
                    </div>
                  ) : (
                    <>
                      <p className="text-[15px] font-semibold truncate">
                        {p.name}
                        {p.id === profileId && (
                          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--fz-accent)]">
                            Activo
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {p.is_default ? 'Principal · ' : ''}{ACCENT_LABEL[p.accent]}
                        {/* `has_movements` mira las 16 tablas del perfil, no
                            solo movimientos: una persona cargada ya cuenta. Por
                            eso la etiqueta dice "con datos" y no "con
                            movimientos", que prometía menos de lo que mide. */}
                        {p.has_movements ? ' · con datos' : ' · vacío'}
                      </p>
                    </>
                  )}
                </div>

                {editing !== p.id && (
                  <RowMenu
                    items={[
                      {
                        label: 'Renombrar',
                        icon: <IconPencil size={17} stroke={1.8} />,
                        onClick: () => { setEditing(p.id); setEditName(p.name) },
                      },
                      ...ACCENT_KEYS.filter(a => a !== p.accent).map(a => ({
                        label: `Color: ${ACCENT_LABEL[a]}`,
                        icon: <IconPalette size={17} stroke={1.8} />,
                        onClick: () => void call(`/api/finanzas/profiles/${p.id}`, json({ accent: a }, 'PATCH'), 'No se pudo cambiar el color'),
                      })),
                      // El principal no se borra ni se archiva: es a donde salta
                      // la app cuando archivás el activo.
                      ...(p.is_default ? [] : [
                        p.has_movements
                          ? {
                              label: 'Archivar',
                              icon: <IconArchive size={17} stroke={1.8} />,
                              title: 'Tiene movimientos: se archiva en vez de borrarse, para no perder su historia',
                              onClick: () => void call(`/api/finanzas/profiles/${p.id}/archive`, json({ archived: true }, 'POST'), 'No se pudo archivar'),
                            }
                          : {
                              label: 'Borrar',
                              icon: <IconTrash size={17} stroke={1.8} />,
                              danger: true,
                              onClick: () => void call(`/api/finanzas/profiles/${p.id}`, { method: 'DELETE' }, 'No se pudo borrar'),
                            },
                      ]),
                    ]}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {creating ? (
          <div className="mt-4 pt-4 border-t border-[var(--fz-hairline)] flex flex-col gap-3">
            <div>
              <Label>Nombre</Label>
              <TextField
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void crear() }}
                placeholder="Empresa, Proyecto, Familia…"
                autoFocus
              />
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_KEYS.map(a => {
                  const elegido = (newAccent ?? sugerido) === a
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setNewAccent(a)}
                      aria-pressed={elegido}
                      className={`flex items-center gap-2 px-3 py-2 rounded-[var(--fz-r-pill)] border text-[13px] font-semibold transition-colors ${
                        elegido
                          ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]'
                          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]'
                      }`}
                    >
                      <ProfileDot accent={a} />
                      {ACCENT_LABEL[a]}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] text-[var(--fz-ink-3)]">
                El color pinta toda la app mientras estés en este perfil. Es cómo sabes en
                cuál estás sin tener que mirar el nombre.
              </p>
            </div>

            <div className="flex gap-2">
              <Btn onClick={() => void crear()}>Crear perfil</Btn>
              <Btn variant="ghost" onClick={() => { setCreating(false); setNewName(''); setNewAccent(null) }}>
                Cancelar
              </Btn>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-[var(--fz-hairline)]">
            <Btn variant="ghost" onClick={() => setCreating(true)}>
              <IconPlus size={16} stroke={2.2} />
              Crear perfil
            </Btn>
          </div>
        )}
      </Panel>

      {archivados.length > 0 && (
        <Panel>
          <p className="text-[13px] font-semibold mb-1">Archivados</p>
          <p className="text-[12px] text-[var(--fz-ink-3)] mb-3">
            No aparecen en el selector, pero sus datos siguen intactos.
          </p>
          {archivados.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-3 border-b border-[var(--fz-hairline)] last:border-0">
              <ProfileDot accent={p.accent} size={14} />
              <p className="min-w-0 flex-1 text-[15px] font-semibold truncate text-[var(--fz-ink-2)]">{p.name}</p>
              <Btn
                variant="ghost"
                onClick={() => void call(`/api/finanzas/profiles/${p.id}/archive`, json({ archived: false }, 'POST'), 'No se pudo reactivar')}
              >
                <IconArchiveOff size={16} stroke={1.8} />
                Reactivar
              </Btn>
            </div>
          ))}
        </Panel>
      )}
    </SettingsPage>
  )
}
