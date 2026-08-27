'use client'

import { useEffect } from 'react'
import { IconCheck, IconSettings, IconUserCircle, IconX } from '@tabler/icons-react'
import type { AccentKey, Profile } from '@/lib/finanzas/types'
import { useFinanzas } from './data-context'
import { useFzRouter } from './router'
import { AJUSTES_HOME } from '../screens/ajustes/shared'

/**
 * El punto de color de un perfil.
 *
 * Lee el token del acento a través de un `data-accent` propio en vez de un hex
 * escrito acá: si mañana se retoca una paleta en theme.css, estos puntos se
 * retocan solos. Es el mismo principio que hace barato el acento por perfil.
 */
export function ProfileDot({ accent, size = 10 }: { accent: AccentKey; size?: number }) {
  return (
    <span
      data-accent={accent}
      style={{ width: size, height: size, background: 'var(--fz-accent)' }}
      className="rounded-full shrink-0"
      aria-hidden
    />
  )
}

/**
 * El botón de perfil del header de la Home, y su sheet.
 *
 * **Solo aparece con 2 o más perfiles**: con uno solo no hay nada que elegir, y
 * un selector de un elemento es ruido en un header que ya tiene el ojo y el
 * engranaje.
 */
export function ProfileSwitcher({ open, onOpen, onClose }: {
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const { profiles, profileId, switchProfile } = useFinanzas()

  if (profiles.length < 2) return null

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Cambiar de perfil"
        className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)] transition-colors"
      >
        <IconUserCircle size={18} stroke={1.8} />
      </button>

      {open && (
        <ProfileSheet
          profiles={profiles}
          activeId={profileId}
          onPick={id => { switchProfile(id); onClose() }}
          onClose={onClose}
        />
      )}
    </>
  )
}

function ProfileSheet({ profiles, activeId, onPick, onClose }: {
  profiles: Profile[]
  activeId: string | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const { navigate } = useFzRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Perfiles"
        className="fz-sheet relative w-full min-[900px]:w-[420px] bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Perfiles</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <p className="px-5 pb-4 text-[13px] text-[var(--fz-ink-3)]">
          Cada perfil tiene sus propias cuentas, movimientos y patrimonio. Nada se mezcla.
        </p>

        <div className="px-5 pb-3 flex flex-col gap-2" role="radiogroup" aria-label="Perfiles">
          {profiles.map(p => {
            const selected = p.id === activeId
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => (selected ? onClose() : onPick(p.id))}
                className={`flex items-center gap-3 text-left p-3.5 rounded-[var(--fz-r-tile)] border transition-colors ${
                  selected
                    ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                    : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                }`}
              >
                <ProfileDot accent={p.accent} size={12} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold truncate ${selected ? 'text-[var(--fz-accent)]' : ''}`}>
                    {p.name}
                  </p>
                </div>
                {selected && <IconCheck size={18} stroke={2.4} className="text-[var(--fz-accent)] shrink-0" />}
              </button>
            )
          })}
        </div>

        <div className="px-5 pb-6">
          <button
            type="button"
            onClick={() => { onClose(); navigate(`${AJUSTES_HOME}/perfiles`) }}
            className="flex items-center gap-2 w-full justify-center py-3 rounded-[var(--fz-r-pill)] text-[14px] font-semibold text-[var(--fz-ink-2)] bg-[var(--fz-surface-sunk)]"
          >
            <IconSettings size={16} stroke={1.8} />
            Gestionar perfiles
          </button>
        </div>
      </div>
    </div>
  )
}
