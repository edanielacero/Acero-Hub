/**
 * La marca de Gas para los íconos de instalación.
 *
 * Un solo lugar para las tres medidas (180 de iOS, 192 y 512 del manifest): si
 * el dibujo vive en cada ruta, tarde o temprano una queda distinta y el ícono
 * del teléfono deja de ser el del escritorio.
 *
 * Es el MISMO medidor de combustible que la tarjeta del Hub (ver
 * lib/project-assets.tsx): ámbar sobre negro cálido. Que el ícono de la
 * pantalla de inicio y la tarjeta del portal sean lo mismo es lo que hace que
 * se reconozcan como la misma app.
 *
 * DECISIONES DE DIBUJO
 *
 * · **Trazos gruesos, no de 1.8px.** El glifo del Hub es una línea fina que a
 *   60×60 en una pantalla de inicio desaparece. Acá el arco va a 11 de 100.
 *
 * · **Sin la palabra GAS.** En el banner del Hub entra porque son 400px de
 *   ancho; a 60px sería una mancha. El medidor solo ya es reconocible.
 *
 * · **Cuadrado a sangre, sin esquinas redondeadas propias.** iOS aplica su
 *   propia máscara; redondear acá dejaría un halo contra el fondo del sistema.
 *
 * ⚠️ Esta paleta es SOLO del ícono. La app por dentro es clara (theme.css).
 * Son dos cosas distintas: el ícono vive entre los de otras apps.
 */

export const NEGRO_CALIDO = '#14110B'
export const NEGRO_HONDO = '#0B0C0F'
export const AMBAR = '#F5A524'

export function IconMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `linear-gradient(150deg, ${NEGRO_CALIDO} 0%, ${NEGRO_HONDO} 100%)`,
      }}
    >
      {/* Todo en una grilla de 100 y escalado: las proporciones son idénticas
          en las tres medidas. El medidor está centrado en (50,66) — más abajo
          del centro geométrico, porque el arco carga el peso arriba y a la
          cuenta exacta se veía alto en el cuadro. */}
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Arco vacío */}
        <path
          d="M20 66 A30 30 0 0 1 80 66"
          stroke={AMBAR}
          strokeOpacity="0.22"
          strokeWidth="11"
          strokeLinecap="round"
        />
        {/* Arco lleno: poco más de un tercio, como un tanque a medio andar */}
        <path
          d="M20 66 A30 30 0 0 1 80 66"
          stroke={AMBAR}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="36 100"
        />
        {/* Aguja */}
        <path d="M50 66 L34 44" stroke={AMBAR} strokeWidth="7" strokeLinecap="round" />
        <circle cx="50" cy="66" r="7" fill={AMBAR} />
      </svg>
    </div>
  )
}
