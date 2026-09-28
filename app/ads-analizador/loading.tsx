export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
      <div className="h-6 w-40 animate-pulse rounded bg-black/5" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-black/5" />
        <div className="h-40 animate-pulse rounded-2xl bg-black/5" />
      </div>
    </div>
  )
}
