'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import MaterialForm from './MaterialForm';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MaterialsRepo } from '@/lib/repositories';
import type { DBMaterial } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

type CategoriaType = 'Pintura' | 'Mecánica' | 'Carrocería' | 'Eléctrico' | 'Interior' | 'Consumibles';
type StockStatus = 'ok' | 'bajo' | 'agotado';

interface Material {
  id: string;
  nombre: string;
  categoria: CategoriaType;
  unidad: string;
  stock: number;
  stockMinimo: number;
  descripcion: string;
  createdAt: string;
  _dirty?: boolean;
}

const categorias: CategoriaType[] = ['Pintura', 'Mecánica', 'Carrocería', 'Eléctrico', 'Interior', 'Consumibles'];

const categoriaColors: Record<CategoriaType, string> = {
  'Pintura': 'bg-purple-100 text-purple-700',
  'Mecánica': 'bg-blue-100 text-blue-700',
  'Carrocería': 'bg-orange-100 text-orange-700',
  'Eléctrico': 'bg-yellow-100 text-yellow-700',
  'Interior': 'bg-pink-100 text-pink-700',
  'Consumibles': 'bg-gray-100 text-gray-700',
};

function getStockStatus(stock: number, minimo: number): StockStatus {
  if (stock === 0) return 'agotado';
  if (stock < minimo) return 'bajo';
  return 'ok';
}

const stockStatusConfig: Record<StockStatus, { label: string; badge: string; icon: string }> = {
  ok: { label: 'Disponible', badge: 'bg-green-100 text-green-700', icon: 'CheckCircleIcon' },
  bajo: { label: 'Stock Bajo', badge: 'bg-yellow-100 text-yellow-700', icon: 'ExclamationTriangleIcon' },
  agotado: { label: 'Agotado', badge: 'bg-red-100 text-red-700', icon: 'XCircleIcon' },
};

function dbToMaterial(row: DBMaterial): Material {
  return {
    id: row.id,
    nombre: row.nombre,
    categoria: row.categoria as CategoriaType,
    unidad: row.unidad,
    stock: Number(row.stock ?? 0),
    stockMinimo: Number(row.stock_minimo ?? 0),
    descripcion: row.descripcion || '',
    createdAt: row.created_at,
    _dirty: row._dirty,
  };
}

export default function MaterialsView() {
  const { isAdmin, loading: authLoading, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/vehicle-inspection');
    }
  }, [authLoading, isAdmin, router]);

  // Read from IndexedDB via TanStack Query — no Supabase call on render
  const { data: rawMaterials = [], isLoading } = useQuery({
    queryKey: queryKeys.materials.list(),
    queryFn: () => MaterialsRepo.getAll(),
    enabled: !authLoading && isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const materials = rawMaterials.map(dbToMaterial);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => MaterialsRepo.delete(id),
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.materials.all });
      const prev = queryClient.getQueryData<DBMaterial[]>(queryKeys.materials.list());
      queryClient.setQueryData<DBMaterial[]>(
        queryKeys.materials.list(),
        (old) => (old ?? []).filter((m) => m.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(queryKeys.materials.list(), context?.prev);
      toast.error('Error al eliminar material');
    },
    onSuccess: () => {
      toast.success('Material eliminado del catálogo');
      setDeleteId(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
    },
  });

  const filtered = materials.filter((m) => {
    const matchSearch =
      m.nombre.toLowerCase().includes(search.toLowerCase()) ||
      m.categoria.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'Todos' || m.categoria === activeCategory;
    return matchSearch && matchCat;
  });

  const stats = {
    total: materials.length,
    agotados: materials.filter((m) => getStockStatus(m.stock, m.stockMinimo) === 'agotado').length,
    stockBajo: materials.filter((m) => getStockStatus(m.stock, m.stockMinimo) === 'bajo').length,
    ok: materials.filter((m) => getStockStatus(m.stock, m.stockMinimo) === 'ok').length,
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingMaterial(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-[#1B4F72] tabular-nums">{stats.total}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Total</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-green-600 tabular-nums">{stats.ok}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Disponible</p>
        </div>
        <div className="card p-3 text-center border border-yellow-200 bg-yellow-50">
          <p className="text-xl font-bold text-yellow-600 tabular-nums">{stats.stockBajo}</p>
          <p className="text-xs text-yellow-600 font-semibold mt-0.5">Stock Bajo</p>
        </div>
        <div className="card p-3 text-center border border-red-200 bg-red-50">
          <p className="text-xl font-bold text-red-600 tabular-nums">{stats.agotados}</p>
          <p className="text-xs text-red-600 font-semibold mt-0.5">Agotados</p>
        </div>
      </div>

      {/* Alert banner */}
      {(stats.agotados > 0 || stats.stockBajo > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 mb-4">
          <Icon name="ExclamationTriangleIcon" size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-red-700">
            {stats.agotados > 0 && `${stats.agotados} material(es) agotado(s)`}
            {stats.agotados > 0 && stats.stockBajo > 0 && ' · '}
            {stats.stockBajo > 0 && `${stats.stockBajo} con stock bajo`}
            {' — Requiere reabastecimiento'}
          </p>
        </div>
      )}

      {/* Search + New */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar material..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
        </div>
        <button
          onClick={() => { setEditingMaterial(null); setShowForm(true); }}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          <Icon name="PlusIcon" size={18} className="text-white" />
          <span className="hidden sm:inline">Nuevo</span>
        </button>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-4">
        {['Todos', ...categorias].map((cat) => (
          <button
            key={`filter-${cat}`}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
              activeCategory === cat ? 'bg-[#1B4F72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Materials list */}
      {!isLoading && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card p-10 text-center">
              <Icon name="CubeIcon" size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">No hay materiales en el catálogo</p>
              <p className="text-sm text-gray-400 mt-1">Agrega materiales para asignarlos a los vehículos en producción</p>
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto">
                Agregar Material
              </button>
            </div>
          )}

          {filtered.map((mat) => {
            const stockStatus = getStockStatus(mat.stock, mat.stockMinimo);
            const statusCfg = stockStatusConfig[stockStatus];
            const pct = mat.stockMinimo > 0 ? Math.min((mat.stock / mat.stockMinimo) * 100, 100) : 100;
            const updatedLabel = mat.createdAt
              ? new Date(mat.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : '—';

            return (
              <div key={mat.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800 text-sm">{mat.nombre}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${categoriaColors[mat.categoria]}`}>
                        {mat.categoria}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusCfg.badge}`}>
                        {statusCfg.label}
                      </span>
                      {mat._dirty && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                          Pendiente sync
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{mat.descripcion || 'Sin descripción'}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-lg font-bold text-gray-800 tabular-nums">{mat.stock}</p>
                    <p className="text-xs text-gray-400">{mat.unidad}</p>
                  </div>
                </div>
                {/* Stock bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Stock: {mat.stock} / Mín: {mat.stockMinimo}</span>
                    <span>{updatedLabel}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stockStatus === 'ok' ? 'bg-green-500' :
                        stockStatus === 'bajo' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingMaterial(mat); setShowForm(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-[#1B4F72] text-white text-xs font-semibold active:scale-95 transition-all"
                  >
                    <Icon name="PencilSquareIcon" size={14} className="text-white" />
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteId(mat.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold active:scale-95 transition-all hover:bg-red-100"
                  >
                    <Icon name="TrashIcon" size={14} className="text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MaterialForm
          material={editingMaterial}
          onClose={handleFormClose}
          createdBy={profile?.id}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Eliminar Material"
        message="¿Estás seguro de que deseas eliminar este material? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  );
}