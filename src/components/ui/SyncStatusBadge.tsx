'use client';
import React from 'react';

export type SyncStatus = 'synced' | 'uploading' | 'pending' | 'failed' | 'retrying' | 'offline';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  pendingCount?: number;
  className?: string;
  compact?: boolean;
}

const config: Record<SyncStatus, { label: string; icon: string; className: string; pulse?: boolean }> = {
  synced: {
    label: 'Sincronizado',
    icon: '✓',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  uploading: {
    label: 'Subiendo',
    icon: '↑',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
    pulse: true,
  },
  pending: {
    label: 'Pendiente',
    icon: '⏳',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  failed: {
    label: 'Error',
    icon: '✗',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  retrying: {
    label: 'Reintentando',
    icon: '↻',
    className: 'bg-orange-100 text-orange-700 border border-orange-200',
    pulse: true,
  },
  offline: {
    label: 'Sin conexión',
    icon: '⊘',
    className: 'bg-gray-100 text-gray-600 border border-gray-200',
  },
};

export default function SyncStatusBadge({ status, pendingCount, className = '', compact = false }: SyncStatusBadgeProps) {
  const cfg = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'} ${cfg.className} ${cfg.pulse ? 'animate-pulse' : ''} ${className}`}
    >
      <span className={cfg.pulse ? 'animate-spin inline-block' : ''}>{cfg.icon}</span>
      {!compact && cfg.label}
      {pendingCount !== undefined && pendingCount > 0 && (
        <span className="ml-0.5 font-bold">({pendingCount})</span>
      )}
    </span>
  );
}
