import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AccessGate } from '@/components/AccessGate'
import { TjRouterProvider } from './router'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-tj',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Registro y análisis de operaciones de trading',
}

// Tema fijo: la elección de acento/modo por perfil se discontinuó, y nadie
// escribe ya esas columnas. El CSS de globals.css sigue resolviendo las
// variables desde [data-accent]/[data-mode], así que los valores quedan como
// constantes en vez de costar una consulta a `profiles` por request.
const ACCENT = 'blue'
const MODE = 'dark'

// El gate vive en <AccessGate>. Sin consultas acá, la ruta se sirve estática.
export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="tj-root" data-accent={ACCENT} data-mode={MODE} className={`${inter.variable} font-[family-name:var(--font-tj)] min-h-screen`}>
      <AccessGate project="trading-journal">
        <TjRouterProvider>{children}</TjRouterProvider>
      </AccessGate>
    </div>
  )
}
