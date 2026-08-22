import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  // Sello de este build, fijo una vez compilado. El pull-to-refresh lo compara
  // contra /api/hub/version para notar que hay un deploy nuevo — sin esto, la
  // app agregada al home screen del iPhone se queda con el bundle viejo hasta
  // que el usuario la cierra del todo, porque no hay botón de refresh de Safari.
  env: {
    BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
}

export default nextConfig
