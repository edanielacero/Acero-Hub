/**
 * La marca de Mis Finanzas para los íconos de instalación.
 *
 * Un solo lugar para las tres medidas (180 de iOS, 192 y 512 del manifest): si
 * el dibujo vive en cada ruta, tarde o temprano una queda distinta y el ícono
 * del teléfono deja de ser el del escritorio.
 *
 * DECISIONES DE DIBUJO
 *
 * · **Formas sólidas, no trazos.** La marca del Hub es un glifo de línea de
 *   1.8px, que a 60×60 en una pantalla de inicio prácticamente desaparece. Las
 *   mismas barras, rellenas y con esquinas redondeadas, aguantan cualquier
 *   tamaño.
 *
 * · **El círculo naranja es el que hace memorable al ícono.** Tres barras
 *   azules son un gráfico genérico que ya tienen veinte apps; el punto naranja
 *   fuera de la serie es lo que se recuerda de un vistazo en una pantalla llena.
 *
 * · **Cuadrado a sangre, sin esquinas redondeadas propias.** iOS aplica su
 *   propia máscara; si además redondeáramos acá quedaría un halo celeste
 *   contra el fondo del sistema.
 *
 * · **Fondo con un degradado apenas perceptible.** Un celeste plano se ve
 *   barato al lado de los íconos del sistema; dos tonos a un 4% de diferencia
 *   le dan volumen sin que se note el truco.
 *
 * ⚠️ Esta paleta es SOLO del ícono. La app por dentro sigue con el verde
 * bosque y el acento por perfil (`theme.css`). Son dos cosas distintas: el
 * ícono vive en la pantalla de inicio, entre los de otras apps.
 */

export const CELESTE_CLARO = '#EEF5FC'
export const CELESTE_HONDO = '#DAE7F6'
export const AZUL = '#1B3B63'
export const NARANJA = '#FB8028'

export function IconMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Más claro arriba, como si le diera la luz desde adelante.
        backgroundImage: `linear-gradient(160deg, ${CELESTE_CLARO} 0%, ${CELESTE_HONDO} 100%)`,
      }}
    >
      {/* Todo se dibuja en una grilla de 100 y se escala: las proporciones son
          idénticas en las tres medidas. */}
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        {/* Las tres barras, ascendentes, apoyadas en la misma línea de base.
            El radio es generoso (5 de 16 de ancho) para que acompañe la
            redondez que iOS le aplica al cuadrado.

            El grupo va de y=17 a y=81, centrado en 49: tres unidades más abajo
            del centro geométrico. Es corrección óptica — con el grupo centrado
            a la cuenta, el peso de las barras lo hacía ver alto en el cuadro. */}
        <rect x="24" y="60" width="16" height="21" rx="5" fill={AZUL} />
        <rect x="45" y="42" width="16" height="39" rx="5" fill={AZUL} />
        <rect x="66" y="24" width="16" height="57" rx="5" fill={AZUL} />

        {/* El círculo, arriba del hueco que deja la barra más corta. Disco
            lleno y no anillo: a 60px un anillo se cierra y se ve como una
            mancha. */}
        <circle cx="30" cy="29" r="12" fill={NARANJA} />
      </svg>
    </div>
  )
}
