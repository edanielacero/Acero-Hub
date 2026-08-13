import type { ComponentType } from 'react'

export default function ComingSoon({ title, description, Icon }: { title: string; description: string; Icon: ComponentType<{ size?: number; stroke?: number }> }) {
  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4">
        <h1 className="fz-title">{title}</h1>
      </div>
      <div className="px-4">
        <div className="fz-card p-6 flex flex-col items-center text-center gap-3">
          <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>
            <Icon size={20} stroke={1.6} />
          </span>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Próximamente</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>
        </div>
      </div>
    </div>
  )
}
