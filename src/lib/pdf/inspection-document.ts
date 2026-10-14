// Server-only inspection PDF renderer.
//
// This module pulls in @react-pdf/renderer (and transitively pdfkit), which is
// loaded from node_modules at runtime rather than bundled — see the
// outputFileTracingIncludes note in next.config.mjs. Import it lazily
// (`await import(...)`) so no other route in the shared serverless function
// initializes pdfkit.

import { createRequire } from 'module';
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

// ─── PDF Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 30,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1B4F72',
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1B4F72' },
  headerSubtitle: { fontSize: 9, color: '#666', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 8, color: '#666' },
  headerId: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1B4F72', marginTop: 2 },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1B4F72',
    backgroundColor: '#EBF5FB',
    padding: '4 8',
    marginBottom: 6,
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 120, fontSize: 8, color: '#666', fontFamily: 'Helvetica-Bold' },
  value: { flex: 1, fontSize: 8, color: '#333' },
  table: { marginBottom: 6 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1B4F72',
    padding: '3 6',
  },
  tableHeaderCell: { fontSize: 8, color: '#fff', fontFamily: 'Helvetica-Bold', flex: 1 },
  tableRow: { flexDirection: 'row', padding: '3 6', borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  tableCell: { fontSize: 8, color: '#333', flex: 1 },
  tableCellWide: { fontSize: 8, color: '#333', flex: 2 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  photo: { width: 80, height: 60, objectFit: 'cover', borderRadius: 2 },
  signatureBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 4,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  signatureImage: { width: 120, height: 50, objectFit: 'contain' },
  signatureName: { fontSize: 8, color: '#333', marginTop: 4, textAlign: 'center' },
  signatureLabel: { fontSize: 7, color: '#999', marginTop: 2 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  badgeGood: { backgroundColor: '#D5F5E3', color: '#1E8449' },
  badgeRegular: { backgroundColor: '#FEF9E7', color: '#B7950B' },
  badgeBad: { backgroundColor: '#FADBD8', color: '#C0392B' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 4,
  },
  footerText: { fontSize: 7, color: '#999' },
});

// ─── Helper Components ────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | null }) {
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value || '—')
  );
}

function SectionTitle({ title }: { title: string }) {
  return React.createElement(Text, { style: styles.sectionTitle }, title);
}

function EstadoBadge({ estado }: { estado: string | null }) {
  const badgeStyle =
    estado === 'bueno' ? styles.badgeGood :
    estado === 'regular' ? styles.badgeRegular :
    estado === 'malo' ? styles.badgeBad : {};
  const label =
    estado === 'bueno' ? 'Bueno' :
    estado === 'regular' ? 'Regular' :
    estado === 'malo' ? 'Malo' : '—';
  return React.createElement(Text, { style: [styles.badge, badgeStyle] }, label);
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function InspectionPDF({ data }: { data: InspectionData }) {
  const d = data.data as Record<string, unknown>;
  const accesorios = (d.accesorios as ItemRow[]) || [];
  const documentos = (d.documentos as DocRow[]) || [];
  const piezas = (d.piezas as ItemRow[]) || [];
  const componentes = (d.componentes as ItemRow[]) || [];
  const mecanica = (d.mecanica as ItemRow[]) || [];
  const latoneria = (d.latoneria as ZonaRow[]) || [];
  const vidrios = (d.vidrios as ItemRow[]) || [];
  const firmas = (d.firmas as FirmasRow) || {};
  const scanner = (d.scanner as ScannerRow) || {};
  const observaciones = (d.observaciones as string) || '';
  const combustible = typeof d.combustible === 'number' ? d.combustible : null;

  const now = new Date().toLocaleString('es-ES');

  return React.createElement(
    Document,
    { title: `Inspección ${data.id}` },
    // ── Page 1: General Data + Accessories + Documents ──
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          { style: styles.headerLeft },
          React.createElement(Text, { style: styles.headerTitle }, 'INSPECCIÓN VEHICULAR'),
          React.createElement(Text, { style: styles.headerSubtitle }, 'Ballistic Technology — GestionVehicular')
        ),
        React.createElement(
          View,
          { style: styles.headerRight },
          React.createElement(Text, { style: styles.headerDate }, `Generado: ${now}`),
          React.createElement(Text, { style: styles.headerId }, data.id)
        )
      ),
      // Datos Generales
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'DATOS GENERALES' }),
        React.createElement(Field, { label: 'Placa', value: d.placa as string }),
        React.createElement(Field, { label: 'Marca', value: d.marca as string }),
        React.createElement(Field, { label: 'Modelo', value: d.modelo as string }),
        React.createElement(Field, { label: 'Color', value: d.color as string }),
        React.createElement(Field, { label: 'VIN', value: d.vin as string }),
        React.createElement(Field, { label: 'Propietario', value: d.propietario as string }),
        React.createElement(Field, { label: 'Teléfono', value: d.telefono as string }),
        React.createElement(Field, { label: 'Celular', value: d.celular as string }),
        React.createElement(Field, { label: 'Km', value: d.km as string }),
        React.createElement(Field, { label: 'Bodega', value: d.bodega as string }),
        React.createElement(Field, { label: 'Inspector', value: d.inspectorName as string }),
        React.createElement(Field, { label: 'Fecha', value: data.created_at ? new Date(data.created_at).toLocaleDateString('es-ES') : (d.fecha as string) })
      ),
      // Documentos
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'DOCUMENTOS' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Documento'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado')
          ),
          ...documentos.map((doc, i) =>
            React.createElement(
              View,
              { key: `doc-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, doc.nombre || ''),
              React.createElement(Text, { style: styles.tableCell }, doc.tiene === true ? '✓ Sí' : doc.tiene === false ? '✗ No' : '—')
            )
          )
        )
      ),
      // Accesorios
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'ACCESORIOS' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Accesorio'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado')
          ),
          ...accesorios.map((acc, i) =>
            React.createElement(
              View,
              { key: `acc-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, acc.nombre || ''),
              React.createElement(EstadoBadge, { key: `acc-badge-${i}`, estado: acc.estado || null })
            )
          )
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'GestionVehicular — Ballistic Technology'),
        React.createElement(Text, { style: styles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
      )
    ),
    // ── Page 2: Piezas + Componentes + Mecánica ──
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'PIEZAS' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Pieza'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Fotos')
          ),
          ...piezas.map((p, i) =>
            React.createElement(
              View,
              { key: `pieza-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, p.nombre || ''),
              React.createElement(EstadoBadge, { key: `pieza-badge-${i}`, estado: p.estado || null }),
              React.createElement(Text, { style: styles.tableCell }, String((p.fotos || []).length))
            )
          )
        )
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'COMPONENTES' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Componente'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado')
          ),
          ...componentes.map((c, i) =>
            React.createElement(
              View,
              { key: `comp-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, c.nombre || ''),
              React.createElement(EstadoBadge, { key: `comp-badge-${i}`, estado: c.estado || null })
            )
          )
        )
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'MECÁNICA / EXTERIOR' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Categoría'),
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Ítem'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado')
          ),
          ...mecanica.map((m, i) =>
            React.createElement(
              View,
              { key: `mec-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: styles.tableCell }, (m as MecRow).categoria || ''),
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, m.nombre || ''),
              React.createElement(EstadoBadge, { key: `mec-badge-${i}`, estado: m.estado || null })
            )
          )
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'GestionVehicular — Ballistic Technology'),
        React.createElement(Text, { style: styles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
      )
    ),
    // ── Page 3: Latonería + Vidrios + Scanner + Combustible + Observaciones ──
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'LATONERÍA' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Zona'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Daño'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Fotos')
          ),
          ...latoneria.map((z, i) =>
            React.createElement(
              View,
              { key: `lat-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, z.nombre || ''),
              React.createElement(Text, { style: styles.tableCell }, z.tipo || '—'),
              React.createElement(Text, { style: styles.tableCell }, String((z.fotos || []).length))
            )
          )
        )
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'VIDRIOS' }),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 2 }] }, 'Vidrio'),
            React.createElement(Text, { style: styles.tableHeaderCell }, 'Estado')
          ),
          ...vidrios.map((v, i) =>
            React.createElement(
              View,
              { key: `vid-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 2 }] }, v.nombre || ''),
              React.createElement(EstadoBadge, { key: `vid-badge-${i}`, estado: v.estado || null })
            )
          )
        )
      ),
      combustible !== null && React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'COMBUSTIBLE' }),
        React.createElement(Field, { label: 'Nivel', value: `${combustible}/8` })
      ),
      scanner && React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'SCANNER' }),
        React.createElement(Field, { label: 'Estado', value: scanner.status || '—' }),
        React.createElement(Field, { label: 'Notas', value: scanner.notas || '—' }),
        scanner.imagen && React.createElement(Image, { src: scanner.imagen, style: { width: 200, height: 120, objectFit: 'contain', marginTop: 4 } })
      ),
      observaciones && React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'OBSERVACIONES' }),
        React.createElement(Text, { style: { fontSize: 8, color: '#333', lineHeight: 1.5 } }, observaciones)
      ),
      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'GestionVehicular — Ballistic Technology'),
        React.createElement(Text, { style: styles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
      )
    ),
    // ── Page 4: Photos + Signatures ──
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Photos from all sections
      ...buildPhotoPages(accesorios, piezas, componentes, mecanica, latoneria, vidrios),
      // Signatures
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(SectionTitle, { title: 'FIRMAS' }),
        React.createElement(
          View,
          { style: { flexDirection: 'row', marginTop: 8 } },
          React.createElement(
            View,
            { style: styles.signatureBox },
            firmas.inspectorSignature
              ? React.createElement(Image, { src: firmas.inspectorSignature, style: styles.signatureImage })
              : React.createElement(View, { style: { width: 120, height: 50, backgroundColor: '#f5f5f5' } }),
            React.createElement(Text, { style: styles.signatureName }, firmas.inspectorName || '—'),
            React.createElement(Text, { style: styles.signatureLabel }, 'Inspector')
          ),
          React.createElement(
            View,
            { style: styles.signatureBox },
            firmas.clienteSignature
              ? React.createElement(Image, { src: firmas.clienteSignature, style: styles.signatureImage })
              : React.createElement(View, { style: { width: 120, height: 50, backgroundColor: '#f5f5f5' } }),
            React.createElement(Text, { style: styles.signatureName }, firmas.clienteName || '—'),
            React.createElement(Text, { style: styles.signatureLabel }, 'Cliente')
          )
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'GestionVehicular — Ballistic Technology'),
        React.createElement(Text, { style: styles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
      )
    )
  );
}

// ─── Build photo sections ─────────────────────────────────────────────────────

function buildPhotoPages(
  accesorios: ItemRow[],
  piezas: ItemRow[],
  componentes: ItemRow[],
  mecanica: ItemRow[],
  latoneria: ZonaRow[],
  vidrios: ItemRow[]
): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  const allWithPhotos = [
    ...accesorios.filter((i) => i.fotos?.length),
    ...piezas.filter((i) => i.fotos?.length),
    ...componentes.filter((i) => i.fotos?.length),
    ...mecanica.filter((i) => i.fotos?.length),
    ...latoneria.filter((i) => i.fotos?.length),
    ...vidrios.filter((i) => i.fotos?.length),
  ];

  if (allWithPhotos.length === 0) return elements;

  elements.push(React.createElement(SectionTitle, { key: 'photos-title', title: 'FOTOGRAFÍAS' }));

  allWithPhotos.forEach((item, idx) => {
    const fotos = item.fotos || [];
    elements.push(
      React.createElement(
        View,
        { key: `photo-group-${idx}`, style: { marginBottom: 8 } },
        React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#444', marginBottom: 4 } }, item.nombre || ''),
        React.createElement(
          View,
          { style: styles.photoGrid },
          ...fotos.map((foto: string, fi: number) =>
            React.createElement(Image, { key: `foto-${idx}-${fi}`, src: foto, style: styles.photo })
          )
        )
      )
    );
  });

  return elements;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemRow { nombre: string; estado: string | null; fotos: string[]; }
export interface MecRow extends ItemRow { categoria: string; }
export interface ZonaRow { nombre: string; tipo: string | null; fotos: string[]; }
export interface DocRow { nombre: string; tiene: boolean | null; }
export interface FirmasRow { inspectorName: string; clienteName: string; inspectorSignature: string | null; clienteSignature: string | null; }
export interface ScannerRow { imagen: string | null; status: string; notas: string; }
export interface InspectionData { id: string; created_at: string; data: unknown; }

// ─── Standard font pre-flight ─────────────────────────────────────────────────

// Every font referenced by `styles` above, keyed by the module name pdfkit uses
// for its bundled AFM metrics (see pdfkit's `#standard-fonts/*` imports map).
const REQUIRED_STANDARD_FONTS = ['Helvetica', 'HelveticaBold'];

// pdfkit resolves standard fonts lazily, while finalizing the document in an
// async continuation that is not part of the promise renderToBuffer awaits. A
// missing font file therefore surfaces as an unhandled rejection that kills the
// whole serverless function instead of failing this request. Resolving the same
// files up front turns that into a synchronous, catchable throw.
//
// createRequire is used so webpack leaves the specifier alone and the lookup
// happens against the real node_modules tree at runtime, exactly like pdfkit's.
function assertStandardFontsAvailable(): void {
  const nodeRequire = createRequire(`${process.cwd()}/`);
  for (const font of REQUIRED_STANDARD_FONTS) {
    nodeRequire.resolve(`pdfkit/standard-fonts/${font}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function renderInspectionPdf(data: InspectionData): Promise<Buffer> {
  assertStandardFontsAvailable();

  return renderToBuffer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.createElement(InspectionPDF, { data }) as any
  );
}
