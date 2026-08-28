/**
 * La marca de Gas para el encabezado de la mini-app.
 *
 * Es el mismo medidor que el ícono de instalación (ver ../icon-mark.tsx), pero
 * dibujado aparte y no reusando aquel PNG, por dos razones:
 *
 * · **Color.** El de la pantalla de inicio es ámbar sobre negro, que compite
 *   entre los íconos del sistema. Acá adentro, sobre papel claro, el ámbar
 *   quedaba estridente: va en blanco sobre el círculo oscuro.
 *
 * · **Encuadre.** Aquel dibujo lleva el medidor tres unidades por debajo del
 *   centro —corrección óptica para un cuadrado a sangre—, y dentro de un
 *   círculo esa misma corrección lo deja visiblemente bajo. Acá el medidor se
 *   centra a la cuenta y se dibuja más chico, con aire alrededor.
 */
export function MarcaGas({ size = 44 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--gas-ink)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* El dibujo ocupa poco más de la mitad del círculo: el resto es aire. */}
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 100 100" fill="none">
        {/*
          Centrado en (50,63) y no en (50,50): con el arco arriba y la maza
          abajo, la caja real del dibujo va de 31 a 68 — poniéndolo en 50 el
          medidor queda visiblemente alto dentro del círculo.

          El arco lleno cubre más de la mitad y la maza es chica: con el trazo
          grueso y un arco corto, a este tamaño la aguja y la maza se fundían en
          una mancha y el medidor no se leía como tal.
        */}
        <path d="M23 63 A27 27 0 0 1 77 63" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="9" strokeLinecap="round" />
        <path d="M23 63 A27 27 0 0 1 77 63" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeDasharray="47 120" />
        <path d="M50 63 L33 43" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
        <circle cx="50" cy="63" r="5.5" fill="#FFFFFF" />
      </svg>
    </span>
  )
}
