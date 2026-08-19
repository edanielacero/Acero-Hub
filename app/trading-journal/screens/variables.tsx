'use client'

import { use } from 'react'
import VariablesContent from '@/app/trading-journal/variables-content'

export default function VariablesPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808]">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-12">
        <h2 className="text-[18px] font-black text-slate-900 dark:text-white tracking-tight mb-4">Variables</h2>
        <VariablesContent sessionId={sessionId} />
      </div>
    </div>
  )
}
