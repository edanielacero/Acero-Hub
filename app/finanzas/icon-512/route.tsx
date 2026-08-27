import { ImageResponse } from 'next/og'

/**
 * Ícono de instalación de Finanzas, 512×512.
 *
 * Generado en vez de un PNG en `public/` para que siga los colores del tema:
 * el verde del hero y el lima que va encima, los mismos de `theme.css`.
 *
 * El glifo es el de la mini-app en la grilla del Hub (`lib/project-assets`):
 * las barras ascendentes. Que el ícono de la pantalla de inicio sea el mismo
 * que el de la grilla evita que parezcan dos apps distintas.
 */
export const runtime = 'edge'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#12281D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={512 * 0.56}
          height={512 * 0.56}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C8F169"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 18V9" />
          <path d="M9 18V5" />
          <path d="M15 18v-7" />
          <path d="M21 18V3" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
