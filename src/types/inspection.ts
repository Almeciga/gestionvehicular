// ─── Centralized Inspection Types ─────────────────────────────────────────────
// Separates form state, persistence, and PDF concerns

export type InspectionStatus =
  | 'borrador'
  | 'activo' |'completado' |'pendiente_revision' |'aprobado' |'rechazado' |'finalizado' |'archivado';

// What lives in the database / localStorage
export interface InspectionRecord {
  id: string;
  enterpriseId?: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  propietario: string;
  fecha: string;
  status: InspectionStatus;
  seccionesCompletadas: number;
  totalSecciones: number;
  datos: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
  inspectorId?: string;
  inspectorName?: string;
  isLocked?: boolean;
  finalizedAt?: number;
  finalizedBy?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
  lastSyncedAt?: number;
}

// Payload for creating a new inspection (omits auto-generated fields)
export type InspectionInsertPayload = Omit<InspectionRecord, 'id' | 'createdAt'>;

// Payload for updating an existing inspection
export type InspectionUpdatePayload = Partial<Omit<InspectionRecord, 'id' | 'createdAt'>>;

// What the form manages in UI
export interface InspectionFormState {
  currentSection: string;
  isDirty: boolean;
}

// What gets passed to the PDF generator
export interface InspectionPdfPayload {
  inspectionId: string;
  vehicleName: string;
  inspectorName: string;
  signedImageUrls: Record<string, string>;
}
