'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductionOrderPDFItem {
  linea: number;
  pieza_nombre: string;
  codigo: string;
  cantidad: number;
  nivel_nij_nombre: string;
  lleva_marcacion: boolean;
  tipo_marcacion_nombre?: string;
  observaciones?: string;
}

export interface ProductionOrderPDFData {
  id: string;
  numero_orden: string;
  fecha: string;
  status: string;
  cliente_nombre: string;
  pais: string;
  modelo_nombre: string;
  nivel_nij_nombre: string;
  forma_pago_nombre: string;
  incoterm_nombre: string;
  cantidad_vehiculos: number;
  observaciones?: string;
  total_piezas: number;
  items: ProductionOrderPDFItem[];
  created_by_name?: string;
  created_at: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
}

export interface PDFGenerationProgress {
  stage: 'idle' | 'building' | 'rendering' | 'done' | 'error';
  message: string;
  percent: number;
  error?: string;
}

export type PDFProgressCallback = (progress: PDFGenerationProgress) => void;

// ─── Status Label ─────────────────────────────────────────────────────────────

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    borrador: 'Borrador',
    pendiente_aprobacion: 'Pendiente de Aprobación',
    rechazada: 'Rechazada',
    aprobada: 'Aprobada',
    en_produccion: 'En Producción',
    terminada: 'Terminada',
    despachada: 'Despachada',
    cancelada: 'Cancelada',
  };
  return map[status] ?? status;
}

// ─── Logo as base64 ───────────────────────────────────────────────────────────

async function loadLogoBase64(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = '/assets/images/image-1778535755369.png';
  });
}

// ─── HTML PDF Generator ───────────────────────────────────────────────────────

export async function generateProductionOrderPDF(
  data: ProductionOrderPDFData,
  onProgress?: PDFProgressCallback
): Promise<string> {
  onProgress?.({ stage: 'building', message: 'Construyendo PDF...', percent: 20 });

  const logoBase64 = await loadLogoBase64();

  onProgress?.({ stage: 'building', message: 'Generando documento...', percent: 60 });

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" style="height:60px;object-fit:contain;" />`
    : '<div style="font-size:18px;font-weight:bold;color:#1B4F72;">BALLISTIC TECHNOLOGY</div>';

  const itemsRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="text-align:center;">${item.linea}</td>
        <td>${item.pieza_nombre}</td>
        <td style="text-align:center;font-family:monospace;">${item.codigo}</td>
        <td style="text-align:center;">${item.cantidad}</td>
        <td>${item.nivel_nij_nombre}</td>
        <td style="text-align:center;">${item.lleva_marcacion ? 'Sí' : 'No'}</td>
        <td>${item.tipo_marcacion_nombre ?? ''}</td>
        <td>${item.observaciones ?? ''}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Orden de Producción ${data.numero_orden}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; background: #fff; padding: 20px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1B4F72; padding-bottom: 12px; margin-bottom: 16px; }
    .header-title { text-align: right; }
    .header-title h1 { font-size: 18px; color: #1B4F72; font-weight: bold; }
    .header-title p { font-size: 12px; color: #555; }
    .order-number { font-family: monospace; font-size: 16px; font-weight: bold; color: #1B4F72; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; background: #e8f4fd; color: #1B4F72; border: 1px solid #1B4F72; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .info-row { display: flex; gap: 6px; }
    .info-label { font-weight: bold; color: #555; min-width: 140px; }
    .info-value { color: #222; }
    .section-title { font-size: 13px; font-weight: bold; color: #1B4F72; border-bottom: 1px solid #1B4F72; padding-bottom: 4px; margin: 16px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #1B4F72; color: #fff; padding: 6px 4px; text-align: left; }
    td { padding: 5px 4px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .total-row td { font-weight: bold; background: #e8f4fd !important; color: #1B4F72; }
    .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
    .footer-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .footer-box h4 { font-size: 11px; font-weight: bold; color: #555; margin-bottom: 6px; }
    .footer-box p { font-size: 11px; color: #222; }
    .obs-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-bottom: 16px; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>${logoHtml}</div>
    <div class="header-title">
      <h1>ORDEN DE PRODUCCIÓN</h1>
      <p>Ballistic Technology</p>
      <p class="order-number">${data.numero_orden}</p>
      <span class="status-badge">${getStatusLabel(data.status)}</span>
    </div>
  </div>

  <div class="section-title">Datos de la Orden</div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">N° Orden:</span><span class="info-value" style="font-family:monospace;font-weight:bold;">${data.numero_orden}</span></div>
    <div class="info-row"><span class="info-label">Fecha:</span><span class="info-value">${data.fecha}</span></div>
    <div class="info-row"><span class="info-label">Cliente:</span><span class="info-value">${data.cliente_nombre}</span></div>
    <div class="info-row"><span class="info-label">País de Origen:</span><span class="info-value">${data.pais}</span></div>
    <div class="info-row"><span class="info-label">Modelo de Vehículo:</span><span class="info-value">${data.modelo_nombre}</span></div>
    <div class="info-row"><span class="info-label">Nivel NIJ:</span><span class="info-value">${data.nivel_nij_nombre}</span></div>
    <div class="info-row"><span class="info-label">Forma de Pago:</span><span class="info-value">${data.forma_pago_nombre}</span></div>
    <div class="info-row"><span class="info-label">Incoterm:</span><span class="info-value">${data.incoterm_nombre}</span></div>
    <div class="info-row"><span class="info-label">Cantidad de Vehículos:</span><span class="info-value">${data.cantidad_vehiculos}</span></div>
    <div class="info-row"><span class="info-label">Estado:</span><span class="info-value">${getStatusLabel(data.status)}</span></div>
  </div>

  ${data.observaciones ? `<div class="obs-box"><strong>Observaciones:</strong> ${data.observaciones}</div>` : ''}

  <div class="section-title">Piezas de Vidrio</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">N°</th>
        <th>Pieza</th>
        <th style="width:50px;">Código</th>
        <th style="width:50px;">Cant.</th>
        <th>Nivel NIJ</th>
        <th style="width:60px;">Marcación</th>
        <th>Tipo Marcación</th>
        <th>Observaciones</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
      <tr class="total-row">
        <td colspan="3" style="text-align:right;">TOTAL DE PIEZAS:</td>
        <td style="text-align:center;">${data.total_piezas}</td>
        <td colspan="4"></td>
      </tr>
    </tbody>
  </table>

  <div class="footer-grid">
    <div class="footer-box">
      <h4>Creado por</h4>
      <p>${data.created_by_name ?? '—'}</p>
      <p style="color:#888;font-size:10px;">${data.created_at ? new Date(data.created_at).toLocaleDateString('es-ES') : ''}</p>
    </div>
    <div class="footer-box">
      <h4>Aprobado por</h4>
      <p>${data.approved_by_name ?? '—'}</p>
      <p style="color:#888;font-size:10px;">${data.approved_at ? new Date(data.approved_at).toLocaleDateString('es-ES') : ''}</p>
    </div>
  </div>
</body>
</html>`;

  onProgress?.({ stage: 'rendering', message: 'Abriendo ventana de impresión...', percent: 90 });
  return html;
}

export function openProductionOrderPDF(html: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}
