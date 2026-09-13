'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import SyncStatusBadge from '@/components/ui/SyncStatusBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { ProductionOrdersRepo, POCatalogRepo } from '@/lib/repositories';
import { createClient } from '@/lib/supabase/client';
import { getDB, type DBProductionOrder, type DBPOCliente, type DBPOCatalogItem, type DBPOPiezaVidrio } from '@/lib/db';
import { setLastSync } from '@/lib/db';
import ProductionOrderFormModal from './ProductionOrderFormModal';
import {
  generateProductionOrderPDF,
  openProductionOrderPDF,
  type ProductionOrderPDFData,
} from '@/lib/productionOrderPdfGenerator';

// ─── Status config ────────────────────────────────────────────────────────────

export const PO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  pendiente_aprobacion: { label: 'Pendiente aprobación', className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  rechazada: { label: 'Rechazada', className: 'bg-red-100 text-red-700 border border-red-200' },
  aprobada: { label: 'Aprobada', className: 'bg-sky-100 text-sky-700 border border-sky-200' },
  en_produccion: { label: 'En producción', className: 'bg-blue-100 text-blue-700 border border-blue-200' },
  terminada: { label: 'Terminada', className: 'bg-green-100 text-green-700 border border-green-200' },
  despachada: { label: 'Despachada', className: 'bg-purple-100 text-purple-700 border border-purple-200' },
  cancelada: { label: 'Cancelada', className: 'bg-gray-200 text-gray-700 border border-gray-300' },
};

function POStatusBadge({ status }: { status: string }) {
  const cfg = PO_STATUS_CONFIG[status] ?? PO_STATUS_CONFIG.borrador;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ─── Sync catalogs from Supabase ──────────────────────────────────────────────

async function syncCatalogsFromSupabase(): Promise<void> {
  const supabase = createClient();
  const now = Date.now();

  const [c, m, n, f, i, p, t] = await Promise.all([
    supabase.from('po_clientes').select('*').order('nombre'),
    supabase.from('po_modelos_vehiculo').select('*').order('orden'),
    supabase.from('po_niveles_nij').select('*').order('orden'),
    supabase.from('po_formas_pago').select('*').order('orden'),
    supabase.from('po_incoterms').select('*').order('orden'),
    supabase.from('po_piezas_vidrio').select('*').order('orden'),
    supabase.from('po_tipos_marcacion').select('*').order('orden'),
  ]);

  await POCatalogRepo.bulkUpsertCatalogs({
    clientes: (c.data ?? []) as DBPOCliente[],
    modelos: (m.data ?? []) as DBPOCatalogItem[],
    niveles: (n.data ?? []) as DBPOCatalogItem[],
    formasPago: (f.data ?? []) as DBPOCatalogItem[],
    incoterms: (i.data ?? []) as DBPOCatalogItem[],
    piezas: (p.data ?? []) as DBPOPiezaVidrio[],
    marcaciones: (t.data ?? []) as DBPOCatalogItem[],
  });

  await setLastSync('po_catalogs', now);
}

async function syncOrdersFromSupabase(): Promise<void> {
  const supabase = createClient();
  const db = getDB();
  const now = Date.now();

  const { data } = await supabase
    .from('production_orders')
    .select('*')
    .order('updated_at', { ascending: false });

  if (data?.length) {
    await db.production_orders.bulkPut(
      (data as DBProductionOrder[]).map((o) => ({ ...o, _synced_at: now, _dirty: false }))
    );
    await setLastSync('production_orders', now);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductionOrdersListView() {
  const { isAdmin, isComercial, profile, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject' | 'start' | 'finish' | 'dispatch' | 'cancel' | 'reopen' | 'delete';
    orderId: string;
    reason?: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Initial sync
  useEffect(() => {
    if (authLoading) return;
    setSyncing(true);
    Promise.all([syncCatalogsFromSupabase(), syncOrdersFromSupabase()])
      .catch(() => {})
      .finally(() => {
        setSyncing(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.productionOrders.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.poCatalogs.all });
      });
  }, [authLoading, queryClient]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: queryKeys.productionOrders.list(),
    queryFn: () => ProductionOrdersRepo.getAll(),
    enabled: !authLoading,
    staleTime: 2 * 60 * 1000,
  });

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.numero_orden?.toLowerCase().includes(q) ||
      o.cliente_nombre?.toLowerCase().includes(q) ||
      o.modelo_nombre?.toLowerCase().includes(q) ||
      o.pais?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleOpenOrder = useCallback((id: string) => {
    setSelectedOrderId(id);
    setShowForm(true);
  }, []);

  const handleNewOrder = useCallback(() => {
    setSelectedOrderId(null);
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setSelectedOrderId(null);
    syncOrdersFromSupabase().then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productionOrders.all });
    });
  }, [queryClient]);

  const handleAdminAction = async (
    type: 'approve' | 'reject' | 'start' | 'finish' | 'dispatch' | 'cancel' | 'reopen' | 'delete',
    orderId: string
  ) => {
    if (type === 'reject' || type === 'cancel') {
      setConfirmAction({ type, orderId });
      return;
    }
    setConfirmAction({ type, orderId });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { type, orderId } = confirmAction;
    setActionLoading(true);

    try {
      const supabase = createClient();
      let error: { message: string } | null = null;

      if (type === 'approve') {
        const res = await supabase.rpc('po_approve_order', { p_order_id: orderId });
        error = res.error;
      } else if (type === 'reject') {
        if (!rejectReason.trim()) { toast.error('El motivo de rechazo es requerido'); setActionLoading(false); return; }
        const res = await supabase.rpc('po_reject_order', { p_order_id: orderId, p_reason: rejectReason });
        error = res.error;
      } else if (type === 'start') {
        const res = await supabase.rpc('po_start_production', { p_order_id: orderId });
        error = res.error;
      } else if (type === 'finish') {
        const res = await supabase.rpc('po_finish_order', { p_order_id: orderId });
        error = res.error;
      } else if (type === 'dispatch') {
        const res = await supabase.rpc('po_dispatch_order', { p_order_id: orderId });
        error = res.error;
      } else if (type === 'cancel') {
        if (!cancelReason.trim()) { toast.error('El motivo de cancelación es requerido'); setActionLoading(false); return; }
        const res = await supabase.rpc('po_cancel_order', { p_order_id: orderId, p_reason: cancelReason });
        error = res.error;
      } else if (type === 'reopen') {
        const res = await supabase.rpc('po_reopen_order', { p_order_id: orderId });
        error = res.error;
      } else if (type === 'delete') {
        const res = await supabase.from('production_orders').delete().eq('id', orderId);
        error = res.error;
        if (!error) {
          const db = getDB();
          await db.production_orders.delete(orderId);
        }
      }

      if (error) throw new Error(error.message);

      toast.success('Acción realizada correctamente');
      setConfirmAction(null);
      setRejectReason('');
      setCancelReason('');
      await syncOrdersFromSupabase();
      queryClient.invalidateQueries({ queryKey: queryKeys.productionOrders.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ejecutar acción');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPDF = async (order: DBProductionOrder) => {
    setPdfLoading(order.id);
    try {
      const supabase = createClient();
      const { data: items } = await supabase
        .from('production_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('linea');

      const pdfData: ProductionOrderPDFData = {
        id: order.id,
        numero_orden: order.numero_orden ?? 'Pendiente',
        fecha: order.fecha,
        status: order.status,
        cliente_nombre: order.cliente_nombre,
        pais: order.pais,
        modelo_nombre: order.modelo_nombre,
        nivel_nij_nombre: order.nivel_nij_nombre,
        forma_pago_nombre: order.forma_pago_nombre,
        incoterm_nombre: order.incoterm_nombre,
        cantidad_vehiculos: order.cantidad_vehiculos,
        observaciones: order.observaciones,
        total_piezas: order.total_piezas,
        items: (items ?? []).map((it: Record<string, unknown>, idx: number) => ({
          linea: (it.linea as number) ?? idx + 1,
          pieza_nombre: (it.pieza_nombre as string) ?? '',
          codigo: (it.codigo as string) ?? '',
          cantidad: (it.cantidad as number) ?? 1,
          nivel_nij_nombre: (it.nivel_nij_nombre as string) ?? '',
          lleva_marcacion: (it.lleva_marcacion as boolean) ?? false,
          tipo_marcacion_nombre: (it.tipo_marcacion_nombre as string) ?? undefined,
          observaciones: (it.observaciones as string) ?? undefined,
        })),
        created_by_name: order.created_by_name,
        created_at: order.created_at,
      };

      const html = await generateProductionOrderPDF(pdfData);
      openProductionOrderPDF(html);
    } catch {
      toast.error('Error al generar PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  const statusFilters = [
    { value: 'all', label: 'Todas' },
    { value: 'borrador', label: 'Borrador' },
    { value: 'pendiente_aprobacion', label: 'Pendiente' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'aprobada', label: 'Aprobada' },
    { value: 'en_produccion', label: 'En producción' },
    { value: 'terminada', label: 'Terminada' },
    { value: 'despachada', label: 'Despachada' },
    { value: 'cancelada', label: 'Cancelada' },
  ];

  const canCreate = isAdmin || isComercial;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Órdenes de Producción</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {syncing ? 'Sincronizando...' : `${filtered.length} orden${filtered.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || isComercial) && (
            <button
              onClick={() => window.location.assign('/production-orders/catalogs')}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Icon name="Cog6ToothIcon" size={16} className="text-gray-600" />
              <span className="hidden sm:inline">Catálogos</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={handleNewOrder}
              className="btn-primary flex items-center gap-2"
            >
              <Icon name="PlusIcon" size={18} className="text-white" />
              <span className="hidden sm:inline">Nueva Orden</span>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por N° orden, cliente, modelo, país..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
        />
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === f.value
                ? 'bg-[#1B4F72] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {(isLoading || syncing) && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !syncing && filtered.length === 0 && (
        <div className="card p-10 text-center">
          <Icon name="ClipboardDocumentListIcon" size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No hay órdenes de producción</p>
          {canCreate && (
            <button onClick={handleNewOrder} className="mt-4 btn-primary">
              Crear primera orden
            </button>
          )}
        </div>
      )}

      {/* Orders list */}
      {!isLoading && !syncing && (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleOpenOrder(order.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-bold text-[#1B4F72] text-sm">
                      {order.numero_orden ?? 'Pendiente (sin sincronizar)'}
                    </span>
                    <POStatusBadge status={order.status} />
                    <SyncStatusBadge status={order._dirty ? 'pending' : 'synced'} />
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {order.cliente_nombre} {order.pais ? `· ${order.pais}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{order.modelo_nombre}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <span>{order.fecha}</span>
                    <span>·</span>
                    <span>{order.cantidad_vehiculos} vehículo{order.cantidad_vehiculos !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{order.total_piezas} pieza{order.total_piezas !== 1 ? 's' : ''}</span>
                  </div>
                  {order.created_by_name && (
                    <p className="text-xs text-gray-400 mt-0.5">Creado por: {order.created_by_name}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDownloadPDF(order)}
                    disabled={pdfLoading === order.id}
                    className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="Descargar PDF"
                  >
                    {pdfLoading === order.id ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="DocumentArrowDownIcon" size={16} className="text-gray-600" />
                    )}
                  </button>

                  {isAdmin && order.status === 'pendiente_aprobacion' && (
                    <>
                      <button
                        onClick={() => handleAdminAction('approve', order.id)}
                        className="p-2 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
                        title="Aprobar"
                      >
                        <Icon name="CheckCircleIcon" size={16} className="text-green-600" />
                      </button>
                      <button
                        onClick={() => handleAdminAction('reject', order.id)}
                        className="p-2 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                        title="Rechazar"
                      >
                        <Icon name="XCircleIcon" size={16} className="text-red-600" />
                      </button>
                    </>
                  )}
                  {isAdmin && order.status === 'aprobada' && (
                    <button
                      onClick={() => handleAdminAction('start', order.id)}
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                      title="Iniciar producción"
                    >
                      <Icon name="PlayIcon" size={16} className="text-blue-600" />
                    </button>
                  )}
                  {isAdmin && order.status === 'en_produccion' && (
                    <button
                      onClick={() => handleAdminAction('finish', order.id)}
                      className="p-2 rounded-xl bg-green-50 hover:bg-green-100 transition-colors"
                      title="Marcar terminada"
                    >
                      <Icon name="CheckIcon" size={16} className="text-green-600" />
                    </button>
                  )}
                  {isAdmin && order.status === 'terminada' && (
                    <button
                      onClick={() => handleAdminAction('dispatch', order.id)}
                      className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 transition-colors"
                      title="Marcar despachada"
                    >
                      <Icon name="TruckIcon" size={16} className="text-purple-600" />
                    </button>
                  )}
                  {isAdmin && !['despachada', 'cancelada'].includes(order.status) && (
                    <button
                      onClick={() => handleAdminAction('cancel', order.id)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                      title="Cancelar"
                    >
                      <Icon name="NoSymbolIcon" size={16} className="text-gray-600" />
                    </button>
                  )}
                  {isAdmin && order.status === 'borrador' && (
                    <button
                      onClick={() => handleAdminAction('delete', order.id)}
                      className="p-2 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                      title="Eliminar"
                    >
                      <Icon name="TrashIcon" size={16} className="text-red-600" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Form Modal */}
      {showForm && (
        <ProductionOrderFormModal
          orderId={selectedOrderId}
          onClose={handleCloseForm}
          currentUserName={profile?.full_name ?? ''}
          currentUserId={profile?.id ?? ''}
        />
      )}

      {/* Confirm Modal — Approve / Start / Finish / Dispatch / Reopen */}
      {confirmAction && !['reject', 'cancel'].includes(confirmAction.type) && (
        <ConfirmModal
          isOpen={true}
          title={
            confirmAction.type === 'approve' ? 'Aprobar orden' :
            confirmAction.type === 'start' ? 'Iniciar producción' :
            confirmAction.type === 'finish' ? 'Marcar como terminada' :
            confirmAction.type === 'dispatch' ? 'Marcar como despachada' :
            confirmAction.type === 'reopen'? 'Reabrir orden' : 'Eliminar orden'
          }
          message={
            confirmAction.type === 'approve' ? '¿Aprobar esta orden de producción?' :
            confirmAction.type === 'start' ? '¿Iniciar producción de esta orden?' :
            confirmAction.type === 'finish' ? '¿Marcar esta orden como terminada?' :
            confirmAction.type === 'dispatch' ? '¿Marcar esta orden como despachada?' :
            confirmAction.type === 'reopen' ? '¿Reabrir esta orden (volver un paso atrás)?' :
            '¿Eliminar esta orden? Esta acción no se puede deshacer.'
          }
          confirmLabel={actionLoading ? 'Procesando...' : 'Confirmar'}
          variant={confirmAction.type === 'delete' ? 'danger' : 'warning'}
          onConfirm={executeAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Reject Modal */}
      {confirmAction?.type === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-800 mb-3">Rechazar orden</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de rechazo *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] mb-4"
              placeholder="Describe el motivo del rechazo..."
            />
            <div className="flex gap-2">
              <button onClick={() => { setConfirmAction(null); setRejectReason(''); }} className="flex-1 btn-secondary py-3 text-sm">Cancelar</button>
              <button
                onClick={executeAction}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm disabled:opacity-50"
              >
                {actionLoading ? 'Procesando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {confirmAction?.type === 'cancel' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-800 mb-3">Cancelar orden</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de cancelación *</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] mb-4"
              placeholder="Describe el motivo de la cancelación..."
            />
            <div className="flex gap-2">
              <button onClick={() => { setConfirmAction(null); setCancelReason(''); }} className="flex-1 btn-secondary py-3 text-sm">Cancelar</button>
              <button
                onClick={executeAction}
                disabled={actionLoading || !cancelReason.trim()}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                {actionLoading ? 'Procesando...' : 'Cancelar orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
