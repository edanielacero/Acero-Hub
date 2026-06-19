import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mundial 2026',
  description: 'Quiniela FIFA Copa del Mundo 2026',
}

export default function MundialLayout({ children }: { children: React.ReactNode }) {
  return children
}
