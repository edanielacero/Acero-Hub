import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const size = Math.min(512, Math.max(16, Number(searchParams.get('size') ?? '192')))
  const fontSize = Math.round(size * 0.46)

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#080808',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#f0f0f0',
            fontSize,
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: 'sans-serif',
          }}
        >
          D
        </span>
      </div>
    ),
    { width: size, height: size }
  )
}
