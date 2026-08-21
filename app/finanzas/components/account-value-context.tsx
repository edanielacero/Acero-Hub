'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { AccountWithBalance } from '@/lib/finanzas/types'

interface AccountValueState {
  open: boolean
  account: AccountWithBalance | null
}

interface AccountValueApi extends AccountValueState {
  openNew: (account: AccountWithBalance) => void
  close: () => void
}

const Ctx = createContext<AccountValueApi | null>(null)

const CLOSED: AccountValueState = { open: false, account: null }

/**
 * Estado de "Actualizar valor" (§7.2 de contexto_finanzas.md), en su propio
 * contexto — mismo patrón que `QuickAddProvider` — porque dos lugares
 * distintos necesitan poder abrirlo: el ⋮ de una cuenta en Cuentas, y el
 * botón extra de su `DetailSheet`.
 *
 * Sin modo edición: una actualización de valor no es un movimiento de
 * cuentas (§7.2), así que no aparece en Movimientos ni en "Últimos
 * movimientos" de la Home — no hay ninguna lista desde la que se pueda tocar
 * una para editarla. Corregir una vieja es abrir "Actualizar valor" de nuevo
 * con el número correcto de hoy, que registra un ajuste nuevo.
 */
export function AccountValueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccountValueState>(CLOSED)

  const openNew = useCallback(
    (account: AccountWithBalance) => setState({ open: true, account }),
    [],
  )
  const close = useCallback(() => setState(CLOSED), [])

  const value = useMemo(() => ({ ...state, openNew, close }), [state, openNew, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useAccountValueApi(): AccountValueApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccountValue debe usarse dentro de <AccountValueProvider>')
  return ctx
}

/** Abre "Actualizar valor" para una cuenta de inversión. */
export function useAccountValue(): (account: AccountWithBalance) => void {
  return useAccountValueApi().openNew
}

export { useAccountValueApi }
