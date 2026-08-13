'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'fin_amounts_hidden'
const MASK = '••••'

const AmountVisibilityContext = createContext<{ hidden: boolean; toggle: () => void } | null>(null)

export function AmountVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored != null) setHidden(stored === '1')
    } catch {}
  }, [])

  function toggle() {
    setHidden(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <AmountVisibilityContext.Provider value={{ hidden, toggle }}>
      {children}
    </AmountVisibilityContext.Provider>
  )
}

export function useAmountVisibility() {
  const ctx = useContext(AmountVisibilityContext)
  if (!ctx) throw new Error('useAmountVisibility debe usarse dentro de <AmountVisibilityProvider>')
  return ctx
}

// Envuelve cualquier monto formateado — lo reemplaza por •••• (conservando el
// signo +/- si lo hay, pero no el símbolo de moneda) cuando el usuario activó el
// modo privado, ej. mirando el teléfono en público.
export function Amount({ children, className, style }: { children: string; className?: string; style?: React.CSSProperties }) {
  const { hidden } = useAmountVisibility()
  if (!hidden) return <span className={className} style={style}>{children}</span>
  const sign = /^\s*[+-]/.exec(children)?.[0].trim() ?? ''
  return <span className={className} style={style}>{sign}{MASK}</span>
}
