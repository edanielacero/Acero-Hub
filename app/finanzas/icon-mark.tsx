/**
 * La marca de Finanzas para los íconos de instalación.
 *
 * Un solo lugar para las tres medidas (180 de iOS, 192 y 512 del manifest): si
 * el dibujo vive en cada ruta, tarde o temprano una queda distinta y el ícono
 * del teléfono deja de ser el de la pantalla de inicio del escritorio.
 *
 * DECISIONES DE DIBUJO
 *
 * · **Formas sólidas, no trazos.** La marca del Hub es un glifo de línea de
 *   1.8px, que a 60×60 en una pantalla de inicio prácticamente desaparece. Las
 *   mismas barras, rellenas y con las esquinas redondeadas, aguantan cualquier
 *   tamaño.
 *
 * · **Una moneda coronando la barra más alta.** Es lo que separa esto de un
 *   gráfico de barras genérico: ata "plata" con "finanzas" en una sola figura,
 *   y da un punto de descanso al ojo arriba a la derecha.
 *
 * · **Cuadrado a sangre, sin esquinas redondeadas propias.** iOS aplica su
 *   propia máscara; si además redondeáramos acá, quedaría un halo verde oscuro
 *   contra el fondo del sistema.
 *
 * · **Crema, no blanco puro.** #F4EFE2 sobre el verde bosque del hero. El
 *   blanco puro sobre este verde vibra; el crema se asienta.
 */

export const VERDE = '#12281D'
export const CREMA = '#F4EFE2'

export function IconMark({ size }: { size: number }) {
  // Todo se dibuja en una grilla de 100 y se escala: así las proporciones son
  // idénticas en las tres medidas.
  const u = size / 100

  return (
    <div
      style={{
        width: size,
        height: size,
        background: VERDE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Las tres barras, ascendentes. El radio es la mitad del ancho: cada
            barra termina en semicírculo, como una pila de fichas vista de
            canto. */}
        <rect x="20" y="58" width="11" height="24" rx="5.5" fill={CREMA} />
        <rect x="38.5" y="46" width="11" height="36" rx="5.5" fill={CREMA} />
        <rect x="57" y="34" width="11" height="48" rx="5.5" fill={CREMA} />

        {/* La moneda. Anillo y no disco: un disco lleno compite con las barras
            por el peso visual; el anillo se lee como moneda y deja respirar. */}
        <circle cx="72.5" cy="22" r="11" stroke={CREMA} strokeWidth={5 * (u / u)} fill="none" />

        {/* La línea de base, al 45%: sugiere el suelo sin pelear con las barras. */}
        <rect x="17" y="86" width="54" height="4.5" rx="2.25" fill={CREMA} opacity="0.45" />
      </svg>
    </div>
  )
}
