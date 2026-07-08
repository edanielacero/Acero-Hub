export default function TradingLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-[#1e1e1e] border-t-[#444] animate-spin" />
        <span className="text-xs text-[#333] tracking-widest uppercase font-mono">Trading Journal</span>
      </div>
    </div>
  )
}
