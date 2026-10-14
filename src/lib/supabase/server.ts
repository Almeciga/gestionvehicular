import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Log a clear error but do NOT throw — throwing here crashes the serverless
    // function with a 502 when env vars are not yet injected into the runtime.
    console.error(
      '[supabase/server] Missing required environment variables: ' +
      'NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY. '+ 'Returning a no-op client to prevent serverless function crash.'
    );
    // Return a minimal stub so callers can handle the null/error gracefully
    return null as unknown as ReturnType<typeof createServerClient>;
  }

  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() throws outside of a request context (e.g. during static generation).
    // Proceed with a null cookieStore — the cookie handlers below guard against it.
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore?.getAll() ?? [];
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet?.forEach(({ name, value, options }) =>
              cookieStore?.set(name, value, {
                ...options,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            );
          } catch {
            // Server Component read-only context — expected
          }
        },
      },
    }
  );
}