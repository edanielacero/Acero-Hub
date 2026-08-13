import Link from 'next/link'
import { IconWallet, IconCategory2, IconArrowsExchange, IconUsers, IconBell, IconChevronRight } from '@tabler/icons-react'

const ITEMS = [
  { href: '/finanzas/cuentas', label: 'Cuentas', desc: 'Patrimonio y saldos por cuenta', Icon: IconWallet, tint: 'var(--text-accent)', bg: 'var(--bg-accent)' },
  { href: '/finanzas/categorias', label: 'Categorías', desc: 'Árbol de categorías y reglas de auto-categorización', Icon: IconCategory2, tint: 'var(--fill-warning)', bg: 'var(--bg-warning)' },
  { href: '/finanzas/tipo-cambio', label: 'Tipo de cambio', desc: 'USD/Bs oficial, paralelo y BTC/USDT', Icon: IconArrowsExchange, tint: 'var(--fill-success)', bg: 'var(--bg-success)' },
  { href: '/finanzas/personas', label: 'Personas', desc: 'Gastos compartidos y reembolsos', Icon: IconUsers, tint: 'var(--text-accent)', bg: 'var(--bg-accent)' },
  { href: '/finanzas/alertas', label: 'Alertas', desc: 'Avisos de presupuesto, suscripciones y más', Icon: IconBell, tint: 'var(--fill-danger)', bg: 'var(--bg-danger)' },
]

export default function MasPage() {
  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4">
        <h1 className="fz-title">Más</h1>
      </div>

      <div className="px-4">
        <div className="fz-card">
          {ITEMS.map(item => (
            <Link key={item.href} href={item.href} className="fz-row">
              <span className="fz-icon-circle" style={{ background: item.bg, color: item.tint }}>
                <item.Icon size={16} stroke={1.8} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px]" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                <span className="block text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>{item.desc}</span>
              </span>
              <IconChevronRight size={15} stroke={2} className="fz-chevron" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
