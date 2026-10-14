# Ballistic Technology — GestionVehicular
## Comprehensive Technical Architecture, Functionality & Code Debt Report
**Generated:** 2026-09-14 | **Codebase:** Next.js 15 / TypeScript / Supabase / Dexie.js

---

## TABLE OF CONTENTS
1. [System Context & Functional Schema](#1-system-context--functional-schema)
2. [Inventory of Features & Core Functions](#2-inventory-of-features--core-functions)
3. [Runtime States & Lifecycle Matrix](#3-runtime-states--lifecycle-matrix)
4. [Historical Failure Analysis & Applied Safeguards](#4-historical-failure-analysis--applied-safeguards)
5. [Code Debt, Vulnerabilities & Systemic Flaws](#5-code-debt-vulnerabilities--systemic-flaws)
6. [Actionable Roadmap & Recommended Improvements](#6-actionable-roadmap--recommended-improvements)

---

## 1. SYSTEM CONTEXT & FUNCTIONAL SCHEMA

### 1.1 Core Domain & Business Objective

**GestionVehicular** is a vehicular inspection and legal evidence certification platform for Ballistic Technology. Its primary domain is:

- **Vehicular Inspection**: Multi-section checklists (accessories, documents, glass, bodywork, mechanics, components, fuel, signatures, scanner, observations) with photo capture and digital signatures.
- **Legal Evidence Certification**: Finalized inspections are locked, versioned, and PDF-exportable as legally admissible documents.
- **Offline-First Sync**: Field inspectors work without reliable connectivity. All writes go to IndexedDB first; a background sync engine reconciles with Supabase PostgreSQL when online.
- **Production Orders Module**: A secondary domain (`/vehicle-production`) for managing vehicle production orders with client/catalog management.
- **Materials Management**: Inventory tracking for workshop materials.
- **RBAC**: Two roles — `admin` (full access) and `inspector` (restricted to inspection workflow).

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                              │
│                                                                       │
│  Next.js App Router (React 19)                                       │
│  ├── /login, /reset-password          (public SSR pages)            │
│  ├── /vehicle-inspection              (CSR, AppLayout)               │
│  ├── /vehicle-production              (CSR, admin-only)              │
│  ├── /materials-management            (CSR, admin-only)              │
│  ├── /users-management                (CSR, admin-only)              │
│  └── /diagnostics                     (CSR, admin-only)              │
│                                                                       │
│  AuthContext (React Context)          ← Supabase Auth SSO            │
│  GVDatabase (Dexie.js / IndexedDB)    ← Local replica                │
│  syncService.ts                       ← Background sync engine       │
│  useNetworkSync (hook)                ← Online/offline orchestrator  │
│  TanStack Query                       ← Server-state cache           │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTPS / WebSocket
┌──────────────────────────────────▼──────────────────────────────────┐
│                     NETLIFY SERVERLESS FUNCTIONS                      │
│                                                                       │
│  Next.js Edge Middleware (src/middleware.ts)                         │
│  ├── Auth session validation via Supabase SSR                        │
│  └── RBAC route protection (admin vs inspector)                      │
│                                                                       │
│  API Routes (Node.js Lambda)                                         │
│  ├── GET  /api/health                 (healthcheck)                  │
│  ├── GET  /api/diagnostics            (RLS + env diagnostic)         │
│  ├── POST /api/admin/create-user      (admin user creation)          │
│  ├── POST /api/admin/seed-admin       (initial admin seed)           │
│  └── GET  /api/reports/[id]           (PDF generation via react-pdf) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ Supabase JS SDK
┌──────────────────────────────────▼──────────────────────────────────┐
│                         SUPABASE (Backend)                            │
│                                                                       │
│  Auth: JWT sessions, user_metadata (role, is_active, must_reset)    │
│  PostgreSQL Tables:                                                   │
│  ├── profiles (RBAC, user state)                                     │
│  ├── vehicles                                                         │
│  ├── inspections (versioned, state-machine, locked)                  │
│  ├── materials                                                        │
│  ├── sync_queue (legacy, partially superseded by Dexie queue)        │
│  ├── error_logs (client-side error telemetry)                        │
│  └── production_orders + related tables                              │
│                                                                       │
│  RLS Policies: Per-table, role-based                                 │
│  PostgreSQL Functions/Triggers:                                       │
│  ├── submit_for_review, approve_inspection, reject_inspection        │
│  ├── finalize_inspection, archive_inspection, admin_unlock_inspection│
│  └── version increment trigger on inspections UPDATE                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 End-to-End Data Flow

**Authentication Flow:**
```
User submits credentials (login/page.tsx)
  → signIn() via AuthContext → createClient() (browser Supabase client)
  → Supabase Auth returns JWT + session
  → onAuthStateChange fires → profileFromJWT() builds profile from JWT metadata (zero DB query)
  → triggerInitialSync() called → initialDataDownload() or incrementalSync()
  → All 4 tables bulk-written to IndexedDB (GVDatabase)
  → TanStack Query cache invalidated → UI re-renders from IndexedDB
```

**Offline Write Flow:**
```
Inspector edits inspection field
  → InspectionsRepo.update() → db.inspections.update() (IndexedDB, instant)
  → enqueueOperation('inspections', 'UPDATE', id, payload) → db.sync_queue.add()
  → UI shows "pending" sync badge
```

**Sync-on-Reconnect Flow:**
```
navigator.online event fires
  → useNetworkSync.runSync()
  → processSyncQueue() reads db.sync_queue WHERE status IN ('pending','failed') AND retry_count < 5
  → For each item: processSyncItem() → Supabase upsert/update/delete/rpc
  → On success: db.sync_queue.update(id, {status:'done'})
  → incrementalSync() pulls delta (updated_at > lastSync) for all tables
  → TanStack Query invalidated → UI refreshes
```

---

## 2. INVENTORY OF FEATURES & CORE FUNCTIONS

### 2.1 Authentication & Session

**File:** `src/contexts/AuthContext.tsx` (339 lines)

| Function | Description |
|----------|-------------|
| `profileFromJWT(user)` | Builds `UserProfile` from JWT `user_metadata` — zero DB query, instant |
| `resolveProfile(u)` | JWT profile first, then enriches from IndexedDB `profiles` table in background |
| `triggerInitialSync(u)` | Checks IndexedDB count; runs `initialDataDownload()` on first login or `incrementalSync()` on subsequent |
| `getSupabase()` | Lazy singleton getter — defers `createClient()` until browser mount to avoid SSR crash |
| `signIn()` | Delegates to Supabase `signInWithPassword`; returns user for metadata inspection |
| `signOut()` | Clears local state, resets `initialSyncDoneRef` |
| `onAuthStateChange` handler | Handles `SIGNED_IN`, `TOKEN_REFRESHED` (failure → force signout + redirect), `PASSWORD_RECOVERY` |

**Session Recovery:** Uses `getSession()` (not `getUser()`) on mount — avoids a network round-trip if session is already in cookies. Only calls `getUser()` if session exists.

**Cookie Strategy:** `src/lib/supabase/client.ts` implements a dual-storage strategy: cookies as primary, `localStorage` with `sb_` prefix as fallback. This handles environments where cookies are blocked (e.g., iframe preview contexts).

**Route Protection:** `src/middleware.ts` — Edge function validates session on every non-public request. Public routes: `/login`, `/auth/callback`, `/reset-password`. Admin-only routes: `/users-management`, `/materials-management`, `/vehicle-production`.

### 2.2 Data Storage & Offline Engine

**File:** `src/lib/db.ts` (348 lines)

**GVDatabase** (Dexie.js, IndexedDB) — schema at version 3:

| Table | Primary Key | Indexes | Purpose |
|-------|-------------|---------|---------|
| `profiles` | `id` | `email, role, is_active, updated_at` | User profiles replica |
| `vehicles` | `id` | `placa, marca, propietario, created_by, updated_at, _dirty` | Vehicle registry |
| `materials` | `id` | `nombre, categoria, updated_at, _dirty` | Materials inventory |
| `inspections` | `id` | `placa, inspector_id, status, updated_at, local_id, _dirty, sync_status` | Inspection records |
| `sync_queue` | `++id` (auto) | `table_name, operation, record_id, status, created_at` | Outbound write queue |
| `sync_meta` | `id` (table name) | — | Last-sync timestamps per table |
| `error_logs` | `id` | `level, created_at, context` | Client-side error telemetry |

**Key Design Decisions:**
- `_dirty: boolean` — marks records with unsynced local changes
- `_synced_at: number` — Unix timestamp of last successful sync
- `sync_status: 'pending' | 'synced' | 'failed' | 'conflict'` — per-record sync state
- `version: number` — optimistic concurrency counter (incremented by Postgres trigger on each UPDATE)
- `base_version: number` — last known remote version at sync time; used for conflict detection
- `_conflict: { remote, local, detected_at }` — stored when a real field clash is detected

**SSR Safety:** `getDB()` checks `typeof window === 'undefined'` and returns a full no-op stub for all 7 tables. The real `GVDatabase` class and `require('dexie')` are inside the browser-only branch.

**Schema Migration (v3 upgrade):** Adds `sync_status` index to `inspections` and runs an `.upgrade()` callback that sets `version = 1` and `base_version = version` on all existing records.

### 2.3 Synchronization Engine

**File:** `src/lib/syncService.ts` (680 lines)

#### `initialDataDownload()`
- Fetches all 4 tables in parallel (`Promise.all`)
- For `inspections`: skips records where `local._dirty === true` (preserves unsaved local edits)
- Writes via `bulkPut()` — upserts entire dataset
- Sets `lastSync` timestamps in `sync_meta`
- Dispatches `gv-sync-complete` window event

#### `incrementalSync(tables?)`
- Fetches only rows where `updated_at > lastSync` (delta sync)
- Same dirty-skip logic for inspections
- Updates `lastSync` per table

#### `processSyncQueue()`
- Reads `sync_queue` WHERE `status IN ('pending','failed') AND retry_count < 5`
- Processes each item via `processSyncItem()`
- Max 5 retries; conflict items are immediately marked `failed` (no infinite retry)
- Cleans up `done` items older than 24 hours

#### `processInspectionUpdate()` — Optimistic Concurrency
```
1. Fetch remote row: SELECT version, status, <changedKeys> WHERE id = recordId
2. Compare remoteVersion vs baseVersion
3. If mismatch: check if any changed field actually differs from _previous snapshot
   - Real clash → markInspectionConflict() → sync_status = 'conflict'
   - No real clash → proceed (concurrent edit on different fields)
4. Execute status transition RPC if status changed
5. UPDATE inspections SET ... WHERE id = recordId AND version = remoteVersion
   - If 0 rows updated → conflict (concurrent write won) → markInspectionConflict()
6. Update local record: version = newVersion, base_version = newVersion, sync_status = 'synced'
```

#### `enqueueOperation()` — UPDATE Coalescing
- For `UPDATE` operations: checks for existing `pending/failed` item for same `(table, record_id)`
- If found: **merges** new payload over existing (new fields win), preserves `_previous` and `_base_version` from original item, resets `retry_count` and `status` to `pending`
- This ensures a single PATCH per offline editing session, not N separate updates

#### `SyncMetrics`
- Tracks: `downloadedRows`, `uploadedRows`, `failedRows`, `pendingQueueSize`, `supabaseRequests`, `lastSyncDuration`
- Exported via `getMetrics()` — accessible to diagnostics UI

### 2.4 API & Serverless Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/health` | GET | None | Lightweight healthcheck — returns `{status:'ok'}` |
| `/api/diagnostics` | GET | None | Full RLS + env diagnostic report (anon + service_role checks) |
| `/api/admin/create-user` | POST | Admin JWT | Creates Supabase auth user + profiles row via service role key |
| `/api/admin/seed-admin` | POST | None (guarded by env) | Seeds initial admin user |
| `/api/reports/[id]` | GET | Admin JWT | Generates multi-page PDF via `@react-pdf/renderer` |
| `/auth/callback` | GET | None | Supabase OAuth callback handler |

**`/api/diagnostics`** is a particularly valuable operational tool: it tests all 4 tables with both anon and service_role clients, detects RLS infinite recursion, permission denied (42501), JWT invalidity, and provides actionable suggestions.

### 2.5 UI & Image Optimization

**`src/components/ui/AppImage.tsx`:** Wraps Next.js `<Image>`. Fixed aspect-ratio warning by always setting both `width: 'auto'` and `height: 'auto'` when either numeric dimension prop is provided.

**`src/components/AppLayout.tsx`:** Shell layout with `TopBar`, `BottomNav`, offline/sync status banner. Banner only renders after client mount (`mounted` state) to prevent hydration mismatch.

**`src/components/ui/SyncStatusBadge.tsx`:** Visual indicator with states: `synced`, `pending`, `uploading`, `failed`, `offline`.

**`src/lib/errorLogger.ts`:** Client-side error telemetry with 5-second debounce buffer. Batches multiple log entries into a single `supabase.from('error_logs').insert(rows)` call to prevent 429 rate-limiting.

---

## 3. RUNTIME STATES & LIFECYCLE MATRIX

### 3.1 Application States

| State | Trigger | Local DB | Supabase | UI |
|-------|---------|----------|----------|----|
| **Unauthenticated** | No session in cookies | Not initialized | Not queried | `/login` page |
| **Authenticating** | `signIn()` called | Not yet available | Auth request in flight | Loading spinner |
| **Authenticated / Syncing** | `SIGNED_IN` event | Downloading via `initialDataDownload()` | Bulk SELECT all tables | Sync progress indicator |
| **Online / Idle** | Sync complete, `navigator.onLine = true` | Current, `_dirty = false` | Periodic incremental sync (60s) | Normal UI |
| **Offline / Degraded** | `navigator.offline` event | Writes accepted, `_dirty = true` | No connection | Amber banner, pending count |
| **Conflict** | `processInspectionUpdate()` detects version clash | `sync_status = 'conflict'`, `_conflict` stored | Remote version preserved | Conflict indicator (no auto-resolution UI yet) |
| **Error State** | Unhandled exception, auth failure | Depends on error | Depends on error | `src/app/error.tsx` boundary |

### 3.2 SSR vs. CSR Boundary Analysis

| Module | Runtime | Reason |
|--------|---------|--------|
| `src/middleware.ts` | **Edge (Netlify)** | Runs before every request; uses `@supabase/ssr` server client |
| `src/app/login/page.tsx` | **CSR** (`'use client'`) | Uses `useSearchParams`, `useRouter`, `useAuth` |
| `src/app/layout.tsx` | **SSR** (Server Component) | Root layout; providers are `'use client'` children |
| `src/contexts/AuthContext.tsx` | **CSR** (`'use client'`) | Uses `useState`, `useEffect`, browser Supabase client |
| `src/lib/db.ts` → `getDB()` | **CSR only** | `typeof window === 'undefined'` guard; returns no-op stub on server |
| `src/lib/supabase/client.ts` | **CSR** (`'use client'`) | `createBrowserClient`, `document.cookie`, `localStorage` |
| `src/lib/supabase/server.ts` | **SSR / Edge** | `createServerClient`, `cookies()` from `next/headers` |
| `src/lib/syncService.ts` | **CSR only** | Imports `getDB()` and browser Supabase client; never called from server |
| `src/lib/errorLogger.ts` | **CSR** (`'use client'`) | `window` event listeners, `document` access |
| `src/app/api/*/route.ts` | **Node.js Lambda** | Server-only; uses `createClient` from `server.ts` |
| `src/app/api/reports/[id]/route.ts` | **Node.js Lambda** | `@react-pdf/renderer` runs server-side |
| `src/hooks/useNetworkSync.ts` | **CSR** (`'use client'`) | `navigator.onLine`, `window.addEventListener` |
| `src/components/AppLayout.tsx` | **CSR** (`'use client'`) | Uses `useNetworkSync`, `useState`, `useEffect` |

**Critical SSR Boundaries:**
- `src/app/login/page.tsx`: `LoginPageInner` (with `useSearchParams()`) is wrapped in `<Suspense>` — prevents SSR bailout on dynamic URLs like `/login?rk_owner=true`
- `src/app/layout.tsx`: `AuthProvider` is a `'use client'` component mounted as a child of the server layout — it never executes Supabase or IndexedDB code during SSR
- All `useEffect`-gated browser API access in `AppLayout`, `OfflineBanner`, `SyncStatusBadge` prevents hydration mismatches

---

## 4. HISTORICAL FAILURE ANALYSIS & APPLIED SAFEGUARDS

### 4.1 502 Bad Gateway — Lambda MODULE_NOT_FOUND (Dexie)

**Root Cause:**
```js
// next.config.mjs — REMOVED (was the primary crash cause)
serverExternalPackages: ['dexie']
```
`serverExternalPackages` instructs Next.js to NOT bundle Dexie but load it from `node_modules` at Lambda runtime. Netlify Lambda functions do not ship `node_modules` → `MODULE_NOT_FOUND: Cannot find module 'dexie'` → unhandled exception → HTTP 502.

**Fix Applied (`next.config.mjs`):**
```js
// NOTE: Do NOT add 'dexie' to serverExternalPackages.
// Dexie is excluded from server bundles via the webpack externals block below.
webpack(config, { isServer }) {
  if (isServer) {
    config.externals = [...config.externals, 'dexie'];
  }
  // ...
}
```
Webpack `externals` excludes Dexie from the server bundle entirely (it's never imported on the server path). `serverExternalPackages` was redundant and destructive.

**Fix Applied (`src/lib/db.ts`):**
```ts
export function getDB(): GVDatabaseType {
  if (typeof window === 'undefined') {
    // SSR / serverless: return a no-op stub
    return { profiles: noopTable, vehicles: noopTable, ... };
  }
  if (!_db) {
    const Dexie = require('dexie').default ?? require('dexie'); // dynamic require, browser-only
    class GVDatabase extends Dexie { ... }
    _db = new GVDatabase() as unknown as GVDatabaseType;
  }
  return _db;
}
```

### 4.2 502 Bad Gateway — Synchronous `throw` in `requireEnv()` / `createClient()`

**Root Cause:** Both `src/lib/env.ts` and `src/lib/supabase/server.ts` called `throw new Error(...)` when environment variables were absent. On Netlify, env vars are injected into the function runtime slightly after module load on cold start. A `throw` at module-evaluation time terminates the serverless process → 502.

**Fix Applied (`src/lib/env.ts`):**
```ts
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[env] Variable de entorno requerida no encontrada: ${name}.`);
    return ''; // ← was: throw new Error(...)
  }
  return val;
}
```

**Fix Applied (`src/lib/supabase/server.ts`):**
```ts
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase/server] Missing required environment variables...');
  return null as unknown as ReturnType<typeof createServerClient>; // ← was: throw
}
```

### 4.3 502 Bad Gateway — `createBrowserClient('', '')` Synchronous Throw

**Root Cause:** Previous fallback called `createBrowserClient('https://placeholder.supabase.co', 'placeholder')`. The Supabase library validates the URL format and throws synchronously during SSR module evaluation.

**Fix Applied (`src/lib/supabase/client.ts`):**
```ts
function createNullStub(): ReturnType<typeof createBrowserClient> {
  const noop = async () => ({ data: null, error: new Error('Supabase not configured') });
  const stub: any = { auth: { getSession: noop, ... }, from: () => ({...}), ... };
  return stub as ReturnType<typeof createBrowserClient>;
}

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || ...) {
    return createNullStub(); // ← never calls createBrowserClient with empty strings
  }
  // ...
}
```

### 4.4 502 Bad Gateway — Middleware Unhandled Exception

**Root Cause:** `supabase.auth.getUser()` could throw on network error, DNS resolution delay, or malformed cookie during cold start. No outer safety net existed.

**Fix Applied (`src/middleware.ts`):**
```ts
export async function middleware(request: NextRequest) {
  try {                                          // ← outer safety net
    // ...
    try {
      const { data } = await supabase.auth.getUser();  // ← inner guard
      user = data?.user ?? null;
    } catch (authErr) {
      console.error('[middleware] supabase.auth.getUser() threw — failing open:', authErr);
      return NextResponse.next();
    }
    // ...
  } catch (unexpectedErr) {
    console.error('[middleware] Unexpected error — failing open:', unexpectedErr);
    return NextResponse.next();
  }
}
```

### 4.5 502 Bad Gateway — SSR Bailout on `/login?rk_owner=true`

**Root Cause:** `useSearchParams()` consumed outside a `<Suspense>` boundary causes Next.js App Router to throw an unhandled SSR exception on dynamic URLs.

**Fix Applied (`src/app/login/page.tsx`):**
```tsx
function LoginPageInner() {
  const searchParams = useSearchParams(); // ← inside Suspense boundary
  const _params = searchParams?.toString();
  // ...
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
```

### 4.6 Telemetry Flooding — HTTP 429 on `/logs`

**Root Cause:** `syncService.ts` and `errorLogger.ts` were sending individual log entries to a `/logs` endpoint on every sync event. Netlify rate-limited the route (HTTP 429).

**Fix Applied (`src/lib/errorLogger.ts`):**
```ts
const _logBuffer: BufferedLog[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000; // flush at most once every 5 seconds

function scheduleFlush() {
  if (_flushTimer !== null) return; // already scheduled
  _flushTimer = setTimeout(async () => {
    const batch = _logBuffer.splice(0, _logBuffer.length);
    await flushBatch(batch); // single batch INSERT
  }, DEBOUNCE_MS);
}
```
Logs are now buffered for 5 seconds and flushed as a single `supabase.from('error_logs').insert(rows)` batch insert.

### 4.7 AppImage Aspect-Ratio Warning

**Root Cause:** `customStyle` set only `width: 'auto'` OR `height: 'auto'` depending on which prop was passed, not both. Next.js `<Image>` requires both dimensions to be consistent.

**Fix Applied (`src/components/ui/AppImage.tsx`):** Always set both `width: 'auto'` and `height: 'auto'` when either numeric dimension prop is provided.

### 4.8 Middleware Intercepting Public Routes

**Root Cause:** `config.matcher` did not explicitly exclude `/login` and `/api/health`.

**Fix Applied (`src/middleware.ts`):**
```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

---

## 5. CODE DEBT, VULNERABILITIES & SYSTEMIC FLAWS

### 5.1 Fail-Open Security Risk (CRITICAL)

**Location:** `src/middleware.ts` — both `catch` blocks

**Current Behavior:**
```ts
} catch (authErr) {
  console.error('[middleware] supabase.auth.getUser() threw — failing open:', authErr);
  return NextResponse.next(); // ← ALLOWS REQUEST THROUGH
}
// ...
} catch (unexpectedErr) {
  console.error('[middleware] Unexpected error — failing open:', unexpectedErr);
  return NextResponse.next(); // ← ALLOWS REQUEST THROUGH
}
```

**Risk:** If Supabase Auth is completely down (not just slow), ALL requests to protected routes (`/vehicle-inspection`, `/users-management`, etc.) will be served without authentication. An unauthenticated user who knows the URL can access protected pages during a Supabase outage.

**Severity:** Medium-High. The application data is still protected by Supabase RLS policies (a second layer), but the UI layer is fully exposed. Admin pages and inspection data would be visible.

**Recommended Fix:** Distinguish between "Supabase threw a transient error" (fail-open acceptable) and "Supabase is completely unreachable" (should redirect to login with error message). At minimum, fail-open should only apply to non-admin routes:
```ts
} catch (authErr) {
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = ADMIN_ROUTES.some(r => pathname.startsWith(r));
  if (isAdminRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next(); // fail-open only for non-admin routes
}
```

### 5.2 Observability Loss — Silent `console.error` in `requireEnv()`

**Location:** `src/lib/env.ts`

**Current Behavior:**
```ts
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[env] Variable de entorno requerida no encontrada: ${name}.`);
    return ''; // ← silent empty string
  }
  return val;
}
```

**Risk:** `getServerEnv().supabaseServiceRoleKey` returns `''` silently. Any code that calls `createAdminClient(url, '')` will get a Supabase client that accepts requests but has no elevated permissions — it will behave like an anon client. This is a silent privilege degradation, not a crash.

**Specific Impact:** `src/app/api/admin/create-user/route.ts` checks `if (!serviceRoleKey)` before using it, so it correctly returns a 500 error. But any future code that calls `getServerEnv()` without null-checking the result will silently use an empty key.

**Recommended Fix:** Use Zod schema validation at build time (see Section 6.1).

### 5.3 Observability Loss — Silenced Sync Logs

**Location:** `src/lib/syncService.ts`

**Current State:** Most `console.log` calls in `syncService.ts` were removed or replaced with `console.warn`/`console.error` only on failures. The `SyncMetrics` object tracks counts but is not surfaced to any persistent observability system.

**Risk:** In production, if `incrementalSync()` silently skips records (e.g., because `_dirty = true` on all local records), there is no log trail. The `getMetrics()` export is available but only consumed by the diagnostics page — not sent to any external monitoring.

**Missing:** No structured logging to an external sink (e.g., Sentry, Datadog). The `error_logs` Supabase table only captures client-side errors via `errorLogger.ts`, not sync engine events.

### 5.4 Type Safety Loopholes

**Location:** `src/lib/db.ts` — `GVDatabase` class definition

```ts
class GVDatabase extends Dexie {
  profiles!: any;      // ← explicit any
  vehicles!: any;      // ← explicit any
  materials!: any;     // ← explicit any
  inspections!: any;   // ← explicit any
  sync_queue!: any;    // ← explicit any
  sync_meta!: any;     // ← explicit any
  error_logs!: any;    // ← explicit any
}
```

The `GVDatabaseType` interface with `MinimalTable<T,K>` is defined and used as the return type of `getDB()`, but the actual Dexie class uses `any` for all table properties. This means TypeScript only enforces types at the `getDB()` call site, not inside the class constructor or `this.version().stores()` calls.

**Location:** `src/lib/syncService.ts` — `.and()` callbacks

```ts
.and((item: import('@/lib/db').DBSyncQueueItem) => item.retry_count < 5)
```
These inline type annotations were added as a workaround for TypeScript implicit-any errors from `MinimalTable`. They are verbose and indicate the `MinimalTable` interface's `where()` return type is not fully typed.

**Location:** `src/lib/db.ts` — `DBProductionOrder` / `DBProductionOrderItem`

```ts
function DBProductionOrder(...args: any[]): any {
  console.warn('Placeholder: DBProductionOrder is not implemented yet.', args);
  return null;
}
export { DBProductionOrder };
```
These are placeholder stubs exported from `db.ts` — a sign that the production orders module's local DB integration is incomplete. Any code importing these will get `null` at runtime.

**Location:** `src/app/api/reports/[id]/route.ts` — `any` casts throughout PDF generation

The PDF route uses extensive `as Record<string, unknown>` and `as ItemRow[]` casts without runtime validation. If the `data` JSONB column in Supabase has an unexpected shape, the PDF will silently render empty fields rather than returning an error.

### 5.5 Conflict Resolution Gaps

**Current Implementation:**
- Conflict detection: ✅ Implemented (version comparison + field-level diff against `_previous`)
- Conflict storage: ✅ `_conflict: { remote, local, detected_at }` stored in IndexedDB
- Conflict UI: ❌ **Not implemented** — no UI component exists to show the user a conflict and let them choose which version to keep
- Auto-merge: ❌ Not implemented for non-clashing fields (the code detects "no real clash" and proceeds, but does not merge the remote changes into the local record)
- Conflict resolution for RPC operations: ⚠️ Partial — RPC failures call `markInspectionConflict()` with `{ rpc_error: error.message }` as the "remote" data, which is not a real conflict snapshot

**Race Condition in `enqueueOperation()`:**
```ts
const existing = await db.sync_queue.where('status').anyOf(['pending','failed'])
  .and((item) => item.table_name === tableName && item.record_id === recordId && item.retry_count < 5)
  .first();
if (existing) {
  await db.sync_queue.update(existing.id!, { payload: mergedPayload, ... });
  return;
}
await db.sync_queue.add({ ... });
```
This read-then-write pattern is not atomic. If two concurrent calls to `enqueueOperation()` for the same record execute simultaneously (e.g., two rapid field saves), both could read `existing = undefined` and both call `db.sync_queue.add()`, resulting in two queue items for the same record. Dexie does not provide cross-table transactions for this pattern.

### 5.6 Schema Migration Risks

**Location:** `src/lib/db.ts` — `GVDatabase` constructor

The Dexie schema is at version 3. The v3 `.upgrade()` callback modifies all `inspections` records to add `version` and `base_version` fields. This runs once per client device.

**Risk:** If a user has a v1 or v2 database and the upgrade fails mid-way (e.g., browser tab closed), the database may be left in a partially upgraded state. Dexie handles this with transactions, but there is no error handling around the `.upgrade()` callback — a failure would leave the database at an inconsistent version.

**Risk:** The `sync_meta` table has no schema entry in v1 (it was added in v2 implicitly via the stores definition). If a user skips v1 entirely (fresh install), this is fine. But the migration path from v1 → v3 relies on Dexie's incremental upgrade chain being applied correctly.

### 5.7 Dual Sync Queue Architecture

**Location:** `src/hooks/useNetworkSync.ts` + `src/lib/syncQueue.ts`

```ts
const dexieResult = await processSyncQueue();           // Dexie-based queue (new)
const legacyResult = await processLegacyInspectionQueue(); // localStorage-based queue (old)
```

The application maintains **two separate sync queues**:
1. **Dexie queue** (`src/lib/syncService.ts`): IndexedDB-based, handles all tables
2. **Legacy queue** (`src/lib/syncQueue.ts`): localStorage-based, handles inspections only

Both are processed on every sync cycle. This is a transitional architecture debt — the legacy queue was not fully removed when the Dexie queue was introduced. The comment in `useNetworkSync.ts` acknowledges this: *"Inspections still persist in the legacy localStorage queue. Process it here as a compatibility bridge."*

**Risk:** A user could have inspection changes in either queue. If the legacy queue has a failed item that the Dexie queue also has (due to a migration), the same change could be applied twice.

### 5.8 `next.config.mjs` — ESLint Disabled During Builds

```js
eslint: {
  ignoreDuringBuilds: true,
},
```
This means lint errors (including `@typescript-eslint/no-explicit-any`, unused variables, etc.) do not fail the build. Combined with the extensive `any` usage in `db.ts` and `syncService.ts`, this creates a silent quality degradation path.

### 5.9 Missing Null Check on Server Client Return

**Location:** `src/app/api/admin/create-user/route.ts`

```ts
const supabase = await createClient(); // can return null if env vars missing
const { data: { user }, error: authError } = await supabase.auth.getUser();
```

`createClient()` from `server.ts` returns `null as unknown as ReturnType<typeof createServerClient>` when env vars are missing. The `null as unknown as` cast means TypeScript does not warn about the null dereference. If `supabase` is null, `supabase.auth.getUser()` will throw a runtime error. The route has a top-level `try/catch` that returns a 500, so it won't crash the Lambda, but the error message will be misleading.

---

## 6. ACTIONABLE ROADMAP & RECOMMENDED IMPROVEMENTS

### 6.1 Immediate Refactors (Priority: High)

#### 6.1.1 Replace `requireEnv()` with Build-Time Zod Validation

**File to create:** `src/lib/env.validated.ts`

```ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

// Throws at module load time during `next build` if any variable is missing
// This is safe because build-time validation runs in Node.js, not in Lambda
export const env = envSchema.parse(process.env);
```

Use `env.NEXT_PUBLIC_SUPABASE_URL` instead of `requireEnv('NEXT_PUBLIC_SUPABASE_URL')` throughout the codebase. Keep the fail-soft `requireEnv()` only for runtime Lambda paths.

#### 6.1.2 Fix Null-Unsafe Server Client Usage

**File:** `src/app/api/admin/create-user/route.ts` and all other API routes

```ts
const supabase = await createClient();
if (!supabase) {
  return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
}
```

#### 6.1.3 Type the Dexie Class Properties

**File:** `src/lib/db.ts`

```ts
import type Dexie from 'dexie';
import type { Table } from 'dexie';

class GVDatabase extends Dexie {
  profiles!: Table<DBProfile, string>;
  vehicles!: Table<DBVehicle, string>;
  materials!: Table<DBMaterial, string>;
  inspections!: Table<DBInspection, string>;
  sync_queue!: Table<DBSyncQueueItem, number>;
  sync_meta!: Table<DBSyncMeta, string>;
  error_logs!: Table<DBErrorLog, string>;
}
```

This eliminates the `MinimalTable` stub and the inline type annotations in `syncService.ts`.

#### 6.1.4 Remove Legacy Sync Queue

**Files:** `src/lib/syncQueue.ts`, `src/hooks/useNetworkSync.ts`

Migrate any remaining localStorage inspection queue items to the Dexie queue on app startup (one-time migration), then remove `syncQueue.ts` and the `processLegacyInspectionQueue` call from `useNetworkSync.ts`.

### 6.2 Security Hardening (Priority: High)

#### 6.2.1 Tiered Fail-Open Middleware

Replace the blanket fail-open with a tiered approach:

```ts
} catch (authErr) {
  const pathname = request.nextUrl.pathname;
  // Admin routes: always redirect to login on auth failure
  if (ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'auth_unavailable');
    return NextResponse.redirect(url);
  }
  // Non-admin protected routes: fail-open (RLS is second layer)
  return NextResponse.next();
}
```

#### 6.2.2 Rate-Limit the Diagnostics Endpoint

`/api/diagnostics` is currently unauthenticated and runs 8 Supabase queries per request. It should require an admin JWT or at minimum an API key:

```ts
// src/app/api/diagnostics/route.ts
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.DIAGNOSTICS_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

#### 6.2.3 Validate PDF Report Access

`/api/reports/[id]` checks for admin role but uses `user_metadata.role` from the JWT — which is set at user creation and not automatically updated if a user's role changes in the `profiles` table. Add a secondary check against the `profiles` table for sensitive operations.

### 6.3 Sync Engine Optimization (Priority: Medium)

#### 6.3.1 Exponential Backoff for Queue Processing

Current retry logic increments `retry_count` but does not implement backoff — failed items are retried on every sync cycle (every 60 seconds) until `retry_count >= 5`.

```ts
// In processSyncQueue(), before processing a failed item:
const backoffMs = Math.min(1000 * Math.pow(2, item.retry_count), 30000);
const nextRetryAt = item.created_at + backoffMs;
if (Date.now() < nextRetryAt) continue; // skip until backoff expires
```

Add `next_retry_at: number` field to `DBSyncQueueItem` and `sync_queue` Dexie schema (v4 migration).

#### 6.3.2 Circuit Breaker for Supabase Calls

If 3+ consecutive sync cycles fail with network errors, pause sync for 5 minutes:

```ts
let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

export async function processSyncQueue() {
  if (Date.now() < _circuitOpenUntil) {
    return { synced: 0, failed: 0 }; // circuit open
  }
  // ...
  if (networkError) {
    _consecutiveFailures++;
    if (_consecutiveFailures >= 3) {
      _circuitOpenUntil = Date.now() + 5 * 60 * 1000;
    }
  } else {
    _consecutiveFailures = 0;
  }
}
```

#### 6.3.3 Atomic Enqueue with Dexie Transaction

Fix the read-then-write race condition in `enqueueOperation()`:

```ts
export async function enqueueOperation(...) {
  const db = getDB();
  await db.transaction('rw', db.sync_queue, async () => {
    const existing = await db.sync_queue
      .where('[table_name+record_id]').equals([tableName, recordId])
      .and(item => item.status !== 'done' && item.retry_count < 5)
      .first();
    if (existing && operation === 'UPDATE') {
      await db.sync_queue.update(existing.id!, { payload: mergedPayload, ... });
    } else {
      await db.sync_queue.add({ ... });
    }
  });
}
```
Requires adding a compound index `[table_name+record_id]` to the `sync_queue` Dexie schema.

#### 6.3.4 Conflict Resolution UI

Implement a `ConflictResolutionModal` component that:
1. Reads `inspections` WHERE `sync_status = 'conflict'` from IndexedDB
2. Displays side-by-side diff of `_conflict.local` vs `_conflict.remote`
3. Allows user to choose "Keep mine" (re-enqueue with force flag) or "Accept server version" (overwrite local with remote)

### 6.4 Test Coverage Gaps (Priority: Medium)

| Test Type | Target | Priority |
|-----------|--------|----------|
| Unit | `enqueueOperation()` — UPDATE coalescing logic | High |
| Unit | `processInspectionUpdate()` — conflict detection paths | High |
| Unit | `requireEnv()` — empty string vs. missing var behavior | High |
| Unit | `createNullStub()` — all stub methods return expected shapes | Medium |
| Integration | `initialDataDownload()` → IndexedDB state after bulk write | High |
| Integration | `processSyncQueue()` → Supabase mock → local state update | High |
| Integration | Middleware — fail-open behavior when Supabase throws | High |
| E2E | `/login?rk_owner=true` — no 502, Suspense renders correctly | High |
| E2E | Offline edit → reconnect → sync → verify Supabase row updated | High |
| E2E | Admin creates user → inspector logs in → role-based route protection | Medium |

**Recommended Stack:** Vitest (unit/integration), Playwright (E2E), `@testing-library/react` for component tests, `fake-indexeddb` for Dexie unit tests.

### 6.5 Observability Improvements (Priority: Medium)

1. **Structured sync telemetry:** Export `SyncMetrics` to `error_logs` table after each sync cycle (level: `info`, context: `sync_cycle`). This creates a queryable audit trail without flooding the endpoint.

2. **Enable ESLint in builds:** Remove `ignoreDuringBuilds: true` from `next.config.mjs` and fix all existing lint errors. This prevents future `any` type regressions from silently entering the codebase.

3. **Sentry integration:** Add `@sentry/nextjs` for production error tracking. The existing `errorLogger.ts` + `error_logs` table is a good foundation but lacks alerting, grouping, and release tracking.

4. **Health check enhancement:** Extend `/api/health` to include a lightweight Supabase ping:
```ts
export async function GET() {
  const supabaseOk = await checkSupabaseHealth(); // HEAD request to /rest/v1/
  return NextResponse.json({
    status: supabaseOk ? 'ok' : 'degraded',
    supabase: supabaseOk,
    timestamp: new Date().toISOString(),
  }, { status: supabaseOk ? 200 : 503 });
}
```

---

## APPENDIX: FILE CHANGE HISTORY (Session Summary)

| File | Changes Made | Reason |
|------|-------------|--------|
| `src/middleware.ts` | Outer + inner try/catch; env var guard; matcher exclusions | 502 prevention, public route bypass |
| `src/lib/env.ts` | `requireEnv()` returns `''` instead of throwing | Cold-start crash prevention |
| `src/lib/supabase/server.ts` | Null return on missing env; `cookies()` try/catch | Cold-start crash prevention |
| `src/lib/supabase/client.ts` | `createNullStub()` replaces placeholder `createBrowserClient` call | SSR crash prevention |
| `src/app/login/page.tsx` | `LoginPageInner` + `<Suspense>` boundary | SSR bailout on dynamic URLs |
| `src/lib/db.ts` | Dynamic `require('dexie')` inside browser-only branch; no-op stub for SSR | MODULE_NOT_FOUND crash prevention |
| `next.config.mjs` | Removed `serverExternalPackages: ['dexie']` | Primary 502 root cause |
| `src/lib/syncService.ts` | Explicit type annotations on `.and()` callbacks | TypeScript implicit-any fix |
| `src/components/ui/AppImage.tsx` | Both dimensions set to `auto` when either is provided | Aspect-ratio warning fix |
| `src/app/api/health/route.ts` | Created — returns `{status:'ok'}` | Healthcheck endpoint |
| `src/lib/errorLogger.ts` | 5-second debounce buffer + batch insert | 429 rate-limit prevention |

---

*Report generated by automated codebase analysis — Ballistic Technology GestionVehicular — 2026-09-14*
