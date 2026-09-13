'use client';
import React, { useState, useEffect } from 'react';
import BottomNav from './BottomNav';
import TopBar from './TopBar';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import GlobalErrorCapture from './GlobalErrorCapture';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  backHref?: string;
}

export default function AppLayout({ children, title, showBack, backHref }: AppLayoutProps) {
  const { isOnline, pendingCount, isSyncing } = useNetworkSync();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showBanner = mounted && (!isOnline || pendingCount > 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <GlobalErrorCapture />
      <TopBar title={title} showBack={showBack} backHref={backHref} />

      {/* Offline / sync status banner — only rendered after client mount to avoid hydration mismatch */}
      {showBanner && (
        <div
          className={`fixed top-14 left-0 right-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${
            !isOnline
              ? 'bg-amber-500 text-white'
              : isSyncing
              ? 'bg-blue-600 text-white' :'bg-green-600 text-white'
          }`}
        >
          {!isOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Sin conexión — {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} por sincronizar
            </>
          ) : isSyncing ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              Sincronizando {pendingCount} registro{pendingCount !== 1 ? 's' : ''}…
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-white" />
              {pendingCount} registro{pendingCount !== 1 ? 's' : ''} en cola
            </>
          )}
        </div>
      )}

      <main className="flex-1 pb-24 pt-16">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}