import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/reset-password'];

// Admin-only routes (inspectors are redirected away)
const ADMIN_ROUTES = ['/users-management', '/materials-management', '/vehicle-production'];

export async function middleware(request: NextRequest) {
  try {
    // PREVIEW ONLY: bypass all auth checks when PREVIEW_SKIP_AUTH is enabled
    // This bypass is intentionally disabled in production for security
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
      console.error('[middleware] Missing Supabase environment variables — failing open');
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
            // Create a new response to carry updated cookies forward
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

    // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser()
    // Wrapped in try/catch so a Supabase network error doesn't crash the serverless function
    let user: { id: string; user_metadata?: Record<string, unknown> } | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    } catch (authErr) {
      console.error('[middleware] supabase.auth.getUser() threw — failing open:', authErr);
      return NextResponse.next();
    }

    const pathname = request.nextUrl.pathname;
    // Use exact match or segment-based matching to avoid false positives (e.g. /login-extra)
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

    // If authenticated and trying to access login, redirect to app
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/vehicle-inspection';
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

    // For authenticated users on protected routes: read role/is_active from JWT user_metadata
    // This avoids a DB round-trip to the profiles table on every request.
    if (user && !isPublicRoute) {
      const meta = (user.user_metadata as Record<string, unknown>) ?? {};

      // user_metadata is populated by create-user route and kept in sync via profile triggers.
      // Fall back to 'inspector' / true so existing users without metadata still work.
      const role: string = (meta.role as string) || 'inspector';
      const isActive: boolean = meta.is_active !== undefined ? Boolean(meta.is_active) : true;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[middleware] User ID:', user.id, '| role:', role, '| is_active:', isActive);
      }

      if (!isActive) {
        console.warn('[middleware] User is inactive — signing out:', user.id);
        // Wrap signOut in a race against a timeout so a slow/unreachable Supabase
        // doesn't cause the serverless function to exceed Netlify's timeout → 502.
        try {
          await Promise.race([
            supabase.auth.signOut(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('signOut timeout')), 3000)
            ),
          ]);
        } catch {
          // Proceed to redirect even if signOut fails — the cookie will expire naturally
        }

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

      // Protect admin-only routes using the JWT role
      if (ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
        if (role !== 'admin') {
          const url = request.nextUrl.clone();
          url.pathname = '/vehicle-inspection';
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
      }
    }

    return supabaseResponse;
  } catch (unexpectedErr) {
    // Top-level safety net: if anything above throws unexpectedly,
    // fail open so the serverless function returns a valid response
    // instead of crashing with a 502 Bad Gateway.
    console.error('[middleware] Unexpected error — failing open:', unexpectedErr);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};