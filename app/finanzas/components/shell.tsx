'use client'

import { ReactNode } from 'react'
import { AccountValueProvider } from './account-value-context'
import { AccountValueSheet } from './account-value-sheet'
import { FinanzasProvider } from './data-context'
import { QuickAddProvider } from './quick-add-context'
import { QuickAdd } from './quick-add'
import { FzRouterProvider } from './router'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'

/**
 * Un solo árbol de componentes para los dos modos (§8 del documento de UI):
 * la sidebar aparece a partir de 900px y la tab bar desaparece en el mismo
 * corte. No se renderiza dos veces según el ancho.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <FzRouterProvider>
      <FinanzasProvider>
        <QuickAddProvider>
        <AccountValueProvider>
        {/*
          `overflow-x: clip` como red de seguridad: si algún día un contenido se
          pasa de ancho, la página no gana scroll horizontal y el tab bar —que
          es `position: fixed` contra el viewport— no se desincroniza del
          contenido. Va acá y no en #fz-root porque <TabBar> es HERMANO de este
          div, no descendiente: recortar acá nunca lo afecta.
        */}
          <div className="fz-content-pad min-h-[100dvh] overflow-x-clip p-0 min-[900px]:p-5">
            <div className="mx-auto flex gap-5 max-w-[1440px]">
              <Sidebar />
              <main className="flex-1 min-w-0">{children}</main>
            </div>
          </div>
          <TabBar />
          <QuickAdd />
          <AccountValueSheet />
        </AccountValueProvider>
        </QuickAddProvider>
      </FinanzasProvider>
    </FzRouterProvider>
  )
}
