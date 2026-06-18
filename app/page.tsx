import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ProjectCard from '@/components/ProjectCard'
import LogoutButton from '@/components/LogoutButton'
import Link from 'next/link'

// Map slug → static assets (icon + banner defined in code)
import { PROJECT_ASSETS } from '@/lib/project-assets'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  let query = supabase.from('projects').select('id, name, slug, description')
  if (!isAdmin) {
    const { data: access } = await supabase.from('project_access').select('project_id').eq('user_id', user.id)
    const ids = (access || []).map(a => a.project_id)
    if (ids.length === 0) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center px-6">
          <h1 className="text-2xl font-bold tracking-tight text-[#f5f5f5] mb-3">Acero Hub</h1>
          <p className="text-sm text-[#555] font-[family-name:var(--font-body)]">Aún no tienes proyectos asignados.</p>
        </main>
      )
    }
    query = query.in('id', ids)
  }

  const { data: projects } = await query.order('name')

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">

      {/* Top bar */}
      <div className="w-full max-w-4xl flex justify-end gap-4 mb-12">
        {isAdmin && (
          <Link href="/admin" className="text-xs text-[#444] hover:text-[#888] transition-colors font-[family-name:var(--font-body)]">
            Admin
          </Link>
        )}
        <LogoutButton />
      </div>

      {/* Hero */}
      <div className="text-center mb-14">
        <h1 className="text-[clamp(40px,6vw,64px)] font-bold tracking-[-0.04em] leading-none text-[#f5f5f5]">
          Acero Hub
        </h1>
        <p className="mt-4 text-[11px] text-[#333] font-[family-name:var(--font-body)] tracking-wider">
          — Hecho por Daniel Acero
        </p>
      </div>

      {/* Grid */}
      <div className="w-full max-w-4xl grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {(projects || []).map(project => {
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

    </main>
  )
}
