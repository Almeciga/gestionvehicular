import { QueryClient } from '@tanstack/react-query';

// Singleton QueryClient — created once, reused everywhere
let _queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (_queryClient) return _queryClient;

  _queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes — no refetch during this window
        staleTime: 5 * 60 * 1000,
        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Always read from cache first (offline-first)
        networkMode: 'offlineFirst',
        // Show cached data while revalidating
        placeholderData: (prev: unknown) => prev,
        // Retry failed requests up to 2 times with exponential backoff
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
        // Don't refetch on window focus — we use manual invalidation
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect — we handle this in SyncService
        refetchOnReconnect: false,
      },
      mutations: {
        // Offline-first mutations
        networkMode: 'offlineFirst',
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      },
    },
  });

  return _queryClient;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const queryKeys = {
  profiles: {
    all: ['profiles'] as const,
    list: () => [...queryKeys.profiles.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.profiles.all, 'detail', id] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: () => [...queryKeys.vehicles.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.vehicles.all, 'detail', id] as const,
    search: (q: string) => [...queryKeys.vehicles.all, 'search', q] as const,
  },
  materials: {
    all: ['materials'] as const,
    list: () => [...queryKeys.materials.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.materials.all, 'detail', id] as const,
    search: (q: string) => [...queryKeys.materials.all, 'search', q] as const,
  },
  inspections: {
    all: ['inspections'] as const,
    list: () => [...queryKeys.inspections.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.inspections.all, 'detail', id] as const,
    search: (q: string, status?: string) => [...queryKeys.inspections.all, 'search', q, status] as const,
    byInspector: (id: string) => [...queryKeys.inspections.all, 'inspector', id] as const,
  },
  sync: {
    queue: ['sync', 'queue'] as const,
    metrics: ['sync', 'metrics'] as const,
  },
} as const;
