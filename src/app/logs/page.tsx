'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import LogsView from './components/LogsView';

export default function LogsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router?.replace('/vehicle-inspection');
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <AppLayout title="Logs">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <AppLayout title="Logs del Sistema">
      <LogsView />
    </AppLayout>
  );
}
