import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getJwks } from './lib/jwks'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Las rutas de API hacen su propio chequeo de auth en cada route handler —
  // repetirlo acá era un round-trip completo a Supabase Auth desperdiciado
  // en cada request de API de todo el Hub.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() en vez de getUser(): verifica la firma del JWT localmente en
  // lugar de pegarle a /auth/v1/user. Sigue refrescando la sesión, porque por
  // dentro pasa por getSession() y eso es lo que reescribe las cookies.
  const jwks = await getJwks()
  const { data } = await supabase.auth.getClaims(undefined, jwks ? { keys: jwks } : undefined)
  const user = data?.claims
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/invite') || pathname.startsWith('/auth')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
