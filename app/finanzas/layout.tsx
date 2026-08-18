import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/access'
import { Shell } from './components/shell'
import './theme.css'

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Finanzas personales',
}

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  // Mini-app personal: no hay chequeo de project_access porque no hay nada que
  // compartir. El único gate es ser admin.
  await requireAdmin()

  return (
    <div id="fz-root">
      <Shell>{children}</Shell>
    </div>
  )
}
