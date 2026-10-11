'use client';
import React, { useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { DocItemPDF } from '@/lib/inspectionPdfGenerator';

export type { DocItemPDF };

// ─── Document definitions ─────────────────────────────────────────────────────

export interface VehicleDocumentItem {
  id: string;
  tipo: 'soat' | 'tecno' | 'seguro_todo_riesgo' | 'tarjeta_propiedad' | 'licencia_conduccion' | 'tarjeta_transito';
  nombre: string;
  requerido_para_finalizar: boolean;
  estado: 'pendiente' | 'cargado' | 'vencido' | 'por_vencer';
  fecha_vencimiento?: string;
  archivo_url?: string;
  archivo_mime?: string;
  notas?: string;
}

const DOCUMENT_TYPES: Omit<VehicleDocumentItem, 'estado'>[] = [
  { id: 'soat', tipo: 'soat', nombre: 'SOAT', requerido_para_finalizar: true },
  { id: 'tecno', tipo: 'tecno', nombre: 'Revisión Técnico-Mecánica / Tecnomecánica', requerido_para_finalizar: true },
  { id: 'seguro_todo_riesgo', tipo: 'seguro_todo_riesgo', nombre: 'Seguro Todo Riesgo', requerido_para_finalizar: true },
  { id: 'tarjeta_propiedad', tipo: 'tarjeta_propiedad', nombre: 'Tarjeta de Propiedad', requerido_para_finalizar: true },
  { id: 'licencia_conduccion', tipo: 'licencia_conduccion', nombre: 'Licencia de Conducción del Conductor', requerido_para_finalizar: true },
  { id: 'tarjeta_transito', tipo: 'tarjeta_transito', nombre: 'Tarjeta de Tránsito', requerido_para_finalizar: true },
];

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_MB = 5;

function getDocumentStatus(doc: VehicleDocumentItem): 'pendiente' | 'cargado' | 'vencido' | 'por_vencer' {
  if (!doc.archivo_url) return 'pendiente';
  if (!doc.fecha_vencimiento) return 'cargado';
  const today = new Date();
  const expiry = new Date(doc.fecha_vencimiento);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'vencido';
  if (diffDays <= 30) return 'por_vencer';
  return 'cargado';
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'ClockIcon' },
  cargado: { label: 'Cargado', color: 'text-green-600', bg: 'bg-green-100', icon: 'CheckCircleIcon' },
  vencido: { label: 'Vencido', color: 'text-red-600', bg: 'bg-red-100', icon: 'XCircleIcon' },
  por_vencer: { label: 'Por vencer', color: 'text-amber-600', bg: 'bg-amber-100', icon: 'ExclamationTriangleIcon' },
};

interface DocumentosSectionProps {
  docs?: DocItemPDF[];
  onChange?: (docs: DocItemPDF[]) => void;
  vehicleDocs?: VehicleDocumentItem[];
  onVehicleDocsChange?: (docs: VehicleDocumentItem[]) => void;
  /** If true, shows the enhanced document management UI */
  enhanced?: boolean;
}

export default function DocumentosSection({
  docs: externalDocs,
  onChange,
  vehicleDocs: externalVehicleDocs,
  onVehicleDocsChange,
  enhanced = false,
}: DocumentosSectionProps) {
  const [localDocs, setLocalDocs] = useState<DocItemPDF[]>([
    { id: 'doc-001', nombre: 'Tarjeta de Propiedad', tiene: null },
    { id: 'doc-002', nombre: 'Seguro Obligatorio (SOAT)', tiene: null },
    { id: 'doc-003', nombre: 'Revisión Tecnomecánica', tiene: null },
    { id: 'doc-004', nombre: 'Manuales del Vehículo', tiene: null },
    { id: 'doc-005', nombre: 'Otros Documentos', tiene: null },
  ]);

  const [localVehicleDocs, setLocalVehicleDocs] = useState<VehicleDocumentItem[]>(
    DOCUMENT_TYPES.map((d) => ({ ...d, estado: 'pendiente' as const }))
  );

  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeDocId = useRef<string | null>(null);

  const docs = externalDocs ?? localDocs;
  const vehicleDocs = externalVehicleDocs ?? localVehicleDocs;

  const updateDocs = (updated: DocItemPDF[]) => {
    if (onChange) onChange(updated);
    else setLocalDocs(updated);
  };

  const updateVehicleDocs = (updated: VehicleDocumentItem[]) => {
    if (onVehicleDocsChange) onVehicleDocsChange(updated);
    else setLocalVehicleDocs(updated);
  };

  const toggle = (id: string, val: boolean) => {
    updateDocs(docs.map((d) => d.id === id ? { ...d, tiene: val } : d));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocId.current) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      alert('Solo se permiten archivos JPG, PNG, WEBP o PDF');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`El archivo no puede superar ${MAX_FILE_SIZE_MB} MB`);
      return;
    }

    const docId = activeDocId.current;
    setUploadingId(docId);

    try {
      // Convert to base64 data URL for local storage (offline-first)
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        updateVehicleDocs(
          vehicleDocs.map((d) =>
            d.id === docId
              ? { ...d, archivo_url: dataUrl, archivo_mime: file.type, estado: getDocumentStatus({ ...d, archivo_url: dataUrl }) }
              : d
          )
        );
        setUploadingId(null);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingId(null);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadClick = (docId: string) => {
    activeDocId.current = docId;
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (docId: string) => {
    updateVehicleDocs(
      vehicleDocs.map((d) =>
        d.id === docId ? { ...d, archivo_url: undefined, archivo_mime: undefined, estado: 'pendiente' } : d
      )
    );
  };

  const handleExpiryChange = (docId: string, date: string) => {
    updateVehicleDocs(
      vehicleDocs.map((d) => {
        if (d.id !== docId) return d;
        const updated = { ...d, fecha_vencimiento: date };
        return { ...updated, estado: getDocumentStatus(updated) };
      })
    );
  };

  const missingRequired = vehicleDocs.filter(
    (d) => d.requerido_para_finalizar && (!d.archivo_url || d.estado === 'vencido')
  );

  if (enhanced) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">3</span>
            Documentos del Vehículo
          </h3>
          <span className="text-xs font-semibold text-gray-500">
            {vehicleDocs.filter((d) => d.archivo_url && d.estado !== 'vencido').length}/{vehicleDocs.length}
          </span>
        </div>

        {/* Missing docs warning */}
        {missingRequired.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800">Para finalizar la inspección se requieren:</p>
              <ul className="mt-1 space-y-0.5">
                {missingRequired.map((d) => (
                  <li key={d.id} className="text-xs text-amber-700">• {d.nombre}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="hidden"
          onChange={handleFileSelect}
          capture="environment"
        />

        <div className="space-y-3">
          {vehicleDocs.map((doc) => {
            const status = getDocumentStatus(doc);
            const cfg = STATUS_CONFIG[status];
            const isExpanded = expandedDoc === doc.id;
            const needsExpiry = ['soat', 'tecno', 'seguro_todo_riesgo', 'licencia_conduccion'].includes(doc.tipo);

            return (
              <div
                key={doc.id}
                className={`border rounded-xl overflow-hidden transition-all ${
                  status === 'cargado' ? 'border-green-200 bg-green-50' :
                  status === 'vencido' ? 'border-red-200 bg-red-50' :
                  status === 'por_vencer'? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
                }`}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <Icon name={cfg.icon as any} size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{doc.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                      {doc.fecha_vencimiento && (
                        <span className="text-xs text-gray-400">
                          Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString('es-ES')}
                        </span>
                      )}
                      {doc.requerido_para_finalizar && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">Obligatorio</span>
                      )}
                    </div>
                  </div>
                  <Icon name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={16} className="text-gray-400 flex-shrink-0" />
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-4 pt-2 border-t border-gray-100 space-y-3 bg-white">
                    {/* File upload area */}
                    {doc.archivo_url ? (
                      <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                        <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                          {doc.archivo_mime?.startsWith('image/') ? (
                            <img src={doc.archivo_url} alt={doc.nombre} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <Icon name="DocumentTextIcon" size={20} className="text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">
                            {doc.archivo_mime?.startsWith('image/') ? 'Imagen cargada' : 'PDF cargado'}
                          </p>
                          <p className="text-xs text-gray-400">{doc.archivo_mime}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleUploadClick(doc.id)}
                            className="text-xs text-blue-600 font-bold underline"
                          >
                            Cambiar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(doc.id)}
                            className="text-xs text-red-500 font-bold underline"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleUploadClick(doc.id)}
                          disabled={uploadingId === doc.id}
                          className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-200 bg-blue-50 rounded-xl text-blue-600 font-semibold text-sm active:scale-95 transition-all disabled:opacity-60"
                        >
                          {uploadingId === doc.id ? (
                            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Icon name="CameraIcon" size={18} className="text-blue-500" />
                          )}
                          Foto / Archivo
                        </button>
                      </div>
                    )}

                    {/* Expiry date for applicable documents */}
                    {needsExpiry && (
                      <div>
                        <label className="form-label">Fecha de Vencimiento</label>
                        <input
                          type="date"
                          value={doc.fecha_vencimiento || ''}
                          onChange={(e) => handleExpiryChange(doc.id, e.target.value)}
                          className="form-input"
                          min={new Date().toISOString().split('T')[0]}
                        />
                        {doc.fecha_vencimiento && status === 'por_vencer' && (
                          <p className="text-xs text-amber-600 mt-1 font-semibold">
                            ⚠️ Este documento vence pronto (menos de 30 días)
                          </p>
                        )}
                        {doc.fecha_vencimiento && status === 'vencido' && (
                          <p className="text-xs text-red-600 mt-1 font-semibold">
                            ✗ Este documento está vencido
                          </p>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <label className="form-label">Notas (opcional)</label>
                      <input
                        type="text"
                        value={doc.notas || ''}
                        onChange={(e) =>
                          updateVehicleDocs(vehicleDocs.map((d) => d.id === doc.id ? { ...d, notas: e.target.value } : d))
                        }
                        placeholder="Observaciones sobre este documento..."
                        className="form-input"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Legacy simple mode (backward compatible)
  const completados = docs.filter((d) => d.tiene !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">3</span>
          Documentos
        </h3>
        <span className="text-xs font-semibold text-gray-500">{completados}/{docs.length}</span>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.id} className={`border rounded-xl p-4 transition-all ${doc.tiene === true ? 'border-green-200 bg-green-50' : doc.tiene === false ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${doc.tiene === true ? 'bg-green-100' : doc.tiene === false ? 'bg-red-100' : 'bg-gray-100'}`}>
                <Icon
                  name={doc.tiene === true ? 'CheckCircleIcon' : doc.tiene === false ? 'XCircleIcon' : 'DocumentTextIcon'}
                  size={22}
                  className={doc.tiene === true ? 'text-green-600' : doc.tiene === false ? 'text-red-500' : 'text-gray-400'}
                />
              </div>
              <span className="flex-1 text-sm font-semibold text-gray-700">{doc.nombre}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggle(doc.id, true)}
                  className={`w-12 h-10 rounded-xl font-bold text-sm active:scale-95 transition-all ${doc.tiene === true ? 'bg-green-500 text-white ring-2 ring-green-400 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'}`}
                >
                  SÍ
                </button>
                <button
                  type="button"
                  onClick={() => toggle(doc.id, false)}
                  className={`w-12 h-10 rounded-xl font-bold text-sm active:scale-95 transition-all ${doc.tiene === false ? 'bg-red-500 text-white ring-2 ring-red-400 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500'}`}
                >
                  NO
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Export helper for finalization validation
export function getMissingDocuments(vehicleDocs: VehicleDocumentItem[]): string[] {
  return vehicleDocs
    .filter((d) => d.requerido_para_finalizar && (!d.archivo_url || d.estado === 'vencido'))
    .map((d) => d.nombre);
}
