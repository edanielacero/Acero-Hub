import { createClient, createAdminClient } from '@/lib/supabase-server'
import ProjectCard from '@/components/ProjectCard'
import ProfileMenu from '@/components/ProfileMenu'
import Link from 'next/link'
import { PROJECT_ASSETS } from '@/lib/project-assets'

// Slugs visibles sin login
const PUBLIC_SLUGS = ['daily']

export default async function Home() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Proyectos públicos — siempre visibles, admin client para bypass de RLS
  const { data: publicProjects } = await admin
    .from('projects')
    .select('id, name, slug, description')
    .in('slug', PUBLIC_SLUGS)

  let profile: { name: string; role: string } | null = null
  let privateProjects: { id: string; name: string; slug: string; description: string | null }[] = []

  if (user) {
    const { data: p } = await admin.from('profiles').select('name, role').eq('id', user.id).single()
    profile = p
    const isAdmin = profile?.role === 'admin'

    if (isAdmin) {
      // Admin ve todo excepto los públicos (ya los tiene arriba)
      const { data } = await admin
        .from('projects')
        .select('id, name, slug, description')
        .order('name')
      privateProjects = (data ?? []).filter(p => !PUBLIC_SLUGS.includes(p.slug))
    } else {
      // Usuario normal: solo sus proyectos con acceso, excluyendo públicos
      const { data: access } = await admin
        .from('project_access')
        .select('project_id')
        .eq('user_id', user.id)
      const ids = (access ?? []).map(a => a.project_id)
      if (ids.length > 0) {
        const { data } = await admin
          .from('projects')
          .select('id, name, slug, description')
          .in('id', ids)
          .order('name')
        privateProjects = (data ?? []).filter(p => !PUBLIC_SLUGS.includes(p.slug))
      }
    }
  }

  const allProjects = [...(publicProjects ?? []), ...privateProjects]
  const isAdmin = profile?.role === 'admin'

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
