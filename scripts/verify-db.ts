/**
 * scripts/verify-db.ts
 *
 * Runs SELECT queries on all tables (profiles, vehicles, inspections, materials)
 * and logs RLS policy evaluation results to confirm no recursion or permission issues.
 *
 * Usage (requires ts-node or tsx):
 *   npx tsx scripts/verify-db.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (optional – used for admin/bypass checks)
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    '❌  Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
/** Anon client – subject to RLS policies */
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

/** Service-role client – bypasses RLS (used to verify raw table access) */
const adminClient = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type QueryResult = {
  table: string;
  client: 'anon' | 'service_role';
  rowCount: number | null;
  error: string | null;
  durationMs: number;
};

async function selectFromTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: ReturnType<typeof createClient<any, any, any>>,
  table: string,
  clientLabel: 'anon' | 'service_role'
): Promise<QueryResult> {
  const start = Date.now();
  const { data, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: false })
    .limit(5);

  const durationMs = Date.now() - start;

  return {
    table,
    client: clientLabel,
    rowCount: error ? null : (data?.length ?? 0),
    error: error ? `[${error.code}] ${error.message}` : null,
    durationMs,
  };
}

function printResult(result: QueryResult): void {
  const status = result.error ? '❌ FAIL' : '✅ OK  ';
  const rows = result.error ? 'n/a' : `${result.rowCount} row(s) returned`;
  const timing = `${result.durationMs}ms`;

  console.log(
    `  ${status}  table=${result.table.padEnd(14)}  client=${result.client.padEnd(12)}  ${rows.padEnd(22)}  (${timing})`
  );

  if (result.error) {
    console.log(`         └─ error: ${result.error}`);

    // Detect common RLS recursion / permission patterns
    if (result.error.includes('infinite recursion')) {
      console.warn(
        '         ⚠️  INFINITE RECURSION detected in RLS policy for table: ' + result.table
      );
    }
    if (result.error.includes('permission denied')) {
      console.warn(
        '         ⚠️  PERMISSION DENIED – check RLS SELECT policy for table: ' + result.table
      );
    }
    if (result.error.includes('42501')) {
      console.warn(
        '         ⚠️  PostgreSQL error 42501 (insufficient_privilege) on table: ' + result.table
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const TABLES = ['profiles', 'vehicles', 'inspections', 'materials'] as const;

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Supabase DB Verification – RLS Policy & Permission Check');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  URL : ${SUPABASE_URL}`);
  console.log(`  Anon key present       : ${ANON_KEY ? 'yes' : 'NO'}`);
  console.log(`  Service-role key present: ${SERVICE_ROLE_KEY ? 'yes' : 'NO (admin checks skipped)'}`);
  console.log('');

  const results: QueryResult[] = [];

  // ── Anon client (RLS enforced) ──────────────────────────────────────────
  console.log('── Anon client (RLS enforced) ─────────────────────────────────');
  for (const table of TABLES) {
    const result = await selectFromTable(anonClient, table, 'anon');
    results.push(result);
    printResult(result);
  }

  // ── Service-role client (RLS bypassed) ─────────────────────────────────
  if (adminClient) {
    console.log('');
    console.log('── Service-role client (RLS bypassed) ─────────────────────────');
    for (const table of TABLES) {
      const result = await selectFromTable(adminClient, table, 'service_role');
      results.push(result);
      printResult(result);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('── Summary ─────────────────────────────────────────────────────');

  const failures = results.filter((r) => r.error !== null);
  const passes = results.filter((r) => r.error === null);

  console.log(`  ✅ Passed : ${passes.length}`);
  console.log(`  ❌ Failed : ${failures.length}`);

  if (failures.length === 0) {
    console.log('');
    console.log('  🎉  All queries succeeded. No RLS recursion or permission issues detected.');
  } else {
    console.log('');
    console.log('  Issues found:');
    failures.forEach((f) => {
      console.log(`    • ${f.table} (${f.client}): ${f.error}`);
    });
    console.log('');
    console.log('  Suggested fixes:');
    console.log('  1. If "infinite recursion" → ensure RLS policies on profiles do NOT call');
    console.log('     is_admin() or any function that re-queries the same table.');
    console.log('  2. If "permission denied" on anon → add a permissive SELECT policy or');
    console.log('     ensure the user is authenticated before querying.');
    console.log('  3. Run the latest migration (20260610001800_fix_profiles_rls_recursion.sql)');
    console.log('     to apply the recursion fix already prepared for this project.');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
