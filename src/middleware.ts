import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/reset-password'];

// Per-route role map: key = route prefix, value = allowed roles
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/vehicle-inspection': ['admin', 'inspector'],
  '/vehicle-production': ['admin', 'comercial'],
  '/materials-management': ['admin'],
  '/users-management': ['admin'],
  '/logs': ['admin'],
  '/production-orders': ['admin', 'comercial', 'inspector'],
};

// Home page per role (used after login and for unauthorized redirects)
function getHomeForRole(role: string): string {
  if (role === 'comercial') return '/production-orders';
  return '/vehicle-inspection';
}

export async function middleware(request: NextRequest) {
  // PREVIEW ONLY: bypass all auth checks when PREVIEW_SKIP_AUTH is enabled
  if (
    process.env.PREVIEW_SKIP_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Missing Supabase environment variables');
    return NextResponse.next();
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...options,
              sameSite: 'lax',
              secure: true,
              path: '/',
            });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // If not authenticated and trying to access a protected route, redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, {
        sameSite: 'lax',
        secure: true,
        path: '/',
      });
    });
    return redirectResponse;
  }

  // If authenticated and trying to access login, redirect to role home
  if (user && pathname === '/login') {
    const meta = user.user_metadata ?? {};
    const role: string = (meta.role as string) || 'inspector';
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, {
        sameSite: 'lax',
        secure: true,
        path: '/',
      });
    });
    return redirectResponse;
  }

  // For authenticated users on protected routes: check role
  if (user && !isPublicRoute) {
    const meta = user.user_metadata ?? {};
    const role: string = (meta.role as string) || 'inspector';
    const isActive: boolean = meta.is_active !== undefined ? Boolean(meta.is_active) : true;

    console.log('[middleware] User ID:', user.id, '| role:', role, '| is_active:', isActive);

    if (!isActive) {
      console.warn('[middleware] User is inactive — signing out:', user.id);
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error('[middleware] signOut failed (continuing redirect):', signOutError);
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Check per-route role map
    for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
      if (pathname === routePrefix || pathname.startsWith(`${routePrefix}/`)) {
        if (!allowedRoles.includes(role)) {
          const url = request.nextUrl.clone();
          url.pathname = getHomeForRole(role);
          const redirectResponse = NextResponse.redirect(url);
          supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, {
              sameSite: 'lax',
              secure: true,
              path: '/',
            });
          });
          return redirectResponse;
        }
        break;
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
