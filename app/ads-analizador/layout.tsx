import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AccessGate } from '@/components/AccessGate'
import { AdsRouterProvider } from './router'
import { AdsProvider } from './components/data'
import './theme.css'

// Tipografía propia de la mini-app (el Hub usa Plus Jakarta Sans). Inter por
// legibilidad en tamaños chicos y por sus cifras tabulares: esta app es casi
// toda números — ROAS, gasto, conversiones.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ads',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ads Analizador',
  description: 'Semáforo de campañas de Meta Ads',
}

export const viewport: Viewport = {
  themeColor: '#F5F6F8',
  viewportFit: 'cover',
}

/*
  El gate vive en <AccessGate>. Este layout no toca la base a propósito: en
  cuanto lo hiciera, la ruta pasaría a dinámica y cada navegación costaría un
  viaje al servidor.
*/
export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="ads-root"
      className={`${inter.variable} font-[family-name:var(--font-ads)] min-h-[100dvh]`}
    >
      <AccessGate project="ads-analizador">
        <AdsRouterProvider>
          <AdsProvider>{children}</AdsProvider>
        </AdsRouterProvider>
      </AccessGate>
    </div>
  )
}
