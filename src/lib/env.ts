// ─── Environment Variable Validation ──────────────────────────────────────────
// Validates required env vars with clear error messages
// instead of failing silently at runtime with undefined values

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `[env] Variable de entorno requerida no encontrada: ${name}. ` +
      `Asegúrate de que esté definida en tu archivo .env o en las variables de entorno del servidor.`
    );
  }
  return val;
}

// Public variables (safe to expose to browser)
export function getPublicEnv() {
  return {
    supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4028',
  };
}

// Server-only variables (never expose to browser)
export function getServerEnv() {
  return {
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
