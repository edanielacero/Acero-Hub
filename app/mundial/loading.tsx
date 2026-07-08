export default function MundialLoading() {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-[#1a1a1a] border-t-[#22c55e]/60 animate-spin" />
        <span className="text-xs text-[#333] tracking-widest uppercase font-mono">Mundial 2026</span>
      </div>
    </div>
  )
}
