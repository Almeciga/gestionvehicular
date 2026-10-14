'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import SyncStatusBadge from '@/components/ui/SyncStatusBadge';
import InspectionFormModal from './InspectionFormModal';
import PdfGenerationModal from './PdfGenerationModal';
import { toast } from 'sonner';
import { InspectionsRepo } from '@/lib/repositories';
import { migrateLegacyInspections } from '@/lib/inspectionMigration';
import { toInspectionView, type InspectionView } from '@/lib/inspectionView';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import {
  generateInspectionPDFWithProgress,
  openPDFInPrintWindow,
  type PDFGenerationProgress,
} from '@/lib/inspectionPdfGenerator';
import UsersSelectPanel from './UsersSelectPanel';
import { buildPdfDataFromInspection, downloadServerPdf, savePdfExportRecord } from '@/lib/inspectionPdfActions';
import ConfirmReasonDialog from './ConfirmReasonDialog';
import AdminDashboard from './AdminDashboard';

// ─── Component ────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | string;

export default function InspectionListView() {
  const { isAdmin, profile } = useAuth();
  const { isOnline, pendingCount, pendingMediaCount, isSyncing, syncStatus, runSync } = useNetworkSync();
  const [inspections, setInspections] = useState<InspectionView[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<PDFGenerationProgress | null>(null);
  const [pendingPdfInsp, setPendingPdfInsp] = useState<InspectionView | null>(null);
  const [pendingPdfIsRegen, setPendingPdfIsRegen] = useState(false);
  const [unlockDialogId, setUnlockDialogId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [serverPdfLoadingId, setServerPdfLoadingId] = useState<string | null>(null);

  const loadInspections = useCallback(async () => {
    await migrateLegacyInspections();
    const views = (await InspectionsRepo.getAll()).map(toInspectionView);
    // The audit history remains in Supabase and is written by database
    // triggers/RPCs. It is intentionally not fetched here: the deployed
    // project is currently rejecting that endpoint without an API key, and a
    // non-essential audit read must never block the inspections list or sync.
    setInspections(views);
  }, []);

  useEffect(() => {
    loadInspections();
    window.addEventListener('gv-sync-complete', loadInspections);
    return () => window.removeEventListener('gv-sync-complete', loadInspections);
  }, [loadInspections]);

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
    loadInspections();
  };

  const handleDelete = async (id: string, placa: string) => {
    if (!confirm(`¿Eliminar inspección de ${placa}? Esta acción no se puede deshacer.`)) return;
    await InspectionsRepo.delete(id);
    loadInspections();
    toast.success('Inspección eliminada');
  };

  const handleUnlock = (id: string, placa: string) => {
    if (!isAdmin) return;
    setUnlockDialogId(id);
  };

  const confirmUnlock = async (id: string, reason: string) => {
    const insp = inspections.find((i) => i.id === id);
    if (!insp) return;
    const unlocked = await InspectionsRepo.unlock(id, reason);
    if (unlocked.ok) {
      loadInspections();
      toast.success(`Inspección de ${insp.placa} desbloqueada. Razón registrada en auditoría.`);
    } else {
      toast.error('El motivo del desbloqueo es requerido (mínimo 5 caracteres)');
    }
    setUnlockDialogId(null);
  };

  const handleArchive = async (id: string, placa: string) => {
    if (!isAdmin) return;
    if (!confirm(`¿Archivar la inspección de ${placa}?`)) return;
    const archived = await InspectionsRepo.archive(id);
    if (archived.ok) {
      loadInspections();
      toast.success(`Inspección de ${placa} archivada`);
    }
  };

  const handleFinalize = async (id: string, placa: string) => {
    if (!isAdmin) return;
    if (!confirm(`¿Finalizar la inspección de ${placa}? Quedará bloqueada de forma permanente — ni siquiera un administrador podrá editarla sin usar "Desbloquear" con motivo justificado.`)) return;
    const finalized = await InspectionsRepo.finalize(id);
    if (finalized.ok) {
      loadInspections();
      toast.success(`Inspección de ${placa} finalizada y bloqueada. Generando PDF...`);
      // Auto-generate the legal-evidence PDF right after finalizing, same as before
      const refreshed = await InspectionsRepo.getById(id);
      if (refreshed) startPdfGeneration(toInspectionView(refreshed), false);
    } else {
      toast.error('No se pudo finalizar — el estado actual no lo permite');
    }
  };

  const handleApprove = async (id: string, placa: string) => {
    if (!isAdmin) return;
    if (!confirm(`¿Aprobar la inspección de ${placa}?`)) return;
    const approved = await InspectionsRepo.approve(id);
    if (approved.ok) {
      loadInspections();
      toast.success(`Inspección de ${placa} aprobada`);
    }
  };

  const handleReject = (id: string) => {
    if (!isAdmin) return;
    setRejectDialogId(id);
  };

  const confirmReject = async (id: string, reason: string) => {
    const insp = inspections.find((i) => i.id === id);
    if (!insp) return;
    const rejected = await InspectionsRepo.reject(id, reason);
    if (rejected.ok) {
      loadInspections();
      toast.success(`Inspección de ${insp.placa} rechazada`);
    }
    setRejectDialogId(null);
  };

  // ─── PDF generation ─────────────────────────────────────────────────────────

  const startPdfGeneration = async (insp: InspectionView, isRegeneration: boolean) => {
    const currentCount = ((insp.datos as Record<string, unknown>)?.pdfGenerationCount as number) || 0;
    const newCount = currentCount + 1;
    const pdfData = buildPdfDataFromInspection(insp, newCount);

    const result = await generateInspectionPDFWithProgress(pdfData, (prog) => {
      setPdfProgress(prog);
    });

    if (result.success && result.html) {
      const filename = `BT-inspeccion-${insp.placa.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.html`;
      openPDFInPrintWindow(result.html, filename);
      setPdfProgress({ stage: 'done', message: 'PDF generado', percent: 100, totalImages: 0, loadedImages: 0, failedImages: result.failedImages });
      await InspectionsRepo.update(insp.id, { data: { ...(insp.datos as Record<string, unknown>), pdfGenerationCount: newCount } });
      savePdfExportRecord(insp, profile?.id || '', profile?.full_name || '', isRegeneration);
      if (isRegeneration) toast.success(`PDF regenerado para ${insp.placa} — Acción registrada en auditoría`);
      loadInspections();
    }
  };

  const handleGeneratePdf = (insp: InspectionView, isRegeneration = false) => {
    if (isRegeneration && !isAdmin) { toast.error('Solo los administradores pueden regenerar PDFs finalizados'); return; }
    if (isRegeneration && !confirm(`¿Regenerar el PDF de la inspección ${insp.placa}? Esta acción quedará registrada.`)) return;
    setPendingPdfInsp(insp);
    setPendingPdfIsRegen(isRegeneration);
    setPdfProgress({ stage: 'preloading', message: 'Iniciando...', percent: 0, totalImages: 0, loadedImages: 0, failedImages: 0 });
    startPdfGeneration(insp, isRegeneration);
  };

  const handlePdfRetry = () => {
    if (!pendingPdfInsp) return;
    setPdfProgress({ stage: 'preloading', message: 'Reintentando...', percent: 0, totalImages: 0, loadedImages: 0, failedImages: 0 });
    startPdfGeneration(pendingPdfInsp, pendingPdfIsRegen);
  };

  const handleServerPdfDownload = async (insp: InspectionView) => {
    setServerPdfLoadingId(insp.id);
    try {
      const result = await downloadServerPdf(insp.id, insp.placa);
      if (result.success) {
        toast.success(`PDF descargado para ${insp.placa}`);
      } else {
        toast.error(result.error || 'Error al descargar PDF del servidor');
      }
    } finally {
      setServerPdfLoadingId(null);
    }
  };

  // ─── Filtered list ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    // IMPORTANT: filter over the `inspections` state (safe for SSR/hydration —
    // starts as [] on both server and client, then gets populated via
    // loadInspections() in a useEffect, after mount). Do NOT call
    // searchInspections()/getInspections() here: those read localStorage
    // directly, which returns real data on the client's very first render
    // pass (before hydration even finishes) while the server always rendered
    // `[]` — causing a hydration mismatch.
    const q = search.toLowerCase().trim();
    return inspections.filter((insp) => {
      if (q) {
        const searchable = [
          insp.placa,
          insp.propietario,
          insp.marca,
          insp.modelo,
          insp.enterpriseId || '',
          insp.inspectorName || '',
          ((insp.datos as Record<string, unknown>)?.vin as string) || '',
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (filterStatus !== 'all' && insp.status !== filterStatus) return false;
      return true;
    });
  }, [search, filterStatus, inspections]);

  // Moved to state to avoid SSR/client hydration mismatch (new Date() differs server vs client)
  const [today, setToday] = useState<string>('');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }, []);

  const stats = {
    hoy: inspections.filter((i) => i.fecha === today).length,
    completadas: inspections.filter((i) => i.status === 'aprobado' || i.status === 'finalizado').length,
    enProceso: inspections.filter((i) => i.status === 'activo' || i.status === 'borrador').length,
    revision: inspections.filter((i) => i.status === 'pendiente_revision').length,
    archivadas: inspections.filter((i) => i.status === 'archivado').length,
  };

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'activo', label: 'En Proceso' },
    { key: 'borrador', label: 'Borrador' },
    { key: 'pendiente_revision', label: '⏳ Revisión' },
    { key: 'rechazado', label: '✗ Rechazadas' },
    { key: 'aprobado', label: 'Aprobadas' },
    { key: 'finalizado', label: '🔒 Finalizadas' },
    { key: 'archivado', label: '📁 Archivadas' },
  ];

  const unlockTarget = unlockDialogId ? inspections.find((i) => i.id === unlockDialogId) : null;
  const rejectTarget = rejectDialogId ? inspections.find((i) => i.id === rejectDialogId) : null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Dialogs */}
      {unlockTarget && (
        <ConfirmReasonDialog
          variant="unlock"
          placa={unlockTarget.placa}
          onConfirm={(reason) => confirmUnlock(unlockTarget.id, reason)}
          onCancel={() => setUnlockDialogId(null)}
        />
      )}
      {rejectTarget && (
        <ConfirmReasonDialog
          variant="reject"
          placa={rejectTarget.placa}
          onConfirm={(reason) => confirmReject(rejectTarget.id, reason)}
          onCancel={() => setRejectDialogId(null)}
        />
      )}
      {showAdminDashboard && (
        <AdminDashboard inspections={inspections} onClose={() => setShowAdminDashboard(false)} />
      )}

      {/* PDF Generation Modal */}
      {pdfProgress && (
        <PdfGenerationModal
          progress={pdfProgress}
          onRetry={handlePdfRetry}
          onClose={() => { setPdfProgress(null); setPendingPdfInsp(null); }}
        />
      )}

      {/* Network + Sync Status Bar */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SyncStatusBadge
            status={syncStatus}
            pendingCount={pendingCount + pendingMediaCount}
          />
          {!isOnline && (
            <span className="text-xs text-gray-500">Modo offline — datos guardados localmente</span>
          )}
          {isOnline && (pendingCount > 0 || pendingMediaCount > 0) && (
            <button
              onClick={runSync}
              disabled={isSyncing}
              className="text-xs text-[#1B4F72] font-semibold hover:underline disabled:opacity-50"
            >
              Sincronizar ahora
            </button>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdminDashboard(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B4F72]/10 text-[#1B4F72] text-xs font-bold hover:bg-[#1B4F72]/20 transition-colors"
          >
            <Icon name="ChartBarIcon" size={14} className="text-[#1B4F72]" />
            Admin
            {stats.revision > 0 && (
              <span className="bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{stats.revision}</span>
            )}
          </button>
        )}
      </div>

      {/* Stats Row */}
      <UsersSelectPanel />
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-[#1B4F72] tabular-nums">{stats.hoy}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Hoy</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-green-600 tabular-nums">{stats.completadas}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Finalizadas</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600 tabular-nums">{stats.enProceso}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">En Proceso</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-orange-600 tabular-nums">{stats.revision}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Revisión</p>
        </div>
      </div>

      {/* Search + New */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa, VIN, propietario, ID, inspector..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <Icon name="XMarkIcon" size={16} className="text-gray-400" />
            </button>
          )}
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm(true); }}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          <Icon name="PlusIcon" size={18} className="text-white" />
          <span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        {filterTabs.map((f) => (
          <button
            key={`filter-${f.key}`}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filterStatus === f.key ? 'bg-[#1B4F72] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-10 text-center">
            <Icon name="ClipboardDocumentCheckIcon" size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">
              {search ? `Sin resultados para "${search}"` : 'No hay inspecciones'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {search ? 'Intente con otro término de búsqueda' : 'Crea una nueva inspección para comenzar'}
            </p>
            {!search && (
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto">
                Nueva Inspección
              </button>
            )}
          </div>
        )}
        {filtered.map((insp) => (
          <div
            key={insp.id}
            className={`card p-4 active:scale-[0.99] transition-transform ${
              insp.isLocked ? 'border-l-4 border-l-amber-400' :
                insp.status === 'archivado' ? 'border-l-4 border-l-purple-400 opacity-80' :
                  insp.status === 'pendiente_revision' ? 'border-l-4 border-l-orange-400' :
                    insp.status === 'rechazado' ? 'border-l-4 border-l-red-400' :
                      insp.status === 'aprobado' ? 'border-l-4 border-l-green-400' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-[#1B4F72]">{insp.placa}</span>
                  {insp.enterpriseId && (
                    <span className="text-xs font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{insp.enterpriseId}</span>
                  )}
                  <StatusBadge status={insp.status} />
                  {insp.isLocked && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Icon name="LockClosedIcon" size={11} className="text-amber-600" />
                      Bloqueada
                    </span>
                  )}
                  {((insp.datos as Record<string, unknown>)?.pdfGenerationCount as number) > 0 && (
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      <Icon name="DocumentTextIcon" size={11} className="text-blue-600" />
                      PDF #{(insp.datos as Record<string, unknown>)?.pdfGenerationCount as number}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-700">{insp.marca} {insp.modelo} — {insp.color}</p>
                <p className="text-xs text-gray-500 mt-0.5">{insp.propietario}</p>
                {insp.inspectorName && (
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Icon name="UserIcon" size={11} className="text-gray-400" />
                    {insp.inspectorName}
                  </p>
                )}
                {insp.rejectionReason && (
                  <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded-lg">
                    ✗ {insp.rejectionReason}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 ml-2">
                <span className="text-xs text-gray-400">{insp.fecha}</span>
                {insp.finalizationTimestamp && (
                  <span className="text-xs text-amber-600 font-semibold">
                    Fin: {new Date(insp.finalizationTimestamp).toLocaleDateString('es-ES')}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  {isAdmin && insp.auditLog && insp.auditLog.length > 0 && (
                    <button
                      onClick={() => setShowAuditId(showAuditId === insp.id ? null : insp.id)}
                      className="p-1 rounded-lg hover:bg-blue-50 transition-colors"
                      title="Ver historial de auditoría"
                    >
                      <Icon name="ClockIcon" size={14} className="text-blue-400" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(insp.id, insp.placa)}
                      className="p-1 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Icon name="TrashIcon" size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audit trail panel */}
            {showAuditId === insp.id && insp.auditLog && (
              <div className="mb-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                  <Icon name="ClockIcon" size={12} className="text-blue-600" />
                  Historial de Auditoría — {insp.enterpriseId || insp.id.slice(-8)}
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {insp.auditLog.map((entry, idx) => (
                    <div key={`audit-${idx}`} className="flex items-start gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                        entry.action === 'finalized' ? 'bg-amber-100 text-amber-700' :
                          entry.action === 'unlocked' ? 'bg-orange-100 text-orange-700' :
                            entry.action === 'archived' ? 'bg-purple-100 text-purple-700' :
                              entry.action === 'pdf_generated' ? 'bg-blue-100 text-blue-700' :
                                entry.action === 'created' ? 'bg-green-100 text-green-700' :
                                  entry.action === 'approved' ? 'bg-green-100 text-green-700' :
                                    entry.action === 'rejected' ? 'bg-red-100 text-red-700' :
                                      entry.action === 'submitted_for_review'? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                      }`}>{entry.action}</span>
                      <span className="text-gray-600">{entry.performedByName || 'Sistema'}</span>
                      {entry.details && <span className="text-gray-400 truncate max-w-[120px]">{entry.details}</span>}
                      <span className="text-gray-400 ml-auto flex-shrink-0">{new Date(entry.timestamp).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="mt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-500">Secciones completadas</span>
                <span className="text-xs font-bold text-gray-700">{insp.seccionesCompletadas}/{insp.totalSecciones}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    insp.status === 'archivado' ? 'bg-purple-400' :
                      insp.status === 'aprobado' ? 'bg-green-500' :
                        insp.status === 'rechazado'? 'bg-red-400' : insp.isLocked ?'bg-amber-400' :
                          insp.seccionesCompletadas === insp.totalSecciones ? 'bg-green-500' : 'bg-[#1B4F72]'
                  }`}
                  style={{ width: `${(insp.seccionesCompletadas / insp.totalSecciones) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={() => { setEditingId(insp.id); setShowForm(true); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1B4F72] text-white text-sm font-semibold active:scale-95 transition-all min-w-0"
              >
                <Icon name={insp.isLocked || insp.status === 'archivado' ? 'EyeIcon' : 'PencilSquareIcon'} size={16} className="text-white" />
                {insp.isLocked || insp.status === 'archivado' ? 'Ver' : insp.status === 'aprobado' ? 'Ver' : 'Continuar'}
              </button>

              {/* Admin: Approve/Reject for pending review */}
              {isAdmin && insp.status === 'pendiente_revision' && (
                <>
                  <button
                    onClick={() => handleApprove(insp.id, insp.placa)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-green-100 text-green-700 text-sm font-semibold active:scale-95 transition-all hover:bg-green-200"
                  >
                    <Icon name="CheckIcon" size={16} className="text-green-600" />
                    <span className="hidden sm:inline">Aprobar</span>
                  </button>
                  <button
                    onClick={() => handleReject(insp.id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-100 text-red-700 text-sm font-semibold active:scale-95 transition-all hover:bg-red-200"
                  >
                    <Icon name="XMarkIcon" size={16} className="text-red-600" />
                    <span className="hidden sm:inline">Rechazar</span>
                  </button>
                </>
              )}

              {/* Admin: Finalizar for approved/completed records */}
              {isAdmin && insp.status === 'aprobado' && (
                <button
                  onClick={() => handleFinalize(insp.id, insp.placa)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold active:scale-95 transition-all hover:bg-emerald-200"
                  title="Finalizar y bloquear permanentemente (Admin)"
                >
                  <Icon name="LockClosedIcon" size={16} className="text-emerald-600" />
                  <span className="hidden sm:inline">Finalizar</span>
                </button>
              )}

              {isAdmin && insp.isLocked && insp.status !== 'archivado' && (
                <button
                  onClick={() => handleUnlock(insp.id, insp.placa)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-700 text-sm font-semibold active:scale-95 transition-all hover:bg-amber-200"
                  title="Desbloquear para edición (Admin)"
                >
                  <Icon name="LockOpenIcon" size={16} className="text-amber-600" />
                  <span className="hidden sm:inline">Desbloquear</span>
                </button>
              )}

              {isAdmin && insp.isLocked && insp.status !== 'archivado' && (
                <button
                  onClick={() => handleArchive(insp.id, insp.placa)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-100 text-purple-700 text-sm font-semibold active:scale-95 transition-all hover:bg-purple-200"
                  title="Archivar inspección"
                >
                  <Icon name="ArchiveBoxIcon" size={16} className="text-purple-600" />
                  <span className="hidden sm:inline">Archivar</span>
                </button>
              )}

              <button
                onClick={() => handleGeneratePdf(insp, isAdmin && insp.isLocked)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all ${
                  isAdmin && insp.isLocked
                    ? 'bg-[#1B4F72] text-white hover:bg-[#154360]'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={isAdmin && insp.isLocked ? 'Regenerar PDF (Admin)' : 'Descargar reporte PDF completo'}
              >
                <Icon name="DocumentArrowDownIcon" size={16} className={isAdmin && insp.isLocked ? 'text-white' : 'text-gray-600'} />
                {isAdmin && insp.isLocked ? 'Regen. PDF' : 'PDF'}
              </button>

              {/* Server-side PDF download (requires inspection synced to Supabase) */}
              {insp.syncStatus === 'synced' && (
                <button
                  onClick={() => handleServerPdfDownload(insp)}
                  disabled={serverPdfLoadingId === insp.id}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-all bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                  title="Descargar PDF del servidor (con imágenes firmadas)"
                >
                  {serverPdfLoadingId === insp.id
                    ? <Icon name="ArrowPathIcon" size={16} className="text-emerald-600 animate-spin" />
                    : <Icon name="CloudArrowDownIcon" size={16} className="text-emerald-600" />
                  }
                  <span className="hidden sm:inline">PDF↓</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <InspectionFormModal
          inspectionId={editingId}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
