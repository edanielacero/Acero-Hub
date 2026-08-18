/**
 * Sin este límite, navegar a Finanzas se quedaba en la pantalla anterior hasta
 * que el layout terminara de resolver el gate de acceso, sin ninguna señal.
 */
export default function Loading() {
  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <div className="h-8 w-40 rounded-lg bg-white/5 animate-pulse" />
      <div className="mt-6 h-32 rounded-2xl bg-white/5 animate-pulse" />
      <div className="mt-3 h-24 rounded-2xl bg-white/5 animate-pulse" />
    </div>
  )
}
