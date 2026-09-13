'use client';

import { createBrowserClient } from '@supabase/ssr';

const PFX = 'sb_';

const setCookie = (name: string, value: string, options?: any) => {
  if (typeof document === 'undefined') return;
  let s = `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}; SameSite=Lax`;
  if (options?.maxAge) s += `; Max-Age=${options.maxAge}`;
  else s += `; Max-Age=31536000`; // 1 year default
  if (options?.domain) s += `; Domain=${options.domain}`;
  if (options?.expires) s += `; Expires=${new Date(options.expires).toUTCString()}`;
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    s += `; Secure`;
  }
  document.cookie = s;
};

const deleteCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  }
};

const fromCookies = () => {
  if (typeof document === 'undefined') return [];
  return document.cookie
    .split(';')
    .filter(Boolean)
    .map((c) => {
      const eqIndex = c.trim().indexOf('=');
      const name = eqIndex !== -1 ? c.trim().slice(0, eqIndex) : c.trim();
      const value = eqIndex !== -1 ? decodeURIComponent(c.trim().slice(eqIndex + 1)) : '';
      return { name: name.trim(), value };
    })
    .filter((c) => c.name);
};

const fromStorage = () => {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PFX))
      .map((k) => ({ name: k.slice(PFX.length), value: localStorage.getItem(k) || '' }));
  } catch {
    return [];
  }
};

// Singleton instance — created once, reused on every call
let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (clientInstance) return clientInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Log clearly so the error appears in Netlify function logs.
    // Do NOT throw here — a throw at module level during SSR/cold-start
    // causes an unhandled exception → Netlify 502 "function crashed".
    console.error(
      '[supabase/client] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined. ' +
      'Set these environment variables in your Netlify site settings → Environment variables.'
    );
    // Return a minimal stub so the import chain doesn't crash the function.
    // The UI will show "BD Sin conexión" and login attempts will fail gracefully.
    return createBrowserClient('https://placeholder.supabase.co', 'placeholder') as ReturnType<typeof createBrowserClient>;
  }

  clientInstance = createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll: () => {
          const cookieItems = fromCookies();
          if (cookieItems.length > 0) return cookieItems;
          // Fallback to localStorage if cookies are empty
          return fromStorage();
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return;
          cookiesToSet.forEach(({ name, value, options }) => {
            if (value) {
              setCookie(name, value, options);
              // Also mirror to localStorage as backup
              try {
                localStorage.setItem(`${PFX}${name}`, value);
              } catch {}
            } else {
              deleteCookie(name);
              try {
                localStorage.removeItem(`${PFX}${name}`);
              } catch {}
            }
          });
        },
      },
    }
  );

  return clientInstance;
}
