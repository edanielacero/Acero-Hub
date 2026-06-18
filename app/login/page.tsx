'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-[360px] flex flex-col gap-8">

        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Acero Hub</h1>
          <p className="mt-2 text-sm text-[#555] font-[family-name:var(--font-body)]">
            Ingresa con tu cuenta
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-[#888] uppercase tracking-wider">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
              placeholder="tu@correo.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[#888] uppercase tracking-wider">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 font-[family-name:var(--font-body)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-[#f5f5f5] text-[#0a0a0a] font-semibold text-sm rounded-xl py-3 hover:bg-white transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-[#333] font-[family-name:var(--font-body)]">
          Acceso solo por invitación
        </p>
      </div>
    </div>
  )
}
