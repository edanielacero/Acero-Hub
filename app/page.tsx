'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ProjectCard from '@/components/ProjectCard'
import ProfileMenu from '@/components/ProfileMenu'
import { PROJECT_ASSETS } from '@/lib/project-assets'

/**
 * Portada del Hub. Es un componente de cliente para que la ruta se sirva
 * estática: así entrar y volver desde una mini-app es instantáneo, sin viaje al
 * servidor. Todo lo que necesita pintar (nombre, rol y mini-apps permitidas)
 * viaja firmado dentro del token, así que resolverlo no cuesta ninguna query
 * — solo verificar la firma del JWT, que es local.
 *
 * El acceso real lo sigue imponiendo proxy.ts en el servidor, y los datos de
 * cada mini-app sus propias rutas de /api con RLS.
 */
type Session = {
  name: string
  email: string
  isAdmin: boolean
  slugs: string[]
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data } = await createClient().auth.getClaims()
      const claims = data?.claims as
        | { email?: string; app_metadata?: { role?: string; name?: string; projects?: string[] } }
        | undefined

      if (claims) {
        const meta = claims.app_metadata ?? {}
        setSession({
          name: meta.name ?? '',
          email: claims.email ?? '',
          isAdmin: meta.role === 'admin',
          slugs: meta.projects ?? [],
        })
      }
      setReady(true)
    })()
  }, [])

  // Solo se muestran las mini-apps que además tienen su tarjeta definida en el
  // código: una fila en `projects` sin assets todavía no se puede pintar.
  const projects = (session?.slugs ?? []).filter(slug => PROJECT_ASSETS[slug])

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">

      {/* Top bar */}
      <div className="w-full max-w-4xl flex items-center justify-end gap-4 mb-12 min-h-[34px]">
        {session?.isAdmin && (
          <Link href="/admin" className="text-xs text-[#444] hover:text-[#888] transition-colors font-[family-name:var(--font-body)]">
            Admin
          </Link>
        )}
        {session ? (
          <ProfileMenu name={session.name} email={session.email} />
        ) : ready ? (
          <Link
            href="/login"
            className="text-xs font-semibold text-[#666] hover:text-[#f0f0f0] border border-[#222] hover:border-[#444] bg-[#0f0f0f] hover:bg-[#141414] rounded-lg px-3 py-1.5 transition-all"
          >
            Iniciar sesión
          </Link>
        ) : null}
      </div>

      {/* Hero */}
      <div className="text-center mb-14">
        <h1 className="text-[clamp(40px,6vw,64px)] font-bold tracking-[-0.04em] leading-none text-[#f5f5f5]">
          Acero Hub
        </h1>
      </div>

      {/* Grid */}
      <div className="w-full max-w-4xl grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {projects.map(slug => {
          const assets = PROJECT_ASSETS[slug]
          return (
            <ProjectCard
              key={slug}
              href={`/${slug}`}
              name={assets.name}
              description={assets.description}
              icon={assets.icon}
              banner={assets.banner}
            />
          )
        })}
      </div>

      {/* CTA para usuarios sin sesión */}
      {ready && !session && (
        <p className="mt-14 text-xs text-[#333]">
          <Link href="/login" className="hover:text-[#666] transition-colors underline underline-offset-2">
            Inicia sesión
          </Link>{' '}
          para acceder a más herramientas
        </p>
      )}

    </main>
  )
}
