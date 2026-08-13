import { IconBell } from '@tabler/icons-react'
import ComingSoon from '@/app/finanzas/components/coming-soon'

export default function AlertasPage() {
  return (
    <ComingSoon
      title="Alertas"
      description="Presupuesto excedido, suscripciones por cobrarse y otros avisos llegan hacia el final del roadmap."
      Icon={IconBell}
    />
  )
}
