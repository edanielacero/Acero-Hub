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
  const user = data?.claims as Claims | undefined
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/invite') || pathname.startsWith('/auth')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Gate de las mini-apps. Vive acá y no en cada layout porque un layout que
  // consulta la base obliga a que la ruta sea dinámica, y eso cuesta un viaje
  // al servidor en cada navegación. Los permisos viajan firmados en el token
  // (ver 20260818030000_custom_claims_projects.sql), así que decidir acá no
  // cuesta ni una query y deja que las rutas se sirvan estáticas.
  //
  // Esto gatea la NAVEGACIÓN. Los datos los siguen protegiendo requireUser()
  // en cada /api y las policies de RLS — el claim puede quedar hasta ~1h
  // desactualizado y aun así no se filtra nada.
  if (user) {
    const slug = MINI_APPS.find(s => pathname === `/${s}` || pathname.startsWith(`/${s}/`))
    if (slug && !allowedProjects(user).includes(slug)) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // /admin solo se defendía desde el cliente, que no es una defensa. Con el
    // rol firmado en el token el chequeo de servidor sale gratis.
    if (pathname.startsWith('/admin') && user.app_metadata?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

type Claims = { sub: string; app_metadata?: { role?: string; projects?: string[] } }

/** Prefijos de ruta que son mini-apps y por lo tanto necesitan permiso. */
const MINI_APPS = ['finanzas', 'expandlogy', 'trading-journal'] as const

function allowedProjects(claims: Claims): string[] {
  return claims.app_metadata?.projects ?? []
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
