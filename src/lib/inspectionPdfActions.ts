import { createClient } from '@/lib/supabase/client';
import { type InspectionView } from '@/lib/inspectionView';
import { type InspectionPDFData } from '@/lib/inspectionPdfGenerator';

// ─── Build PDF data from saved inspection ─────────────────────────────────────

export function buildPdfDataFromInspection(insp: InspectionView, generationCount?: number): InspectionPDFData {
  const datos = (insp.datos ?? {}) as Record<string, unknown>;
  const now = new Date();
  const today = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return {
    id: insp.enterpriseId || insp.id,
    fecha: insp.fecha || today,
    hora,
    inspectorName: (datos.inspectorName as string) || insp.inspectorName || '',
    inspectorId: insp.inspectorId || '',
    codigoVehiculo: (datos.codigo as string) || '',
    placa: insp.placa,
    marca: insp.marca,
    modelo: insp.modelo,
    color: insp.color,
    vin: (datos.vin as string) || '',
    propietario: insp.propietario,
    telefono: (datos.telefono as string) || '',
    celular: (datos.celular as string) || '',
    km: (datos.km as string) || '',
    bodega: (datos.bodega as string) || '',
    nivel: (datos.nivel as string) || '',
    estado: (datos.estado as string) || '',
    accesorios: (datos.accesorios as InspectionPDFData['accesorios']) || [],
    documentos: (datos.documentos as InspectionPDFData['documentos']) || [],
    piezas: (datos.piezas as InspectionPDFData['piezas']) || [],
    componentes: (datos.componentes as InspectionPDFData['componentes']) || [],
    mecanica: (datos.mecanica as InspectionPDFData['mecanica']) || [],
    combustible: typeof datos.combustible === 'number' ? datos.combustible : 2,
    scanner: (datos.scanner as InspectionPDFData['scanner']) || { imagen: null, status: 'pendiente', notas: '' },
    latoneria: (datos.latoneria as InspectionPDFData['latoneria']) || [],
    vidrios: (datos.vidrios as InspectionPDFData['vidrios']) || [],
    observaciones: (datos.observaciones as string) || '',
    video: (datos.video as InspectionPDFData['video']) || { tieneVideo: null, videoLink: '', videoFile: null },
    firmas: (datos.firmas as InspectionPDFData['firmas']) || { inspectorName: '', clienteName: '', inspectorSignature: null, clienteSignature: null },
    creationTimestamp: insp.creationTimestamp,
    finalizationTimestamp: insp.finalizationTimestamp,
    isLocked: insp.isLocked,
    unlockedAt: insp.unlockedAt ? new Date(insp.unlockedAt).toISOString() : undefined,
    unlockedBy: insp.unlockedBy,
    pdfGenerationCount: generationCount,
  };
}

// ─── Download server-side PDF blob ───────────────────────────────────────────

export async function downloadServerPdf(localId: string, placa: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();

    // New offline-first records use their UUID directly as id; legacy records
    // may only be linked through local_id. Support both safely.
    const { data: rowById, error: idError } = await supabase
      .from('inspections')
      .select('id')
      .eq('id', localId)
      .maybeSingle();
    const { data: rowByLocalId, error: localIdError } = rowById
      ? { data: null, error: null }
      : await supabase.from('inspections').select('id').eq('local_id', localId).maybeSingle();
    const row = rowById ?? rowByLocalId;
    const error = idError ?? localIdError;

    if (error || !row?.id) {
      return { success: false, error: 'Inspección no sincronizada aún. Guarda y sincroniza primero.' };
    }

    const res = await fetch(`/api/reports/${row.id}`, {
      headers: { accept: 'application/pdf' },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: (body as { error?: string }).error || `Error ${res.status}` };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BT-inspeccion-${placa.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

// ─── Save PDF export record to Supabase ──────────────────────────────────────

export async function savePdfExportRecord(
  insp: InspectionView,
  generatedBy: string,
  generatedByName: string,
  isRegeneration: boolean
): Promise<void> {
  try {
    const supabase = createClient();
    const now = new Date().toISOString();
    const filename = `BT-inspeccion-${insp.placa.replace(/[^a-zA-Z0-9]/g, '-')}-${now.slice(0, 10)}.html`;

    const { data: remoteById, error: idError } = await supabase
      .from('inspections')
      .select('id')
      .eq('id', insp.id)
      .maybeSingle();
    const { data: remoteByLocalId, error: localIdError } = remoteById
      ? { data: null, error: null }
      : await supabase.from('inspections').select('id').eq('local_id', insp.id).maybeSingle();
    const remoteInspection = remoteById ?? remoteByLocalId;
    const inspectionError = idError ?? localIdError;

    if (inspectionError || !remoteInspection?.id) return;

    await supabase.from('pdf_exports').insert({
      inspection_id: remoteInspection.id,
      generated_by: generatedBy,
      generated_at: now,
      filename,
      inspection_placa: insp.placa,
      is_regeneration: isRegeneration,
    });
    await supabase.from('inspection_audit_log').insert({
      inspection_id: remoteInspection.id,
      action: 'pdf_generated',
      performed_by: generatedBy,
      details: { filename, is_regeneration: isRegeneration, generated_by_name: generatedByName, timestamp: now },
    });
  } catch { /* Non-critical */ }
}
