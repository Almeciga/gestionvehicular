import React from 'react';
import type { InspectionStatus } from '@/lib/store';

type StatusType = 'bueno' | 'regular' | 'malo' | 'pendiente' | 'aprobado' | 'revision' | 'activo' | 'completado' | 'borrador' | 'finalizado' | 'archivado' | 'pendiente_revision' | 'rechazado';

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  bueno: { label: 'Bueno', className: 'bg-green-100 text-green-700 border border-green-200' },
  regular: { label: 'Regular', className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  malo: { label: 'Malo', className: 'bg-red-100 text-red-700 border border-red-200' },
  pendiente: { label: 'Pendiente', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  aprobado: { label: '✓ Aprobado', className: 'bg-green-100 text-green-700 border border-green-200' },
  revision: { label: 'Req. Revisión', className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  activo: { label: 'En Proceso', className: 'bg-blue-100 text-blue-700 border border-blue-200' },
  completado: { label: 'Completado', className: 'bg-green-100 text-green-700 border border-green-200' },
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  finalizado: { label: '🔒 Finalizado', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  archivado: { label: '📁 Archivado', className: 'bg-purple-100 text-purple-700 border border-purple-200' },
  pendiente_revision: { label: '⏳ En Revisión', className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  rechazado: { label: '✗ Rechazado', className: 'bg-red-100 text-red-700 border border-red-200' },
};

interface StatusBadgeProps {
  status: StatusType | InspectionStatus | string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status as StatusType] || statusConfig.pendiente;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${config.className}`}>
      {config.label}
    </span>
  );
}