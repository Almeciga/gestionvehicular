'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { type InspectionView } from '@/lib/inspectionView';

export default function AdminDashboard({ inspections, onClose }: { inspections: InspectionView[]; onClose: () => void }) {
  const pending = inspections.filter((i) => i.status === 'pendiente_revision');
  const rejected = inspections.filter((i) => i.status === 'rechazado');
  const failed = inspections.filter((i) => i.syncStatus === 'failed');

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Icon name="ChartBarIcon" size={18} className="text-[#1B4F72]" />
            Panel de Administración
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <Icon name="XMarkIcon" size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
              <p className="text-2xl font-bold text-orange-600">{pending.length}</p>
              <p className="text-xs text-orange-700 font-semibold mt-0.5">En Revisión</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
              <p className="text-2xl font-bold text-red-600">{rejected.length}</p>
              <p className="text-xs text-red-700 font-semibold mt-0.5">Rechazadas</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-100">
              <p className="text-2xl font-bold text-yellow-600">{failed.length}</p>
              <p className="text-xs text-yellow-700 font-semibold mt-0.5">Sync Fallido</p>
            </div>
          </div>

          {/* Pending Review */}
          {pending.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Icon name="ClockIcon" size={14} className="text-orange-500" />
                Pendientes de Revisión
              </h4>
              <div className="space-y-2">
                {pending.map((insp) => (
                  <div key={insp.id} className="flex items-center justify-between bg-orange-50 rounded-xl p-3 border border-orange-100">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{insp.enterpriseId || insp.placa}</p>
                      <p className="text-xs text-gray-500">{insp.propietario} — {insp.inspectorName}</p>
                    </div>
                    <StatusBadge status={insp.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected */}
          {rejected.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Icon name="XCircleIcon" size={14} className="text-red-500" />
                Rechazadas
              </h4>
              <div className="space-y-2">
                {rejected.map((insp) => (
                  <div key={insp.id} className="bg-red-50 rounded-xl p-3 border border-red-100">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800">{insp.enterpriseId || insp.placa}</p>
                      <StatusBadge status={insp.status} />
                    </div>
                    {insp.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">Razón: {insp.rejectionReason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync Failures */}
          {failed.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Icon name="ExclamationTriangleIcon" size={14} className="text-yellow-500" />
                Fallos de Sincronización
              </h4>
              <div className="space-y-2">
                {failed.map((insp) => (
                  <div key={insp.id} className="bg-yellow-50 rounded-xl p-3 border border-yellow-100">
                    <p className="text-sm font-bold text-gray-800">{insp.enterpriseId || insp.placa}</p>
                    <p className="text-xs text-gray-500">{insp.propietario}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && rejected.length === 0 && failed.length === 0 && (
            <div className="text-center py-8">
              <Icon name="CheckCircleIcon" size={40} className="text-green-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-500">Todo en orden</p>
              <p className="text-xs text-gray-400">No hay elementos que requieran atención</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
