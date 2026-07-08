'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  name: string
  email: string
}

export default function ProfileMenu({ name, email }: Props) {
  const [open, setOpen] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleChangePassword() {
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setResetSent(true)
  }

  const initials = (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-[11px] font-semibold text-[#666] hover:border-[#444] hover:text-[#aaa] transition-colors cursor-pointer"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-56 bg-[#111] border border-[#1e1e1e] rounded-2xl shadow-2xl overflow-hidden z-50">
          {/* Info */}
          <div className="px-4 py-3 border-b border-[#1a1a1a]">
            <p className="text-sm font-semibold text-[#f5f5f5] truncate">{name}</p>
            <p className="text-xs text-[#444] truncate mt-0.5 font-[family-name:var(--font-body)]">{email}</p>
          </div>

          {/* Actions */}
          <div className="p-1.5 flex flex-col gap-0.5">
            {resetSent ? (
              <p className="text-[11px] text-green-400 px-3 py-2 font-[family-name:var(--font-body)]">
                Correo enviado ✓
              </p>
            ) : (
              <button
                onClick={handleChangePassword}
                className="w-full text-left text-xs text-[#777] hover:text-[#f5f5f5] hover:bg-[#1a1a1a] px-3 py-2 rounded-xl transition-colors cursor-pointer font-[family-name:var(--font-body)]"
              >
                Cambiar contraseña
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full text-left text-xs text-[#555] hover:text-red-400 hover:bg-[#1a1a1a] px-3 py-2 rounded-xl transition-colors cursor-pointer font-[family-name:var(--font-body)]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
