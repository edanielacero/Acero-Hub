import Link from 'next/link'
import { ReactNode } from 'react'

interface ProjectCardProps {
  href: string
  name: string
  description: string
  icon: ReactNode
  banner: ReactNode
}

export default function ProjectCard({ href, name, icon, banner }: ProjectCardProps) {
  return (
    <Link
      href={href}
      className="group bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-colors duration-200 hover:bg-[#151515] hover:border-[#2e2e2e]"
    >
      {/* Banner */}
      <div className="w-full h-[120px] overflow-hidden bg-[#0d0d0d] shrink-0">
        {banner}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 p-6">
        {/* Icon */}
        <div className="w-9 h-9 rounded-xl bg-[#1a1a1a] border border-[#252525] flex items-center justify-center text-[#888]">
          {icon}
        </div>

        {/* Title */}
        <h2 className="text-[17px] font-bold tracking-tight text-[#f5f5f5] leading-snug font-[family-name:var(--font-heading)]">
          {name}
        </h2>
      </div>
    </Link>
  )
}
