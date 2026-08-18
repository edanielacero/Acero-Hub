import { createAdminClient, requireUser } from '@/lib/supabase-server'
import { listProjects, type ProjectRow } from '@/lib/access'
import ProjectCard from '@/components/ProjectCard'
import ProfileMenu from '@/components/ProfileMenu'
import Link from 'next/link'
import { PROJECT_ASSETS } from '@/lib/project-assets'

// Slugs visibles sin login
const PUBLIC_SLUGS: string[] = []

export default async function Home() {
  const { userId, claims, role: claimRole } = await requireUser()

  // Todo lo que sigue sale de una sola tanda en paralelo. Antes eran cuatro
  // queries en serie detrás de un getUser(): cada una esperaba a la anterior.
  const admin = createAdminClient()
  const [profileRes, projects, accessRes] = await Promise.all([
    userId
      ? admin.from('profiles').select('name, role').eq('id', userId).single()
      : null,
    listProjects(),
    // Solo se saltea si el JWT ya confirmó que es admin: en ese caso ve todo y
    // la tabla de accesos no aporta nada.
    userId && claimRole !== 'admin'
      ? admin.from('project_access').select('project_id').eq('user_id', userId)
      : null,
  ])

  const profile = profileRes?.data ?? null
  const isAdmin = (claimRole ?? profile?.role) === 'admin'

  const publicProjects = PUBLIC_SLUGS.length
    ? projects.filter(p => PUBLIC_SLUGS.includes(p.slug))
    : []

  let privateProjects: ProjectRow[] = []
  if (userId) {
    if (isAdmin) {
      privateProjects = projects.filter(p => !PUBLIC_SLUGS.includes(p.slug))
    } else {
      const ids = new Set((accessRes?.data ?? []).map(a => a.project_id))
      privateProjects = projects.filter(p => ids.has(p.id) && !PUBLIC_SLUGS.includes(p.slug))
    }
  }

  const allProjects = [...publicProjects, ...privateProjects]
  const user = userId ? { email: claims?.email ?? '' } : null

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">

      {/* Top bar */}
      <div className="w-full max-w-4xl flex items-center justify-end gap-4 mb-12">
        {isAdmin && (
          <Link href="/admin" className="text-xs text-[#444] hover:text-[#888] transition-colors font-[family-name:var(--font-body)]">
            Admin
          </Link>
        )}
        {user && profile ? (
          <ProfileMenu name={profile.name ?? ''} email={user.email ?? ''} />
        ) : (
          <Link
            href="/login"
            className="text-xs font-semibold text-[#666] hover:text-[#f0f0f0] border border-[#222] hover:border-[#444] bg-[#0f0f0f] hover:bg-[#141414] rounded-lg px-3 py-1.5 transition-all"
          >
            Iniciar sesión
          </Link>
        )}
      </div>

      {/* Hero */}
      <div className="text-center mb-14">
        <h1 className="text-[clamp(40px,6vw,64px)] font-bold tracking-[-0.04em] leading-none text-[#f5f5f5]">
          Acero Hub
        </h1>
      </div>

      {/* Grid */}
      <div className="w-full max-w-4xl grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {allProjects.map(project => {
          const assets = PROJECT_ASSETS[project.slug]
          if (!assets) return null
          return (
            <ProjectCard
              key={project.id}
              href={`/${project.slug}`}
              name={project.name}
              description={project.description}
              icon={assets.icon}
              banner={assets.banner}
            />
          )
        })}
      </div>

      {/* CTA para usuarios sin sesión */}
      {!user && (
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
