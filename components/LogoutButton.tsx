'use client'

import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-[#444] hover:text-[#888] transition-colors cursor-pointer font-[family-name:var(--font-body)]"
    >
      Cerrar sesión
    </button>
  )
}
