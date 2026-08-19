'use client'

import { ReactNode, useEffect } from 'react'
import { IconPencil, IconTrash, IconX } from '@tabler/icons-react'
import { Btn } from './ui'

/**
 * Resumen de una fila antes de tocarla: el tap en un elemento de lista abre
 * esto, nunca el formulario de edición directo — así un toque no puede
 * cambiar ni borrar nada por accidente (feedback del usuario: "para todas
 * las listas existentes y futuras"). El mismo componente lo usan todas las
 * listas de la mini-app, igual que <RowMenu> y <DeleteConfirmSheet>.
 *
 * `children` arma la vista previa con lo que cada pantalla ya tiene a mano —
 * típicamente un <DeletePreview> (ícono/título/monto) seguido de algunos
 * <DetailField> con el resto de los datos. Editar y Eliminar recién actúan
 * cuando se tocan acá adentro: quien llama sigue siendo dueño de abrir el
 * sheet de edición real o el <DeleteConfirmSheet> de siempre.
 */
export function DetailSheet({ open, onClose, title, onEdit, onDelete, children }: {
  open: boolean
  onClose: () => void
  title: string
  /** Sin esto no se muestra el botón — por ejemplo una fila sin edición propia. */
  onEdit?: () => void
  onDelete?: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {children}

          {(onEdit || onDelete) && (
            <div className="flex gap-2 pt-1">
              {onDelete && (
                <Btn variant="danger" onClick={onDelete} full={!onEdit}>
                  <IconTrash size={16} stroke={1.8} /> Eliminar
                </Btn>
              )}
              {onEdit && (
                <Btn onClick={onEdit} full={!onDelete}>
                  <IconPencil size={16} stroke={1.8} /> Editar
                </Btn>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Fila de dato dentro del resumen: etiqueta a la izquierda, valor a la
    derecha. Se salta sola cuando no hay valor, para no dejar una fila vacía. */
export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--fz-hairline)] last:border-0">
      <span className="text-[13px] text-[var(--fz-ink-2)]">{label}</span>
      <span className="text-[14px] font-semibold text-right fz-num">{value}</span>
    </div>
  )
}
