'use client'

import { ReactNode } from 'react'
import { FinanzasProvider } from './data-context'
import { QuickAddProvider } from './quick-add-context'
import { QuickAdd } from './quick-add'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'

/**
 * Un solo árbol de componentes para los dos modos (§8 del documento de UI):
 * la sidebar aparece a partir de 900px y la tab bar desaparece en el mismo
 * corte. No se renderiza dos veces según el ancho.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <FinanzasProvider>
      <QuickAddProvider>
        <div className="fz-content-pad min-h-[100dvh] p-0 min-[900px]:p-5">
          <div className="mx-auto flex gap-5 max-w-[1440px]">
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </div>
        <TabBar />
        <QuickAdd />
      </QuickAddProvider>
    </FinanzasProvider>
  )
}
