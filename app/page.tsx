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

type Claims = {
  email?: string
  app_metadata?: { role?: string; name?: string; projects?: string[] }
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Un solo cliente para las dos lecturas: auth-js cachea el JWKS en la
    // instancia, así que verificar el segundo token no vuelve a bajarlo.
    const supabase = createClient()
    let vivo = true

    const aplicar = (claims: Claims | undefined) => {
      if (!claims) return
      const meta = claims.app_metadata ?? {}
      setSession({
        name: meta.name ?? '',
        email: claims.email ?? '',
        isAdmin: meta.role === 'admin',
        slugs: meta.projects ?? [],
      })
    }

    void (async () => {
      const { data } = await supabase.auth.getClaims()
      if (!vivo) return

      aplicar(data?.claims as Claims | undefined)
      setReady(true)
      if (!data?.claims) return

      /*
        Las mini-apps permitidas viajan firmadas dentro del token, así que un
        acceso recién concedido no se ve hasta que el token se renueva: antes
        eso era esperar hasta una hora, o cerrar sesión y volver a entrar.

        Acá se pide un token nuevo a propósito. GoTrue vuelve a correr el
        custom access token hook, que recalcula `app_metadata.projects` contra
        `project_access` — verificado de punta a punta: con el token ya emitido
        y el permiso dado después, el refresh trae el slug nuevo.

        Va DESPUÉS del primer pintado y fuera del camino crítico: la portada se
        dibuja con lo que ya decía la cookie y la tarjeta nueva aparece sola
        cuando llega la respuesta. Recargar la página alcanza.
      */
      const { error } = await supabase.auth.refreshSession()
      if (!vivo || error) return

      const { data: fresco } = await supabase.auth.getClaims()
      if (!vivo) return
      aplicar(fresco?.claims as Claims | undefined)
    })()

    return () => { vivo = false }
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
      {/* `min(280px,100%)` y no `280px` pelado: el mínimo de un minmax() es un
          piso duro, así que en una pantalla de 320px las tarjetas seguían
          midiendo 280 dentro de una pista de 272 y se salían 8px por la
          derecha. Acá no hay `overflow-x` que lo recorte —eso solo existe
          dentro de Finanzas—, así que el Hub ganaba scroll horizontal. Con el
          min() el piso cede cuando no entra; de 360px para arriba no cambia
          nada. */}
      <div className="w-full max-w-4xl grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3">
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
