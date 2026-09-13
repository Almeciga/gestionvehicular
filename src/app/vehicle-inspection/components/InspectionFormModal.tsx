'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import DatosGeneralesSection, { type DatosGeneralesValues } from './sections/DatosGeneralesSection';
import AccesoriosSection, { type AccesorioItemPDF } from './sections/AccesoriosSection';
import DocumentosSection, { type DocItemPDF } from './sections/DocumentosSection';
import PiezasSection, { type ItemConEstadoPDF } from './sections/PiezasSection';
import ComponentesSection from './sections/ComponentesSection';
import MecanicaSection, { type ItemMecanicaPDF } from './sections/MecanicaSection';
import CombustibleSection from './sections/CombustibleSection';
import ScannerSection, { type ScannerPDF } from './sections/ScannerSection';
import LatoneriaSection, { type ZonaVehiculoPDF } from './sections/LatoneriaSection';
import VidriosSection, { type VidrioItemPDF } from './sections/VidriosSection';
import ObservacionesSection from './sections/ObservacionesSection';
import VideoSection, { type VideoPDF } from './sections/VideoSection';
import FirmasSection, { type FirmasPDF } from './sections/FirmasSection';
import { toast } from 'sonner';
import { saveInspection, updateInspection, getInspections, submitForReview, EDITABLE_STATUSES, type Inspection } from '@/lib/store';
import { enqueue } from '@/lib/syncQueue';
import { saveDraft, getDraft, deleteDraft } from '@/lib/offlineDB';
import { generateInspectionPDFWithProgress, openPDFInPrintWindow, type InspectionPDFData, type PDFGenerationProgress } from '@/lib/inspectionPdfGenerator';
import { useAuth } from '@/contexts/AuthContext';
import PdfGenerationModal from './PdfGenerationModal';
import SyncStatusBadge from '@/components/ui/SyncStatusBadge';

interface InspectionFormModalProps {
  inspectionId: string | null;
  onClose: () => void;
}

const sections = [
  { id: 'datos', label: 'Datos Generales', icon: 'IdentificationIcon' },
  { id: 'accesorios', label: 'Accesorios', icon: 'StarIcon' },
  { id: 'documentos', label: 'Documentos', icon: 'DocumentTextIcon' },
  { id: 'piezas', label: 'Piezas', icon: 'CogIcon' },
  { id: 'componentes', label: 'Componentes', icon: 'CircleStackIcon' },
  { id: 'mecanica', label: 'Mecánica/Exterior', icon: 'WrenchIcon' },
  { id: 'combustible', label: 'Combustible', icon: 'FireIcon' },
  { id: 'scanner', label: 'Scanner', icon: 'QrCodeIcon' },
  { id: 'latoneria', label: 'Latonería', icon: 'PaintBrushIcon' },
  { id: 'vidrios', label: 'Vidrios', icon: 'WindowIcon' },
  { id: 'observaciones', label: 'Observaciones', icon: 'ChatBubbleLeftIcon' },
  { id: 'video', label: 'Video', icon: 'VideoCameraIcon' },
  { id: 'firmas', label: 'Firmas', icon: 'PencilIcon' },
] as const;

type SectionId = typeof sections[number]['id'];

// ─── Mandatory photo validation ───────────────────────────────────────────────

function getMissingPhotoItems(
    accesorios: AccesorioItemPDF[],
    piezas: ItemConEstadoPDF[],
    componentes: ItemConEstadoPDF[],
    mecanica: ItemMecanicaPDF[],
    latoneria: ZonaVehiculoPDF[],
    vidrios: VidrioItemPDF[]
): string[] {
  const missing: string[] = [];
  const checkItems = (items: { nombre: string; estado: string | null; fotos: string[] }[]) => {
    items.forEach((item) => {
      if (item.estado === 'malo' && item.fotos.length === 0) missing.push(item.nombre);
    });
  };
  checkItems(accesorios);
  checkItems(piezas);
  checkItems(componentes);
  checkItems(mecanica);
  latoneria.forEach((z) => {
    if ((z.tipo === 'golpe-fuerte' || z.tipo === 'golpe-leve') && z.fotos.length === 0) missing.push(z.nombre);
  });
  vidrios.forEach((v) => {
    if ((v.estado === 'roto' || v.estado === 'deslaminado') && v.fotos.length === 0) missing.push(v.nombre);
  });
  return missing;
}

// ─── Default initial data ─────────────────────────────────────────────────────

const defaultAccesorios: AccesorioItemPDF[] = [
  { id: 'acc-001', nombre: 'Radio / Estéreo', estado: null, fotos: [] },
  { id: 'acc-002', nombre: 'Aire Acondicionado', estado: null, fotos: [] },
  { id: 'acc-003', nombre: 'Calefacción', estado: null, fotos: [] },
  { id: 'acc-004', nombre: 'Elevavidrios Eléctrico', estado: null, fotos: [] },
  { id: 'acc-005', nombre: 'Retrovisores Eléctricos', estado: null, fotos: [] },
  { id: 'acc-006', nombre: 'Tapetes / Alfombras', estado: null, fotos: [] },
  { id: 'acc-007', nombre: 'Cinturones de Seguridad', estado: null, fotos: [] },
  { id: 'acc-008', nombre: 'Airbags', estado: null, fotos: [] },
  { id: 'acc-009', nombre: 'GPS / Navegador', estado: null, fotos: [] },
  { id: 'acc-010', nombre: 'Cámara de Reversa', estado: null, fotos: [] },
  { id: 'acc-011', nombre: 'Sensores de Parqueo', estado: null, fotos: [] },
  { id: 'acc-012', nombre: 'Llanta de Repuesto', estado: null, fotos: [] },
  { id: 'acc-013', nombre: 'Gato Hidráulico', estado: null, fotos: [] },
  { id: 'acc-014', nombre: 'Triángulos de Emergencia', estado: null, fotos: [] },
  { id: 'acc-015', nombre: 'Extintor', estado: null, fotos: [] },
  { id: 'acc-016', nombre: 'Botiquín', estado: null, fotos: [] },
];

const defaultDocumentos: DocItemPDF[] = [
  { id: 'doc-001', nombre: 'Tarjeta de Propiedad', tiene: null },
  { id: 'doc-002', nombre: 'Seguro Obligatorio (SOAT)', tiene: null },
  { id: 'doc-003', nombre: 'Revisión Tecnomecánica', tiene: null },
  { id: 'doc-004', nombre: 'Manuales del Vehículo', tiene: null },
  { id: 'doc-005', nombre: 'Otros Documentos', tiene: null },
];

const defaultPiezas: ItemConEstadoPDF[] = [
  { id: 'pieza-001', nombre: 'Capó / Cofre', estado: null, fotos: [] },
  { id: 'pieza-002', nombre: 'Guardabarro Delantero Izquierdo', estado: null, fotos: [] },
  { id: 'pieza-003', nombre: 'Guardabarro Delantero Derecho', estado: null, fotos: [] },
  { id: 'pieza-004', nombre: 'Puerta Delantera Izquierda', estado: null, fotos: [] },
  { id: 'pieza-005', nombre: 'Puerta Delantera Derecha', estado: null, fotos: [] },
  { id: 'pieza-006', nombre: 'Puerta Trasera Izquierda', estado: null, fotos: [] },
  { id: 'pieza-007', nombre: 'Puerta Trasera Derecha', estado: null, fotos: [] },
  { id: 'pieza-008', nombre: 'Techo / Techo Solar', estado: null, fotos: [] },
  { id: 'pieza-009', nombre: 'Maletero / Cajuela', estado: null, fotos: [] },
  { id: 'pieza-010', nombre: 'Parachoques Delantero', estado: null, fotos: [] },
  { id: 'pieza-011', nombre: 'Parachoques Trasero', estado: null, fotos: [] },
  { id: 'pieza-012', nombre: 'Estribo Izquierdo', estado: null, fotos: [] },
  { id: 'pieza-013', nombre: 'Estribo Derecho', estado: null, fotos: [] },
];

const defaultComponentes: ItemConEstadoPDF[] = [
  { id: 'comp-001', nombre: 'Motor', estado: null, fotos: [] },
  { id: 'comp-002', nombre: 'Caja de Cambios', estado: null, fotos: [] },
  { id: 'comp-003', nombre: 'Sistema de Frenos', estado: null, fotos: [] },
  { id: 'comp-004', nombre: 'Dirección', estado: null, fotos: [] },
  { id: 'comp-005', nombre: 'Suspensión Delantera', estado: null, fotos: [] },
  { id: 'comp-006', nombre: 'Suspensión Trasera', estado: null, fotos: [] },
  { id: 'comp-007', nombre: 'Sistema Eléctrico', estado: null, fotos: [] },
  { id: 'comp-008', nombre: 'Batería', estado: null, fotos: [] },
  { id: 'comp-009', nombre: 'Alternador', estado: null, fotos: [] },
  { id: 'comp-010', nombre: 'Radiador', estado: null, fotos: [] },
  { id: 'comp-011', nombre: 'Escape / Silenciador', estado: null, fotos: [] },
  { id: 'comp-012', nombre: 'Transmisión', estado: null, fotos: [] },
];

const defaultMecanica: ItemMecanicaPDF[] = [
  { id: 'mec-001', nombre: 'Luces Delanteras', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-002', nombre: 'Luces Traseras', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-003', nombre: 'Luces de Freno', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-004', nombre: 'Luces Intermitentes', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-005', nombre: 'Llantas Delanteras', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-006', nombre: 'Llantas Traseras', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-007', nombre: 'Rines / Aros', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-008', nombre: 'Limpiaparabrisas', categoria: 'Exterior', estado: null, fotos: [] },
  { id: 'mec-009', nombre: 'Espejo Retrovisor Central', categoria: 'Exterior', estado: null, fotos: [] },
  { id: 'mec-010', nombre: 'Antena', categoria: 'Exterior', estado: null, fotos: [] },
];

const defaultZonas: ZonaVehiculoPDF[] = [
  { id: 'zona-capo', nombre: 'Capó', tipo: null, fotos: [] },
  { id: 'zona-techo', nombre: 'Techo', tipo: null, fotos: [] },
  { id: 'zona-maletero', nombre: 'Maletero', tipo: null, fotos: [] },
  { id: 'zona-puerta-di', nombre: 'Puerta Del. Izq.', tipo: null, fotos: [] },
  { id: 'zona-puerta-dd', nombre: 'Puerta Del. Der.', tipo: null, fotos: [] },
  { id: 'zona-puerta-ti', nombre: 'Puerta Tra. Izq.', tipo: null, fotos: [] },
  { id: 'zona-puerta-td', nombre: 'Puerta Tra. Der.', tipo: null, fotos: [] },
  { id: 'zona-para-del', nombre: 'Parachoques Del.', tipo: null, fotos: [] },
  { id: 'zona-para-tra', nombre: 'Parachoques Tra.', tipo: null, fotos: [] },
];

const defaultVidrios: VidrioItemPDF[] = [
  { id: 'vid-001', nombre: 'Parabrisas Delantero', estado: null, fotos: [] },
  { id: 'vid-002', nombre: 'Parabrisas Trasero', estado: null, fotos: [] },
  { id: 'vid-003', nombre: 'Ventana Delantera Izquierda', estado: null, fotos: [] },
  { id: 'vid-004', nombre: 'Ventana Delantera Derecha', estado: null, fotos: [] },
  { id: 'vid-005', nombre: 'Ventana Trasera Izquierda', estado: null, fotos: [] },
  { id: 'vid-006', nombre: 'Ventana Trasera Derecha', estado: null, fotos: [] },
  { id: 'vid-007', nombre: 'Luneta', estado: null, fotos: [] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function InspectionFormModal({ inspectionId, onClose }: InspectionFormModalProps) {
  const { profile, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>('datos');
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set(['datos'] as SectionId[]));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [existingInspection, setExistingInspection] = useState<Inspection | null>(null);
  const [pdfProgress, setPdfProgress] = useState<PDFGenerationProgress | null>(null);
  const [pendingPdfData, setPendingPdfData] = useState<InspectionPDFData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraftRecovery, setHasDraftRecovery] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdRef = useRef<string | null>(inspectionId);

  // ─── Central section state ────────────────────────────────────────────────
  // Use a stable empty string for SSR; populated on client via useEffect
  const [today, setToday] = useState<string>('');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }, []);

  const [datosGenerales, setDatosGenerales] = useState<DatosGeneralesValues>({
    vehicleId: '',
    placa: '', marca: '', modelo: '', color: '', propietario: '',
    vin: '', codigo: '', bodega: '', nivel: '', estado: '', km: '',
    telefono: '', celular: '',
    inspectorName: profile?.full_name || '',
    fecha: today,
  });
  const [accesorios, setAccesorios] = useState<AccesorioItemPDF[]>(defaultAccesorios);
  const [documentos, setDocumentos] = useState<DocItemPDF[]>(defaultDocumentos);
  const [piezas, setPiezas] = useState<ItemConEstadoPDF[]>(defaultPiezas);
  const [componentes, setComponentes] = useState<ItemConEstadoPDF[]>(defaultComponentes);
  const [mecanica, setMecanica] = useState<ItemMecanicaPDF[]>(defaultMecanica);
  const [combustible, setCombustible] = useState(2);
  const [scanner, setScanner] = useState<ScannerPDF>({ imagen: null, status: 'pendiente', notas: '' });
  const [latoneria, setLatoneria] = useState<ZonaVehiculoPDF[]>(defaultZonas);
  const [vidrios, setVidrios] = useState<VidrioItemPDF[]>(defaultVidrios);
  const [observaciones, setObservaciones] = useState('');
  const [video, setVideo] = useState<VideoPDF>({ tieneVideo: null, videoLink: '', videoFile: null });
  const [firmas, setFirmas] = useState<FirmasPDF>({ inspectorName: profile?.full_name || '', clienteName: '', inspectorSignature: null, clienteSignature: null });

  // ─── Derived status flags ──────────────────────────────────────────────────
  // Read-only whenever the record isn't in an editable state, regardless of
  // role — admins act on the record via Aprobar/Rechazar/Finalizar/Archivar/
  // Desbloquear from the list, not by editing content here directly.
  const isReadOnly = existingInspection ? !EDITABLE_STATUSES.includes(existingInspection.status) : false;
  const isFinalized = existingInspection?.status === 'finalizado';
  const isPendingReview = existingInspection?.status === 'pendiente_revision';
  const isCompleted = existingInspection?.status === 'completado';
  const isArchived = existingInspection?.status === 'archivado';

  // ─── Load existing inspection ─────────────────────────────────────────────
  useEffect(() => {
    if (!inspectionId) {
      // Check for draft recovery
      const draftKey = `draft-new-${profile?.id || 'anon'}`;
      getDraft(draftKey).then((draft) => {
        if (draft && draft.data) {
          setHasDraftRecovery(true);
        }
      });
      return;
    }
    const all = getInspections();
    const found = all.find((i) => i.id === inspectionId);
    if (!found) return;
    setExistingInspection(found);

    const d = (found.datos ?? {}) as Record<string, unknown>;
    setDatosGenerales({
      vehicleId: (d.vehicleId as string) || '',
      placa: found.placa || '',
      marca: found.marca || '',
      modelo: found.modelo || '',
      color: found.color || '',
      propietario: found.propietario || '',
      vin: (d.vin as string) || '',
      codigo: (d.codigo as string) || '',
      bodega: (d.bodega as string) || '',
      nivel: (d.nivel as string) || '',
      estado: (d.estado as string) || '',
      km: (d.km as string) || '',
      telefono: (d.telefono as string) || '',
      celular: (d.celular as string) || '',
      inspectorName: (d.inspectorName as string) || found.inspectorName || profile?.full_name || '',
      fecha: found.fecha || today,
    });
    if (d.accesorios) setAccesorios(d.accesorios as AccesorioItemPDF[]);
    if (d.documentos) setDocumentos(d.documentos as DocItemPDF[]);
    if (d.piezas) setPiezas(d.piezas as ItemConEstadoPDF[]);
    if (d.componentes) setComponentes(d.componentes as ItemConEstadoPDF[]);
    if (d.mecanica) setMecanica(d.mecanica as ItemMecanicaPDF[]);
    if (typeof d.combustible === 'number') setCombustible(d.combustible);
    if (d.scanner) setScanner(d.scanner as ScannerPDF);
    if (d.latoneria) setLatoneria(d.latoneria as ZonaVehiculoPDF[]);
    if (d.vidrios) setVidrios(d.vidrios as VidrioItemPDF[]);
    if (d.observaciones) setObservaciones(d.observaciones as string);
    if (d.video) setVideo(d.video as VideoPDF);
    if (d.firmas) setFirmas(d.firmas as FirmasPDF);
    if (d.completedSections) setCompletedSections(new Set(d.completedSections as SectionId[]));
  }, [inspectionId, profile?.full_name, profile?.id, today]);

  // ─── Auto-populate inspector name from profile ────────────────────────────
  useEffect(() => {
    if (profile?.full_name && !inspectionId) {
      setDatosGenerales((prev) => ({ ...prev, inspectorName: profile.full_name }));
      setFirmas((prev) => ({ ...prev, inspectorName: profile.full_name }));
    }
  }, [profile?.full_name, inspectionId]);

  // ─── Build current payload ────────────────────────────────────────────────
  const buildPayload = useCallback(() => {
    return {
      placa: datosGenerales.placa.toUpperCase() || 'S/P',
      marca: datosGenerales.marca || 'N/A',
      modelo: datosGenerales.modelo || 'N/A',
      color: datosGenerales.color || 'N/A',
      propietario: datosGenerales.propietario || 'N/A',
      fecha: datosGenerales.fecha || today,
      // NOTE: intentionally no `status` here. Content saves (autosave, Guardar)
      // must never change the workflow status — only submitForReview /
      // approveInspection / rejectInspection / finalizeInspection /
      // unlockInspection / archiveInspection do that, each with its own rules.
      seccionesCompletadas: completedSections.size,
      totalSecciones: sections.length,
      inspectorId: profile?.id || '',
      inspectorName: datosGenerales.inspectorName || profile?.full_name || '',
      datos: {
        ...datosGenerales,
        accesorios,
        documentos,
        piezas,
        componentes,
        mecanica,
        combustible,
        scanner,
        latoneria,
        vidrios,
        observaciones,
        video,
        firmas,
        completedSections: Array.from(completedSections),
      },
    };
  }, [datosGenerales, accesorios, documentos, piezas, componentes, mecanica, combustible, scanner, latoneria, vidrios, observaciones, video, firmas, completedSections, profile, today]);

  // ─── Autosave: instant to IndexedDB, debounced 1.5s to localStorage ──────
  const triggerAutosave = useCallback(() => {
    if (isReadOnly) return;
    const payload = buildPayload();

    // Instant save to IndexedDB (crash-safe)
    const draftKey = currentIdRef.current || `draft-new-${profile?.id || 'anon'}`;
    saveDraft({
      id: draftKey,
      localId: draftKey,
      data: payload,
      savedAt: Date.now(),
      placa: payload.placa,
      inspectorId: profile?.id,
    }).then(() => setLastSaved(new Date())).catch((err: unknown) => {
      console.warn('Autosave draft failed:', err instanceof Error ? err.message : err);
    });

    // Debounced save to localStorage + sync queue
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!payload.placa || payload.placa === 'S/P') return;

      if (currentIdRef.current) {
        const updated = updateInspection(currentIdRef.current, payload);
        if (updated) enqueue('inspection', 'update', { ...updated }, updated.id);
      } else {
        const saved = saveInspection({ ...payload, status: 'activo' });
        currentIdRef.current = saved.id;
        enqueue('inspection', 'create', { ...saved }, saved.id);
        // Clean up new-draft after first save
        deleteDraft(`draft-new-${profile?.id || 'anon'}`).catch((err: unknown) => {
          console.warn('No se pudo eliminar borrador:', err instanceof Error ? err.message : err);
        });
      }
    }, 1500);
  }, [buildPayload, isReadOnly, profile?.id]);

  // Trigger autosave when any section data changes
  useEffect(() => {
    triggerAutosave();
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [datosGenerales, accesorios, documentos, piezas, componentes, mecanica, combustible, scanner, latoneria, vidrios, observaciones, video, firmas, triggerAutosave]);

  const currentIndex = sections.findIndex((s) => s.id === activeSection);

  const markComplete = (id: SectionId) => setCompletedSections((prev) => new Set([...prev, id]));
  const goNext = () => { markComplete(activeSection); if (currentIndex < sections.length - 1) setActiveSection(sections[currentIndex + 1].id); };
  const goPrev = () => { if (currentIndex > 0) setActiveSection(sections[currentIndex - 1].id); };

  const handleSave = async () => {
    if (!datosGenerales.placa.trim()) {
      toast.error('Ingrese la placa del vehículo en Datos Generales antes de guardar');
      setActiveSection('datos');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      let targetId = currentIdRef.current;
      if (targetId) {
        const updated = updateInspection(targetId, payload);
        if (updated) enqueue('inspection', 'update', { ...updated }, updated.id);
        toast.success('Inspección guardada');
      } else {
        const saved = saveInspection({ ...payload, status: 'activo' });
        currentIdRef.current = saved.id;
        enqueue('inspection', 'create', { ...saved }, saved.id);
        await deleteDraft(`draft-new-${profile?.id || 'anon'}`).catch((err: unknown) => {
          console.warn('No se pudo eliminar borrador:', err instanceof Error ? err.message : err);
        });
        if (!navigator.onLine) {
          toast.info('Sin conexión. La inspección se sincronizará cuando vuelva la red.');
        } else {
          toast.success('Inspección guardada correctamente');
        }
      }
      onClose();
    } catch {
      toast.error('Error al guardar la inspección. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  // Inspector: sends the inspection to the admin for review. From here it's
  // read-only until an admin approves it (→ completado) or rejects it
  // (→ rechazado, back to the inspector). Approve/Reject/Finalizar/Archivar
  // are admin-only actions and live in the inspections list, not here.
  const handleSubmitForReview = async () => {
    if (!datosGenerales.vehicleId) {
      toast.error('Seleccione un vehículo de Producción en Datos Generales antes de enviar a revisión');
      setActiveSection('datos');
      return;
    }
    if (!datosGenerales.placa.trim()) {
      toast.error('Ingrese la placa del vehículo en Datos Generales antes de enviar a revisión');
      setActiveSection('datos');
      return;
    }
    const missingPhotos = getMissingPhotoItems(accesorios, piezas, componentes, mecanica, latoneria, vidrios);
    if (missingPhotos.length > 0) {
      toast.error(`Faltan fotos obligatorias en: ${missingPhotos.slice(0, 3).join(', ')}${missingPhotos.length > 3 ? ` y ${missingPhotos.length - 3} más` : ''}`, { duration: 6000 });
      setActiveSection('latoneria');
      return;
    }
    if (!confirm('¿Enviar esta inspección a revisión? Ya no podrá editarla hasta que un administrador la apruebe o la rechace.')) return;

    setSubmitting(true);
    try {
      const payload = buildPayload();
      let targetId = currentIdRef.current;
      if (targetId) {
        const updated = updateInspection(targetId, payload);
        if (updated) enqueue('inspection', 'update', { ...updated }, updated.id);
      } else {
        const saved = saveInspection({ ...payload, status: 'activo' });
        targetId = saved.id;
        currentIdRef.current = saved.id;
        enqueue('inspection', 'create', { ...saved }, saved.id);
        await deleteDraft(`draft-new-${profile?.id || 'anon'}`).catch((err: unknown) => {
          console.warn('No se pudo eliminar borrador:', err instanceof Error ? err.message : err);
        });
      }
      const submitted = submitForReview(targetId!, profile?.id || '', datosGenerales.inspectorName || profile?.full_name || '');
      if (submitted) {
        enqueue('inspection', 'update', { ...submitted }, submitted.id);
        toast.success('Inspección enviada a revisión');
      } else {
        toast.error('No se pudo enviar a revisión — el estado actual no lo permite');
      }
      onClose();
    } catch {
      toast.error('Error al enviar la inspección a revisión.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePDF = (overrideInsp?: Inspection) => {
    const insp = overrideInsp ?? existingInspection;
    const now = new Date();
    const pdfData: InspectionPDFData = {
      id: (insp?.enterpriseId) || currentIdRef.current || inspectionId || `insp-${Date.now()}`,
      fecha: datosGenerales.fecha || today,
      hora: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      inspectorName: datosGenerales.inspectorName || firmas.inspectorName || profile?.full_name || '',
      inspectorId: profile?.id || '',
      codigoVehiculo: datosGenerales.codigo || '',
      placa: datosGenerales.placa.toUpperCase(),
      marca: datosGenerales.marca,
      modelo: datosGenerales.modelo,
      color: datosGenerales.color,
      vin: datosGenerales.vin,
      propietario: datosGenerales.propietario,
      telefono: datosGenerales.telefono,
      celular: datosGenerales.celular,
      km: datosGenerales.km,
      bodega: datosGenerales.bodega,
      nivel: datosGenerales.nivel,
      estado: datosGenerales.estado,
      accesorios, documentos, piezas, componentes, mecanica,
      combustible, scanner, latoneria, vidrios, observaciones, video, firmas,
      creationTimestamp: insp?.creationTimestamp || now.toISOString(),
      finalizationTimestamp: insp?.finalizationTimestamp,
      isLocked: insp?.isLocked,
      unlockedAt: insp?.unlockedAt ? new Date(insp.unlockedAt).toISOString() : undefined,
      unlockedBy: insp?.unlockedBy,
    };
    if (!datosGenerales.placa.trim()) {
      toast.error('Ingrese la placa del vehículo antes de generar el PDF');
      setActiveSection('datos');
      return;
    }
    setPendingPdfData(pdfData);
    setPdfProgress({ stage: 'preloading', message: 'Iniciando...', percent: 0, totalImages: 0, loadedImages: 0, failedImages: 0 });
    startPdfGeneration(pdfData);
  };

  const startPdfGeneration = async (pdfData: InspectionPDFData) => {
    await generateInspectionPDFWithProgress(pdfData, (prog) => setPdfProgress(prog))
        .then((result) => {
          if (result.success && result.html) {
            const filename = `BT-inspeccion-${pdfData.placa.replace(/[^a-zA-Z0-9]/g, '-')}-${pdfData.fecha.replace(/\//g, '-')}.html`;
            openPDFInPrintWindow(result.html, filename);
            setPdfProgress({ stage: 'done', message: 'PDF generado', percent: 100, totalImages: 0, loadedImages: 0, failedImages: result.failedImages });
          }
        })
        .catch((err: unknown) => {
          console.error('Error generando PDF:', err instanceof Error ? err.message : err);
          toast.error('No se pudo generar el PDF. Intenta de nuevo.');
          setPdfProgress(null);
        });
  };

  const renderSection = () => {
    if (isReadOnly) {
      return (
          <div className="relative">
            <div className="absolute inset-0 z-10 cursor-not-allowed" />
            <div className="opacity-70 pointer-events-none">{renderSectionContent()}</div>
          </div>
      );
    }
    return renderSectionContent();
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'datos': return <DatosGeneralesSection values={datosGenerales} onChange={(field, value) => setDatosGenerales((prev) => ({ ...prev, [field]: value }))} inspectionId={currentIdRef.current} />;
      case 'accesorios': return <AccesoriosSection items={accesorios} onChange={setAccesorios} />;
      case 'documentos': return <DocumentosSection docs={documentos} onChange={setDocumentos} />;
      case 'piezas': return <PiezasSection items={piezas} onChange={setPiezas} />;
      case 'componentes': return <ComponentesSection items={componentes} onChange={setComponentes} />;
      case 'mecanica': return <MecanicaSection items={mecanica} onChange={setMecanica} />;
      case 'combustible': return <CombustibleSection fuelLevel={combustible} onChange={setCombustible} />;
      case 'scanner': return <ScannerSection data={scanner} onChange={setScanner} />;
      case 'latoneria': return <LatoneriaSection zonas={latoneria} onChange={setLatoneria} inspectorId={profile?.id} />;
      case 'vidrios': return <VidriosSection items={vidrios} onChange={setVidrios} />;
      case 'observaciones': return <ObservacionesSection texto={observaciones} onChange={setObservaciones} />;
      case 'video': return <VideoSection data={video} onChange={setVideo} />;
      case 'firmas': return <FirmasSection data={firmas} onChange={setFirmas} />;
      default: return null;
    }
  };

  const currentSection = sections[currentIndex];

  return (
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
        {/* PDF Generation Modal */}
        {pdfProgress && (
            <PdfGenerationModal
                progress={pdfProgress}
                onRetry={() => { if (pendingPdfData) { setPdfProgress({ stage: 'preloading', message: 'Reintentando...', percent: 0, totalImages: 0, loadedImages: 0, failedImages: 0 }); startPdfGeneration(pendingPdfData); } }}
                onClose={() => { setPdfProgress(null); setPendingPdfData(null); }}
            />
        )}

        {/* Draft recovery banner */}
        {hasDraftRecovery && !inspectionId && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2">
              <Icon name="CloudArrowDownIcon" size={16} className="text-blue-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-blue-700 flex-1">Borrador recuperado de sesión anterior</p>
              <button
                  onClick={() => {
                    const draftKey = `draft-new-${profile?.id || 'anon'}`;
                    getDraft(draftKey).then((draft) => {
                      if (draft?.data) {
                        const d = draft.data as Record<string, unknown>;
                        if (d.datos) {
                          const datos = d.datos as Record<string, unknown>;
                          if (datos.accesorios) setAccesorios(datos.accesorios as AccesorioItemPDF[]);
                          if (datos.piezas) setPiezas(datos.piezas as ItemConEstadoPDF[]);
                          if (datos.componentes) setComponentes(datos.componentes as ItemConEstadoPDF[]);
                          if (datos.mecanica) setMecanica(datos.mecanica as ItemMecanicaPDF[]);
                          if (datos.latoneria) setLatoneria(datos.latoneria as ZonaVehiculoPDF[]);
                          if (datos.vidrios) setVidrios(datos.vidrios as VidrioItemPDF[]);
                          if (datos.observaciones) setObservaciones(datos.observaciones as string);
                          if (datos.video) setVideo(datos.video as VideoPDF);
                          if (datos.firmas) setFirmas(datos.firmas as FirmasPDF);
                          if (typeof datos.combustible === 'number') setCombustible(datos.combustible);
                          if (datos.scanner) setScanner(datos.scanner as ScannerPDF);
                          if (datos.documentos) setDocumentos(datos.documentos as DocItemPDF[]);
                          setDatosGenerales((prev) => ({
                            ...prev,
                            placa: (datos.placa as string) || prev.placa,
                            marca: (datos.marca as string) || prev.marca,
                            modelo: (datos.modelo as string) || prev.modelo,
                            color: (datos.color as string) || prev.color,
                            propietario: (datos.propietario as string) || prev.propietario,
                            vin: (datos.vin as string) || prev.vin,
                          }));
                        }
                        toast.success('Borrador restaurado correctamente');
                      }
                      setHasDraftRecovery(false);
                    });
                  }}
                  className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-lg hover:bg-blue-200"
              >
                Restaurar
              </button>
              <button onClick={() => setHasDraftRecovery(false)} className="text-xs text-blue-500 hover:text-blue-700">Ignorar</button>
            </div>
        )}

        {/* Header */}
        <div className="bg-[#1B4F72] text-white px-4 py-3 flex items-center gap-3 shadow-md">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <Icon name="XMarkIcon" size={22} className="text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base truncate">
              {isFinalized ? '🔒 Inspección Finalizada' : inspectionId ? 'Editar Inspección' : 'Nueva Inspección'}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-white/70">{currentSection.label} — {currentIndex + 1}/{sections.length}</p>
              {existingInspection?.enterpriseId && (
                  <span className="text-xs font-mono text-white/60">{existingInspection.enterpriseId}</span>
              )}
            </div>
          </div>
          {/* Autosave indicator */}
          {lastSaved && !isReadOnly && (
              <SyncStatusBadge status="synced" compact className="opacity-80" />
          )}
          <button
              onClick={() => handleGeneratePDF()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors text-white text-xs font-bold"
              title="Generar PDF completo"
          >
            <Icon name="DocumentArrowDownIcon" size={16} className="text-white" />
            PDF
          </button>
          <button
              onClick={() => setShowSectionMenu(!showSectionMenu)}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <Icon name="ListBulletIcon" size={22} className="text-white" />
          </button>
        </div>

        {/* Read-only banner — wording depends on where the record is in the review pipeline */}
        {isFinalized && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
              <Icon name="LockClosedIcon" size={16} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-amber-700 flex-1">
                Inspección finalizada — solo lectura
                {existingInspection?.finalizationTimestamp && (
                    <span className="font-normal ml-1">({new Date(existingInspection.finalizationTimestamp).toLocaleString('es-ES')})</span>
                )}
              </p>
              {isAdmin && <span className="text-xs text-amber-600 font-semibold">Admin puede desbloquear desde la lista</span>}
            </div>
        )}
        {isPendingReview && (
            <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center gap-2">
              <Icon name="ClockIcon" size={16} className="text-orange-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-orange-700 flex-1">
                Enviada a revisión — solo lectura hasta que un administrador la apruebe o la rechace
              </p>
            </div>
        )}
        {isCompleted && (
            <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center gap-2">
              <Icon name="CheckCircleIcon" size={16} className="text-green-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-green-700 flex-1">
                Inspección aprobada y completada — solo lectura, pendiente de que un administrador la finalice
              </p>
            </div>
        )}
        {isArchived && (
            <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 flex items-center gap-2">
              <Icon name="ArchiveBoxIcon" size={16} className="text-purple-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-purple-700 flex-1">Inspección archivada — solo lectura</p>
            </div>
        )}

        {/* Progress bar */}
        <div className="h-1 bg-[#1B4F72]/20">
          <div className="h-1 bg-green-400 transition-all duration-300" style={{ width: `${((currentIndex + 1) / sections.length) * 100}%` }} />
        </div>

        {/* Section menu overlay */}
        {showSectionMenu && (
            <div className="absolute top-16 right-0 left-0 z-50 bg-white shadow-xl border-b border-gray-100 max-h-80 overflow-y-auto">
              {sections.map((s, idx) => (
                  <button
                      key={`section-menu-${s.id}`}
                      onClick={() => { setActiveSection(s.id); setShowSectionMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${activeSection === s.id ? 'bg-primary-50 text-[#1B4F72]' : 'text-gray-700'}`}
                  >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${completedSections.has(s.id) ? 'bg-green-500 text-white' : activeSection === s.id ? 'bg-[#1B4F72] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {completedSections.has(s.id) ? '✓' : idx + 1}
              </span>
                    <span className="text-sm font-semibold">{s.label}</span>
                  </button>
              ))}
            </div>
        )}

        {/* Section tabs scroll */}
        <div className="bg-white border-b border-gray-100 px-4 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {sections.map((s) => (
                <button
                    key={`tab-${s.id}`}
                    onClick={() => setActiveSection(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                        activeSection === s.id ? 'bg-[#1B4F72] text-white' :
                            completedSections.has(s.id) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                  {completedSections.has(s.id) && activeSection !== s.id && <Icon name="CheckIcon" size={12} className="text-green-600" />}
                  {s.label}
                </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 max-w-screen-2xl mx-auto">
            {renderSection()}
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="bg-white border-t border-gray-100 px-4 py-3 flex gap-2">
          <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm disabled:opacity-40 active:scale-95 transition-all"
          >
            <Icon name="ChevronLeftIcon" size={18} className="text-gray-600" />
            Ant.
          </button>
          <div className="flex-1" />
          {!isReadOnly && currentIndex < sections.length - 1 && (
              <button onClick={goNext} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm active:scale-95 transition-all">
                Sig.
                <Icon name="ChevronRightIcon" size={18} className="text-white" />
              </button>
          )}
          {!isReadOnly && currentIndex === sections.length - 1 && (
              <>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-600 text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-60"
                >
                  {saving ? <Icon name="ArrowPathIcon" size={16} className="text-white animate-spin" /> : <Icon name="CloudArrowUpIcon" size={16} className="text-white" />}
                  Guardar
                </button>
                {/* Whoever is editing (inspector, or admin after an Desbloquear
                correction) sends it back to review — approve/reject/finalize/
                archive/unlock remain admin-only actions in the list */}
                <button
                    onClick={handleSubmitForReview}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-60"
                >
                  {submitting ? <Icon name="ArrowPathIcon" size={16} className="text-white animate-spin" /> : <Icon name="PaperAirplaneIcon" size={16} className="text-white" />}
                  Enviar a Revisión
                </button>
              </>
          )}
          {isReadOnly && (
              <button
                  onClick={() => handleGeneratePDF()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm active:scale-95 transition-all"
              >
                <Icon name="DocumentArrowDownIcon" size={16} className="text-white" />
                Descargar PDF
              </button>
          )}
        </div>
      </div>
  );
}