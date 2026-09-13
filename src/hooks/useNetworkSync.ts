'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { processSyncQueue, getPendingQueueCount, incrementalSync } from '@/lib/syncService';
import {
  processSyncQueue as processLegacyInspectionQueue,
  getPendingCount as getLegacyInspectionPendingCount,
} from '@/lib/syncQueue';
import { processMediaQueue } from '@/lib/mediaUploadQueue';
import { getPendingMediaCount } from '@/lib/offlineDB';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { SyncStatus } from '@/components/ui/SyncStatusBadge';

interface NetworkSyncState {
  isOnline: boolean;
  pendingCount: number;
  pendingMediaCount: number;
  isSyncing: boolean;
  isUploadingMedia: boolean;
  lastSyncedAt: number | null;
  syncStatus: SyncStatus;
}

/**
 * useNetworkSync — monitors online/offline status and automatically
 * processes the sync queue and media upload queue when network is available.
 * Uses IndexedDB-based sync queue (not localStorage).
 */
export function useNetworkSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<NetworkSyncState>({
    isOnline: true, // Always start as true for SSR — corrected in useEffect
    pendingCount: 0,
    pendingMediaCount: 0,
    isSyncing: false,
    isUploadingMedia: false,
    lastSyncedAt: null,
    syncStatus: 'synced',
  });

  const syncingRef = useRef(false);
  const mediaUploadRef = useRef(false);
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCounts = useCallback(async () => {
    const [dexieDataCount, legacyInspectionCount, mediaCount] = await Promise.all([
      getPendingQueueCount(),
      Promise.resolve(getLegacyInspectionPendingCount()),
      getPendingMediaCount(),
    ]);
    const dataCount = dexieDataCount + legacyInspectionCount;
    setState((prev) => ({
      ...prev,
      pendingCount: dataCount,
      pendingMediaCount: mediaCount,
      syncStatus: !prev.isOnline
        ? 'offline'
        : prev.isSyncing || prev.isUploadingMedia
        ? 'uploading'
        : dataCount > 0 || mediaCount > 0
        ? 'pending' :'synced',
    }));
  }, []);

  const runMediaUpload = useCallback(async () => {
    if (mediaUploadRef.current) return;
    if (!navigator.onLine) return;

    const mediaCount = await getPendingMediaCount();
    if (mediaCount === 0) return;

    mediaUploadRef.current = true;
    setState((prev) => ({ ...prev, isUploadingMedia: true, syncStatus: 'uploading' }));

    try {
      const { uploaded, failed } = await processMediaQueue();
      if (uploaded > 0) {
        toast.success(`${uploaded} archivo${uploaded > 1 ? 's' : ''} subido${uploaded > 1 ? 's' : ''} correctamente`);
      }
      if (failed > 0) {
        toast.error(`${failed} archivo${failed > 1 ? 's' : ''} no pudieron subirse — se reintentará`);
      }
    } catch {
      setState((prev) => ({ ...prev, syncStatus: 'failed' }));
    } finally {
      mediaUploadRef.current = false;
      setState((prev) => ({ ...prev, isUploadingMedia: false }));
      await refreshCounts();
    }
  }, [refreshCounts]);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (!navigator.onLine) return;

    const [dexieCount, legacyInspectionCount] = await Promise.all([
      getPendingQueueCount(),
      Promise.resolve(getLegacyInspectionPendingCount()),
    ]);
    const count = dexieCount + legacyInspectionCount;
    if (count === 0) {
      // No pending writes — do incremental read sync
      await incrementalSync();
      // Invalidate TanStack Query cache so components re-read from IndexedDB
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all });
      await runMediaUpload();
      return;
    }

    syncingRef.current = true;
    setState((prev) => ({ ...prev, isSyncing: true, syncStatus: 'uploading' }));

    try {
      const dexieResult = await processSyncQueue();
      // Inspections still persist in the legacy localStorage queue. Process it
      // here as a compatibility bridge so reconnect and periodic sync cannot
      // leave inspection changes stranded on the device.
      const legacyResult = await processLegacyInspectionQueue();
      const synced = dexieResult.synced + legacyResult.synced;
      const failed = dexieResult.failed + legacyResult.failed;

      if (synced > 0) {
        toast.success(`${synced} registro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} con éxito`);
        // Invalidate cache after successful sync
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all });
      }
      if (failed > 0) {
        toast.error(`${failed} registro${failed > 1 ? 's' : ''} no pudieron sincronizarse`);
        setState((prev) => ({ ...prev, syncStatus: 'failed' }));
      }

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      }));
    } catch {
      setState((prev) => ({ ...prev, isSyncing: false, syncStatus: 'failed' }));
    } finally {
      syncingRef.current = false;
      await refreshCounts();
      await runMediaUpload();
    }
  }, [runMediaUpload, refreshCounts, queryClient]);

  useEffect(() => {
    // Sync isOnline to real navigator.onLine after hydration
    setState((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
      syncStatus: !navigator.onLine ? 'offline' : prev.syncStatus,
    }));

    refreshCounts();

    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true, syncStatus: 'pending' }));
      toast.info('Conexión restaurada. Sincronizando datos...');
      runSync();
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false, syncStatus: 'offline' }));
      toast.warning('Sin conexión. Los datos se guardarán localmente.');
    };

    // Prevent accidental page refresh loss
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      const pending = await getPendingQueueCount();
      if (pending > 0) {
        e.preventDefault();
        e.returnValue = 'Hay datos sin sincronizar. ¿Desea salir?';
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Attempt sync on mount
    if (navigator.onLine) {
      runSync();
    }

    // Periodic sync every 60 seconds (reduced from 30s to save Supabase quota)
    periodicTimerRef.current = setInterval(() => {
      if (navigator.onLine) {
        runSync();
      }
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (periodicTimerRef.current) clearInterval(periodicTimerRef.current);
    };
  }, [runSync, refreshCounts]);

  return { ...state, runSync, runMediaUpload, refreshCounts };
}
