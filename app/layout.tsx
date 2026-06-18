import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-heading',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Acero Hub',
  description: 'Proyectos personales',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${spaceGrotesk.variable} ${inter.variable} font-heading bg-[#0a0a0a] text-[#f5f5f5] antialiased`}>
        {children}
      </body>
    </html>
  )
}
