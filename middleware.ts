import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/login', '/api/agent-proxy/health']

function isPublic(pathname: string): boolean {
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return true
  if (pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|gif|css|js|map|woff2?)$/)) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Env not set — don't block dev boot; warn and let app render.
    console.warn('[middleware] Supabase env not configured — skipping auth guard.')
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role ?? null
  if (!role || !['admin', 'autor'].includes(role)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
