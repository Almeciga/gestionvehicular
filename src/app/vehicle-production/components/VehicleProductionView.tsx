'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import VehicleProductionForm from './VehicleProductionForm';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { VehiclesRepo } from '@/lib/repositories';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

export default function VehicleProductionView() {
  const { isAdmin, isComercial, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canEdit = isAdmin; // comercial = read-only

  useEffect(() => {
    if (!authLoading && !isAdmin && !isComercial) {
      router.replace('/production-orders');
    }
  }, [authLoading, isAdmin, isComercial, router]);

  // Read from IndexedDB via TanStack Query
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: queryKeys.vehicles.list(),
    queryFn: () => VehiclesRepo.getAll(),
    enabled: !authLoading && (isAdmin || isComercial),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => VehiclesRepo.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Vehículo eliminado');
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Error al eliminar vehículo');
    },
  });

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
  };

  const filtered = vehicles.filter(
    (v) =>
      v.placa?.toLowerCase().includes(search.toLowerCase()) ||
      v.marca?.toLowerCase().includes(search.toLowerCase()) ||
      v.propietario?.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isComercial) return null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-[#1B4F72] tabular-nums">{vehicles.length}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Total</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-green-600 tabular-nums">
            {vehicles.filter((v) => (v as unknown as Record<string, unknown>).status === 'completado').length}
          </p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Completados</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600 tabular-nums">
            {vehicles.filter((v) => (v as unknown as Record<string, unknown>).status !== 'completado').length}
          </p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">En Proceso</p>
        </div>
      </div>

      {/* Search + New */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa, marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditingId(null); setShowForm(true); }}
            className="btn-primary flex items-center gap-2 whitespace-nowrap"
          >
            <Icon name="PlusIcon" size={18} className="text-white" />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-10 text-center">
            <Icon name="TruckIcon" size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">No hay vehículos en producción</p>
            <p className="text-sm text-gray-400 mt-1">Registra el primer vehículo para comenzar</p>
            {canEdit && (
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto">
                Nuevo Vehículo
              </button>
            )}
          </div>
        )}
        {filtered.map((vehicle) => (
          <div key={vehicle.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[#1B4F72]">{vehicle.placa}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                    {vehicle.marca}
                  </span>
                  {vehicle._dirty && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                      Pendiente sync
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-700">{vehicle.modelo} — {vehicle.color}</p>
                <p className="text-xs text-gray-500 mt-0.5">{vehicle.propietario}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-gray-400">{vehicle.fecha_creacion}</span>
                <span className="text-xs text-gray-400">{(vehicle.materials as unknown[])?.length || 0} material(es)</span>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setEditingId(vehicle.id); setShowForm(true); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1B4F72] text-white text-sm font-semibold active:scale-95 transition-all"
                >
                  <Icon name="PencilSquareIcon" size={16} className="text-white" />
                  Editar
                </button>
                <button
                  onClick={() => setDeleteId(vehicle.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:scale-95 transition-all hover:bg-red-100"
                >
                  <Icon name="TrashIcon" size={16} className="text-red-500" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && showForm && (
        <VehicleProductionForm vehicleId={editingId} onClose={handleFormClose} />
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Eliminar Vehículo"
        message="¿Estás seguro de que deseas eliminar este vehículo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  );
}