'use client'

import { use, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, name }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Error al crear la cuenta')
      setLoading(false)
      return
    }

    const supabase = createClient()
    await supabase.auth.signInWithPassword({ email: data.email, password })
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-[360px] flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">Acero Hub</h1>
          <p className="mt-2 text-sm text-[#888] font-[family-name:var(--font-body)]">
            Crea tu contraseña para entrar
          </p>
        </div>

        <form onSubmit={handleAccept} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-medium text-[#888] uppercase tracking-wider">
              Tu nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
              placeholder="Daniel Acero"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[#888] uppercase tracking-wider">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#333] transition-colors font-[family-name:var(--font-body)]"
              placeholder="Mínimo 8 caracteres"
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
            {loading ? 'Creando cuenta...' : 'Crear cuenta y entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
