import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TABLES = ['profiles', 'vehicles', 'inspections', 'materials'] as const;

type TableName = (typeof TABLES)[number];

interface CheckResult {
  table: TableName;
  client: 'anon' | 'service_role';
  rowCount: number | null;
  error: string | null;
  errorCode: string | null;
  durationMs: number;
  flags: string[];
}

interface DiagnosticsReport {
  timestamp: string;
  env: {
    urlLoaded: boolean;
    anonKeyLoaded: boolean;
    serviceRoleKeyLoaded: boolean;
    supabaseUrl: string;
  };
  checks: CheckResult[];
  summary: {
    passed: number;
    failed: number;
    allPassed: boolean;
  };
  suggestions: string[];
}

async function queryTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: ReturnType<typeof createClient<any, any, any>>,
  table: TableName,
  clientLabel: 'anon' | 'service_role'
): Promise<CheckResult> {
  const start = Date.now();
  const { data, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: false })
    .limit(5);

  const durationMs = Date.now() - start;
  const flags: string[] = [];

  if (error) {
    if (error.message?.includes('infinite recursion')) flags.push('INFINITE_RECURSION');
    if (error.message?.includes('permission denied') || error.code === '42501') flags.push('PERMISSION_DENIED');
    if (error.code === '42501') flags.push('PG_42501');
    if (error.code === 'PGRST301' || error.message?.includes('JWT')) flags.push('JWT_INVALID');
    if (error.code === '401' || error.message?.includes('401')) flags.push('UNAUTHORIZED');
  }

  return {
    table,
    client: clientLabel,
    rowCount: error ? null : (data?.length ?? 0),
    error: error ? error.message : null,
    errorCode: error ? (error.code ?? null) : null,
    durationMs,
    flags,
  };
}

export async function GET(): Promise<NextResponse> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const report: DiagnosticsReport = {
    timestamp: new Date().toISOString(),
    env: {
      urlLoaded: !!SUPABASE_URL,
      anonKeyLoaded: !!ANON_KEY,
      serviceRoleKeyLoaded: !!SERVICE_ROLE_KEY,
      supabaseUrl: SUPABASE_URL
        ? SUPABASE_URL.replace(/^(https?:\/\/[^.]{4})[^.]+/, '$1***')
        : '(not set)',
    },
    checks: [],
    summary: { passed: 0, failed: 0, allPassed: false },
    suggestions: [],
  };

  // Env check — fail fast
  if (!SUPABASE_URL || !ANON_KEY) {
    report.suggestions.push(
      'NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Set them in .env and restart.'
    );
    report.summary = { passed: 0, failed: 1, allPassed: false };
    return NextResponse.json(report, { status: 500 });
  }

  // Build clients
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const adminClient = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  // ── Anon checks (RLS enforced) ──────────────────────────────────────────
  for (const table of TABLES) {
    const result = await queryTable(anonClient, table, 'anon');
    report.checks.push(result);
  }

  // ── Service-role checks (RLS bypassed) ─────────────────────────────────
  if (adminClient) {
    for (const table of TABLES) {
      const result = await queryTable(adminClient, table, 'service_role');
      report.checks.push(result);
    }
  } else {
    report.suggestions.push(
      'SUPABASE_SERVICE_ROLE_KEY is missing — service-role checks were skipped. ' + 'Add it to .env to enable admin/bypass verification.'
    );
  }

  // ── Build summary ───────────────────────────────────────────────────────
  const failures = report.checks.filter((c) => c.error !== null);
  const passes = report.checks.filter((c) => c.error === null);

  report.summary = {
    passed: passes.length,
    failed: failures.length,
    allPassed: failures.length === 0,
  };

  // ── Suggestions based on failures ──────────────────────────────────────
  const hasRecursion = failures.some((f) => f.flags.includes('INFINITE_RECURSION'));
  const hasPermissionDenied = failures.some((f) => f.flags.includes('PERMISSION_DENIED'));
  const hasUnauthorized = failures.some((f) => f.flags.includes('UNAUTHORIZED'));
  const hasJwtInvalid = failures.some((f) => f.flags.includes('JWT_INVALID'));

  if (hasRecursion) {
    report.suggestions.push(
      'INFINITE RECURSION detected. Apply migration 20260610001800_fix_profiles_rls_recursion.sql ' + 'or 20260610010000_fix_permission_denied_profiles.sql via the Supabase dashboard SQL editor.'
    );
  }
  if (hasPermissionDenied) {
    report.suggestions.push(
      'PERMISSION DENIED (42501) detected. The is_admin() or is_active_user() functions likely ' +
        'still query the profiles table. Apply migration 20260610010000_fix_permission_denied_profiles.sql.'
    );
  }
  if (hasUnauthorized) {
    report.suggestions.push(
      'UNAUTHORIZED (401) on anon client is expected when no session is active — ' +
        'this is normal for RLS-protected tables. Verify with an authenticated user session.'
    );
  }
  if (hasJwtInvalid) {
    report.suggestions.push(
      'JWT invalid error detected. Verify NEXT_PUBLIC_SUPABASE_ANON_KEY matches your Supabase project.'
    );
  }

  // Check if service_role passes but anon fails (expected for RLS-protected tables)
  const anonFails = failures.filter((f) => f.client === 'anon');
  const serviceRoleFails = failures.filter((f) => f.client === 'service_role');

  if (anonFails.length > 0 && serviceRoleFails.length === 0 && adminClient) {
    report.suggestions.push(
      'Anon client failures with service_role success is EXPECTED — ' + 'RLS policies are working correctly. Anon queries require an authenticated session.'
    );
  }

  if (serviceRoleFails.length > 0) {
    report.suggestions.push(
      'Service-role client failures indicate a deeper issue: wrong service role key, ' + 'network connectivity problem, or table does not exist. Check Supabase project settings.'
    );
  }

  const status = report.summary.allPassed ? 200 : 207;
  return NextResponse.json(report, { status });
}
