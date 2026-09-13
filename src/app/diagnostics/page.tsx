'use client';

import { useState, useCallback } from 'react';

interface CheckResult {
  table: string;
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

function EnvRow({ label, loaded }: { label: string; loaded: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700 font-mono">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          loaded
            ? 'bg-green-100 text-green-700' :'bg-red-100 text-red-700'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${loaded ? 'bg-green-500' : 'bg-red-500'}`}
        />
        {loaded ? 'Loaded' : 'MISSING'}
      </span>
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const passed = check.error === null;
  return (
    <div
      className={`rounded-lg border p-3 ${
        passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{passed ? '✅' : '❌'}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-900">
                {check.table}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  check.client === 'service_role' ?'bg-purple-100 text-purple-700' :'bg-blue-100 text-blue-700'
                }`}
              >
                {check.client}
              </span>
              {check.flags.map((flag) => (
                <span
                  key={flag}
                  className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium"
                >
                  {flag}
                </span>
              ))}
            </div>
            {passed ? (
              <p className="text-xs text-green-700 mt-0.5">
                {check.rowCount} row(s) returned · {check.durationMs}ms
              </p>
            ) : (
              <p className="text-xs text-red-700 mt-0.5 font-mono break-all">
                [{check.errorCode ?? 'ERR'}] {check.error}
              </p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
          {check.durationMs}ms
        </span>
      </div>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setReport(null);
    setFetchError(null);
    setHttpStatus(null);

    try {
      const res = await fetch('/api/diagnostics');
      setHttpStatus(res.status);
      const json: DiagnosticsReport = await res.json();
      setReport(json);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  const anonChecks = report?.checks.filter((c) => c.client === 'anon') ?? [];
  const serviceChecks = report?.checks.filter((c) => c.client === 'service_role') ?? [];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Supabase Diagnostics
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Verifies connectivity, RLS policies, and service role key
                configuration.
              </p>
            </div>
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                loading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
              }`}
            >
              {loading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Run Diagnostics
                </>
              )}
            </button>
          </div>

          {/* Idle state */}
          {!report && !loading && !fetchError && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-dashed border-gray-300 p-6 text-center">
              <p className="text-sm text-gray-400">
                Click <strong>Run Diagnostics</strong> to start the check.
              </p>
            </div>
          )}

          {/* Fetch error */}
          {fetchError && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-semibold text-red-700">
                Failed to reach /api/diagnostics
              </p>
              <p className="text-xs text-red-600 font-mono mt-1">{fetchError}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {report && (
          <>
            {/* Overall status banner */}
            <div
              className={`rounded-2xl border p-5 ${
                report.summary.allPassed
                  ? 'bg-green-50 border-green-200' :'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">
                  {report.summary.allPassed ? '🎉' : '⚠️'}
                </span>
                <div>
                  <p
                    className={`font-bold text-lg ${
                      report.summary.allPassed ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {report.summary.allPassed
                      ? 'All checks passed — no RLS or permission issues detected.'
                      : `${report.summary.failed} check(s) failed — review details below.`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    HTTP {httpStatus} · {new Date(report.timestamp).toLocaleTimeString()} ·{' '}
                    {report.summary.passed} passed · {report.summary.failed} failed
                  </p>
                </div>
              </div>
            </div>

            {/* Environment */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                Environment Variables
              </h2>
              <EnvRow
                label="NEXT_PUBLIC_SUPABASE_URL"
                loaded={report.env.urlLoaded}
              />
              <EnvRow
                label="NEXT_PUBLIC_SUPABASE_ANON_KEY"
                loaded={report.env.anonKeyLoaded}
              />
              <EnvRow
                label="SUPABASE_SERVICE_ROLE_KEY"
                loaded={report.env.serviceRoleKeyLoaded}
              />
              <p className="text-xs text-gray-400 font-mono mt-3">
                URL: {report.env.supabaseUrl}
              </p>
            </div>

            {/* Anon checks */}
            {anonChecks.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                  Anon Client — RLS Enforced
                </h2>
                <div className="space-y-2">
                  {anonChecks.map((c, i) => (
                    <CheckRow key={i} check={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Service-role checks */}
            {serviceChecks.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                  Service-Role Client — RLS Bypassed
                </h2>
                <div className="space-y-2">
                  {serviceChecks.map((c, i) => (
                    <CheckRow key={i} check={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {report.suggestions.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                  Suggestions &amp; Next Steps
                </h2>
                <ul className="space-y-2">
                  {report.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Raw JSON toggle */}
            <details className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <summary className="text-sm font-bold text-gray-700 uppercase tracking-wide cursor-pointer select-none">
                Raw JSON Response
              </summary>
              <pre className="mt-3 text-xs font-mono bg-gray-50 rounded-lg p-4 overflow-x-auto text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(report, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
