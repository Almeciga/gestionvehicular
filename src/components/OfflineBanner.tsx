'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted || isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
      <Icon name="SignalSlashIcon" size={16} className="text-white opacity-80" />
      <span className="text-sm font-semibold">
        Sin conexión — Los datos se guardan localmente y se sincronizarán al reconectarse
      </span>
    </div>
  );
}
