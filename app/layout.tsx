import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { SessionKeeper } from '@/components/SessionKeeper'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
})

export const metadata: Metadata = {
  title: 'Acero Hub',
  description: 'Proyectos personales',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${jakarta.variable} font-[family-name:var(--font-jakarta)] antialiased`}>
        <SessionKeeper />
        {children}
      </body>
    </html>
  )
}
