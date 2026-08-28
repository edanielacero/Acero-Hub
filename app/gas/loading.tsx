export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      {/* Sobre negro no se vería: el canvas de Gas es claro (ver theme.css). */}
      <div className="h-5 w-16 animate-pulse rounded bg-black/5" />
      <div className="mt-4 h-[300px] animate-pulse rounded-2xl bg-black/5" />
      <div className="mt-4 h-9 animate-pulse rounded-xl bg-black/5" />
    </div>
  )
}
