'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectionPDFData {
  id: string;
  fecha: string;
  hora: string;
  inspectorName: string;
  inspectorId?: string;
  codigoVehiculo: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  vin: string;
  propietario: string;
  telefono: string;
  celular: string;
  km: string;
  bodega: string;
  nivel: string;
  estado: string;
  creationTimestamp?: string;
  finalizationTimestamp?: string;
  isLocked?: boolean;
  unlockedAt?: string;
  unlockedBy?: string;
  pdfGenerationCount?: number;
  accesorios: AccesorioItemPDF[];
  documentos: DocItemPDF[];
  piezas: ItemConEstadoPDF[];
  componentes: ItemConEstadoPDF[];
  mecanica: ItemMecanicaPDF[];
  combustible: number;
  scanner: ScannerPDF;
  latoneria: ZonaVehiculoPDF[];
  vidrios: VidrioItemPDF[];
  observaciones: string;
  video: VideoPDF;
  firmas: FirmasPDF;
}

export interface AccesorioItemPDF {
  id: string;
  nombre: string;
  estado: 'bueno' | 'regular' | 'malo' | null;
  fotos: string[];
}

export interface DocItemPDF {
  id: string;
  nombre: string;
  tiene: boolean | null;
  notas?: string;
}

export interface ItemConEstadoPDF {
  id: string;
  nombre: string;
  estado: 'bueno' | 'regular' | 'malo' | null;
  notas?: string;
  fotos: string[];
}

export interface ItemMecanicaPDF extends ItemConEstadoPDF {
  categoria: string;
}

export interface ScannerPDF {
  imagen: string | null;
  status: 'pendiente' | 'aprobado' | 'revision';
  notas: string;
}

export interface ZonaVehiculoPDF {
  id: string;
  nombre: string;
  tipo: 'golpe-fuerte' | 'golpe-leve' | 'rayado' | 'bueno' | 'sin-dano' | 'rayon' | 'golpe' | 'abolladura' | 'pintura' | null;
  notas?: string;
  fotos: string[];
}

export interface VidrioItemPDF {
  id: string;
  nombre: string;
  estado: 'bueno' | 'rayado' | 'roto' | 'deslaminado' | null;
  fotos: string[];
}

export interface VideoPDF {
  tieneVideo: boolean | null;
  videoLink: string;
  videoFile: string | null;
  videoDuration?: number;
}

export interface FirmasPDF {
  inspectorName: string;
  clienteName: string;
  inspectorSignature: string | null;
  clienteSignature: string | null;
}

// ─── PDF Generation Progress ──────────────────────────────────────────────────

export interface PDFGenerationProgress {
  stage: 'idle' | 'preloading' | 'converting' | 'building' | 'rendering' | 'done' | 'error';
  message: string;
  percent: number;
  error?: string;
  totalImages: number;
  loadedImages: number;
  failedImages: number;
}

export type PDFProgressCallback = (progress: PDFGenerationProgress) => void;

// ─── Video Duration Validation ────────────────────────────────────────────────

export const VIDEO_MAX_DURATION_SECONDS = 120; // 2 minutes

export function validateVideoDuration(file: File): Promise<{ valid: boolean; duration: number; error?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const duration = video.duration;
      if (duration > VIDEO_MAX_DURATION_SECONDS) {
        resolve({
          valid: false,
          duration,
          error: `El video tiene ${Math.round(duration)}s. El máximo permitido es ${VIDEO_MAX_DURATION_SECONDS}s (2 minutos).`,
        });
      } else {
        resolve({ valid: true, duration });
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, duration: 0, error: 'No se pudo leer el archivo de video.' });
    };
    video.src = url;
  });
}

// ─── Image Preloading with Retry ─────────────────────────────────────────────

const IMAGE_LOAD_TIMEOUT_MS = 8000;
const IMAGE_MAX_RETRIES = 3;
const IMAGE_RETRY_DELAY_MS = 1000;

async function loadImageWithRetry(src: string, retries = IMAGE_MAX_RETRIES): Promise<string | null> {
  if (!src || src.startsWith('data:')) return src; // already base64 or empty
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        convertImageToBase64(src),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), IMAGE_LOAD_TIMEOUT_MS)
        ),
      ]);
      if (result) return result;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, IMAGE_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  return null; // failed after all retries
}

async function convertImageToBase64(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Cap at 1600px wide to prevent memory issues while preserving quality
        const maxW = 1600;
        const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── Collect all image URLs from inspection data ──────────────────────────────

function collectAllImageUrls(data: InspectionPDFData): string[] {
  const urls: string[] = [];
  const addFotos = (fotos: string[]) => fotos.forEach((f) => { if (f) urls.push(f); });

  data.accesorios.forEach((a) => addFotos(a.fotos));
  data.piezas.forEach((p) => addFotos(p.fotos));
  data.componentes.forEach((c) => addFotos(c.fotos));
  data.mecanica.forEach((m) => addFotos(m.fotos));
  data.latoneria.forEach((z) => addFotos(z.fotos));
  data.vidrios.forEach((v) => addFotos(v.fotos));
  if (data.scanner.imagen) urls.push(data.scanner.imagen);
  if (data.firmas.inspectorSignature) urls.push(data.firmas.inspectorSignature);
  if (data.firmas.clienteSignature) urls.push(data.firmas.clienteSignature);

  // Logo
  urls.push('/assets/images/image-1778535755369.png');

  return [...new Set(urls)]; // deduplicate
}

// ─── Preload all images and return a base64 map ───────────────────────────────

export async function preloadAllImages(
  data: InspectionPDFData,
  onProgress?: PDFProgressCallback
): Promise<{ imageMap: Map<string, string>; failedCount: number }> {
  const urls = collectAllImageUrls(data);
  const imageMap = new Map<string, string>();
  let loaded = 0;
  let failed = 0;

  onProgress?.({
    stage: 'preloading',
    message: `Cargando imágenes (0/${urls.length})...`,
    percent: 5,
    totalImages: urls.length,
    loadedImages: 0,
    failedImages: 0,
  });

  // Process in batches of 5 to avoid memory spikes
  const BATCH_SIZE = 5;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((url) => loadImageWithRetry(url)));
    results.forEach((result, idx) => {
      const url = batch[idx];
      if (result) {
        imageMap.set(url, result);
        loaded++;
      } else {
        failed++;
      }
    });

    const pct = Math.round(5 + ((i + batch.length) / urls.length) * 40);
    onProgress?.({
      stage: 'preloading',
      message: `Cargando imágenes (${loaded + failed}/${urls.length})...`,
      percent: pct,
      totalImages: urls.length,
      loadedImages: loaded,
      failedImages: failed,
    });
  }

  return { imageMap, failedCount: failed };
}

// ─── Resolve image src (use base64 if available) ──────────────────────────────

function resolveImg(src: string | null | undefined, imageMap: Map<string, string>): string {
  if (!src) return '';
  return imageMap.get(src) || src;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function estadoColor(estado: string | null): string {
  if (estado === 'bueno') return '#16a34a';
  if (estado === 'regular') return '#d97706';
  if (estado === 'malo') return '#dc2626';
  return '#9ca3af';
}

function estadoBg(estado: string | null): string {
  if (estado === 'bueno') return '#dcfce7';
  if (estado === 'regular') return '#fef3c7';
  if (estado === 'malo') return '#fee2e2';
  return '#f3f4f6';
}

function estadoLabel(estado: string | null): string {
  if (estado === 'bueno') return 'Bueno';
  if (estado === 'regular') return 'Regular';
  if (estado === 'malo') return 'Malo';
  return 'Sin evaluar';
}

function danoColor(tipo: string | null): string {
  if (tipo === 'golpe-fuerte' || tipo === 'abolladura') return '#ef4444';
  if (tipo === 'golpe-leve' || tipo === 'golpe') return '#f97316';
  if (tipo === 'rayado' || tipo === 'rayon') return '#eab308';
  if (tipo === 'bueno' || tipo === 'sin-dano') return '#22c55e';
  if (tipo === 'pintura') return '#a855f7';
  return '#9ca3af';
}

function danoLabel(tipo: string | null): string {
  if (tipo === 'golpe-fuerte' || tipo === 'abolladura') return 'Abolladura';
  if (tipo === 'golpe-leve' || tipo === 'golpe') return 'Golpe';
  if (tipo === 'rayado' || tipo === 'rayon') return 'Rayón';
  if (tipo === 'bueno' || tipo === 'sin-dano') return 'Sin daño';
  if (tipo === 'pintura') return 'Pintura';
  return 'Sin evaluar';
}

function vidrioLabel(estado: string | null): string {
  if (estado === 'bueno') return 'Bueno';
  if (estado === 'rayado') return 'Rayado';
  if (estado === 'roto') return 'Roto';
  if (estado === 'deslaminado') return 'Deslaminado';
  return 'Sin evaluar';
}

function fuelLabel(level: number): string {
  const labels = ['Vacío (E)', '1/4 (25%)', '1/2 (50%)', '3/4 (75%)', 'Lleno (F)'];
  return labels[level] ?? '1/2 (50%)';
}

function scannerLabel(status: string): string {
  if (status === 'aprobado') return 'Aprobado';
  if (status === 'revision') return 'Requiere Revisión';
  return 'Pendiente';
}

function scannerColor(status: string): string {
  if (status === 'aprobado') return '#16a34a';
  if (status === 'revision') return '#ea580c';
  return '#6b7280';
}

function formatISODate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildItemRows(items: ItemConEstadoPDF[], imageMap: Map<string, string>): string {
  return items.map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;font-weight:600">${item.nombre}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
        <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${estadoBg(item.estado)};color:${estadoColor(item.estado)}">${estadoLabel(item.estado)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${item.notas || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280;text-align:center">
        ${item.fotos.length > 0 ? `<span style="color:#1B4F72;font-weight:700">${item.fotos.length} foto${item.fotos.length > 1 ? 's' : ''}</span>` : '—'}
      </td>
    </tr>
    ${item.fotos.length > 0 ? `
    <tr>
      <td colspan="4" style="padding:6px 12px 10px;border-bottom:1px solid #f3f4f6;background:#fafafa">
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${item.fotos.map((f) => {
            const src = resolveImg(f, imageMap);
            return src ? `<img src="${src}" alt="${item.nombre}" style="width:140px;height:105px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;display:block" />` : '';
          }).join('')}
        </div>
      </td>
    </tr>` : ''}
  `).join('');
}

function buildPhotoGallerySection(
  label: string,
  items: { nombre: string; fotos: string[] }[],
  imageMap: Map<string, string>
): string {
  const withPhotos = items.filter((i) => i.fotos.length > 0);
  if (withPhotos.length === 0) return '';

  let html = `<div style="margin-bottom:20px">
    <p style="font-size:12px;font-weight:800;color:#1B4F72;margin-bottom:10px;padding:6px 10px;background:#f0f4f8;border-left:3px solid #1B4F72;border-radius:0 4px 4px 0">${label}</p>`;

  withPhotos.forEach((item) => {
    html += `<div style="margin-bottom:12px;page-break-inside:avoid">
      <p style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">${item.nombre}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${item.fotos.map((f) => {
          const src = resolveImg(f, imageMap);
          return src ? `<img src="${src}" alt="${item.nombre}" style="width:180px;height:135px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;display:block" />` : '<div style="width:180px;height:135px;background:#f3f4f6;border-radius:8px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af">Imagen no disponible</div>';
        }).join('')}
      </div>
    </div>`;
  });

  html += `</div>`;
  return html;
}

// ─── Page header/footer templates ────────────────────────────────────────────

function buildPageHeaderFooterCSS(data: InspectionPDFData, generatedAt: string): string {
  const logoBase64 = ''; // will be injected at runtime via imageMap
  return `
    @page {
      size: A4;
      margin: 18mm 12mm 22mm 12mm;
      @top-left {
        content: element(page-header-left);
      }
      @top-right {
        content: element(page-header-right);
      }
      @bottom-center {
        content: element(page-footer);
      }
    }
    #page-header {
      position: running(page-header-left);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9px;
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
    }
    #page-footer {
      position: running(page-footer);
      font-size: 9px;
      color: #6b7280;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      padding-top: 4px;
    }
    .page-number::after {
      content: counter(page);
    }
    .page-total::after {
      content: counter(pages);
    }
  `;
}

// ─── Main HTML generator ──────────────────────────────────────────────────────

export function generateInspectionHTML(
  data: InspectionPDFData,
  imageMap: Map<string, string> = new Map()
): string {
  const fuelPct = (data.combustible / 4) * 100;
  const fuelColorVal = data.combustible <= 1 ? '#ef4444' : data.combustible === 2 ? '#facc15' : '#22c55e';
  const generatedAt = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const logoSrc = resolveImg('/assets/images/image-1778535755369.png', imageMap);

  // Build SVG damage zones
  const zoneMap: Record<string, { x: number; y: number; w: number; h: number }> = {
    'zona-capo': { x: 60, y: 12, w: 80, h: 40 },
    'zona-techo': { x: 55, y: 108, w: 90, h: 44 },
    'zona-maletero': { x: 60, y: 208, w: 80, h: 40 },
    'zona-puerta-di': { x: 30, y: 108, w: 26, h: 44 },
    'zona-puerta-dd': { x: 144, y: 108, w: 26, h: 44 },
    'zona-puerta-ti': { x: 30, y: 155, w: 26, h: 44 },
    'zona-puerta-td': { x: 144, y: 155, w: 26, h: 44 },
    'zona-para-del': { x: 55, y: 10, w: 90, h: 16 },
    'zona-para-tra': { x: 55, y: 234, w: 90, h: 16 },
  };

  const damageSvgZones = data.latoneria
    .filter((z) => z.tipo)
    .map((zona) => {
      const pos = zoneMap[zona.id];
      if (!pos) return '';
      const color = danoColor(zona.tipo);
      return `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="4" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1.5"/>`;
    })
    .join('');

  // Photo gallery sections
  const photoSections = [
    { label: 'Accesorios', items: data.accesorios.filter((a) => a.fotos.length > 0) },
    { label: 'Piezas', items: data.piezas.filter((p) => p.fotos.length > 0) },
    { label: 'Componentes', items: data.componentes.filter((c) => c.fotos.length > 0) },
    { label: 'Mecánica / Exterior', items: data.mecanica.filter((m) => m.fotos.length > 0) },
    { label: 'Latonería', items: data.latoneria.filter((z) => z.fotos.length > 0) },
    { label: 'Vidrios', items: data.vidrios.filter((v) => v.fotos.length > 0) },
  ];

  const hasPhotos = photoSections.some((s) => s.items.length > 0) || data.scanner.imagen;
  const totalPhotoCount = photoSections.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.fotos.length, 0), 0)
    + (data.scanner.imagen ? 1 : 0);

  const inspectorSig = resolveImg(data.firmas.inspectorSignature, imageMap);
  const clienteSig = resolveImg(data.firmas.clienteSignature, imageMap);
  const scannerImg = resolveImg(data.scanner.imagen, imageMap);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Inspección Vehicular — ${data.placa} — Ballistic Technology</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;background:#fff;color:#1a1a1a;font-size:13px;line-height:1.5}
    .page-wrap{max-width:860px;margin:0 auto;background:#fff}

    /* ── Cover ── */
    .cover{background:linear-gradient(135deg,#0a1628 0%,#1B4F72 60%,#154360 100%);color:#fff;padding:36px 40px 28px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;page-break-after:always}
    .cover-brand{display:flex;align-items:center;gap:14px;margin-bottom:18px}
    .cover-logo-box{width:64px;height:64px;background:#fff;border-radius:14px;display:flex;align-items:center;justify-content:center;padding:6px;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.3)}
    .cover-logo-box img{width:52px;height:52px;object-fit:contain}
    .cover-company{font-size:20px;font-weight:900;letter-spacing:-0.5px;line-height:1.1}
    .cover-tagline{font-size:11px;opacity:0.7;margin-top:2px;font-weight:500}
    .cover-doc-title{font-size:17px;font-weight:700;opacity:0.95;margin-bottom:4px}
    .cover-doc-sub{font-size:12px;opacity:0.7}
    .cover-meta{text-align:right;font-size:12px;opacity:0.85;flex-shrink:0}
    .cover-meta-row{margin-bottom:8px}
    .cover-meta-label{font-size:10px;opacity:0.65;text-transform:uppercase;letter-spacing:0.5px}
    .cover-meta-value{font-size:13px;font-weight:700;margin-top:1px}

    /* ── Per-page header/footer ── */
    .page-header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#f0f4f8;border-bottom:2px solid #1B4F72;margin-bottom:20px}
    .page-header-brand{display:flex;align-items:center;gap:8px}
    .page-header-logo{width:28px;height:28px;object-fit:contain}
    .page-header-title{font-size:10px;font-weight:800;color:#1B4F72}
    .page-header-sub{font-size:9px;color:#6b7280}
    .page-header-right{text-align:right;font-size:9px;color:#6b7280}
    .page-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#0a1628;margin-top:20px}
    .page-footer-left{font-size:9px;color:#93c5fd;font-weight:700}
    .page-footer-center{font-size:9px;color:#64748b;text-align:center}
    .page-footer-right{font-size:9px;color:#64748b;text-align:right}

    /* ── Body ── */
    .body-content{padding:0 32px}
    .section-break{margin-bottom:24px;page-break-inside:avoid}
    .section-header{display:flex;align-items:center;gap:10px;background:#f0f4f8;border-left:4px solid #1B4F72;padding:10px 16px;border-radius:0 8px 8px 0;margin-bottom:14px}
    .section-header span{font-size:14px;font-weight:800;color:#1B4F72}
    .section-num{width:28px;height:28px;background:#1B4F72;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
    .info-label{background:#f8fafc;padding:9px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #f0f0f0}
    .info-value{background:#fff;padding:9px 14px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #f0f0f0}
    table.checklist{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
    table.checklist th{background:#f0f4f8;padding:9px 12px;font-size:11px;font-weight:700;color:#1B4F72;text-align:left;text-transform:uppercase;letter-spacing:0.5px}
    .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700}
    .fuel-bar{height:16px;background:#e5e7eb;border-radius:8px;overflow:hidden;margin-top:6px}
    .fuel-fill{height:16px;border-radius:8px}
    .sig-box{border:2px dashed #d1d5db;border-radius:10px;padding:12px;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafafa}
    .sig-img{max-width:100%;max-height:100px;object-fit:contain}
    .legal-box{background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:16px 20px;margin-bottom:24px}
    .legal-box-title{font-size:12px;font-weight:900;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;display:flex;align-items:center;gap:6px}
    .legal-row{display:flex;gap:8px;margin-bottom:5px;font-size:11px}
    .legal-label{font-weight:700;color:#6b7280;min-width:180px;flex-shrink:0}
    .legal-value{color:#111827;font-weight:600}
    .photo-page{page-break-before:always}

    @media print{
      html,body{background:#fff}
      .page-wrap{max-width:100%;box-shadow:none}
      .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact;page-break-after:always}
      .page-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page-footer{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .section-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .fuel-fill{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .legal-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .section-break{page-break-inside:avoid}
      img{max-width:100%;page-break-inside:avoid}
      table{page-break-inside:auto}
      tr{page-break-inside:avoid;page-break-after:auto}
    }
    @page{margin:12mm 10mm 16mm 10mm;size:A4}
  </style>
</head>
<body>
<div class="page-wrap">

  <!-- ═══ COVER PAGE ═══ -->
  <div class="cover">
    <div style="flex:1">
      <div class="cover-brand">
        <div class="cover-logo-box">
          ${logoSrc ? `<img src="${logoSrc}" alt="Ballistic Technology" />` : '<div style="font-size:28px">🛡️</div>'}
        </div>
        <div>
          <div class="cover-company">Ballistic Technology</div>
          <div class="cover-tagline">Plataforma de Inspección Vehicular Legal</div>
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:16px">
        <div class="cover-doc-title">Reporte de Inspección Vehicular</div>
        <div class="cover-doc-sub">Documento oficial de evidencia — ${data.placa}</div>
        ${data.isLocked
          ? '<div style="margin-top:10px;background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:800;color:#fbbf24;display:inline-flex;align-items:center;gap:6px">🔒 INSPECCIÓN FINALIZADA — EVIDENCIA LEGAL INMUTABLE</div>'
          : '<div style="margin-top:10px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;color:#86efac;display:inline-flex;align-items:center;gap:6px">📋 BORRADOR — EN PROCESO</div>'}
        ${data.pdfGenerationCount && data.pdfGenerationCount > 1
          ? `<div style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.5)">Regeneración #${data.pdfGenerationCount}</div>`
          : ''}
      </div>
    </div>
    <div class="cover-meta">
      <div class="cover-meta-row">
        <div class="cover-meta-label">Fecha</div>
        <div class="cover-meta-value">${data.fecha}</div>
      </div>
      <div class="cover-meta-row">
        <div class="cover-meta-label">Hora</div>
        <div class="cover-meta-value">${data.hora}</div>
      </div>
      <div class="cover-meta-row">
        <div class="cover-meta-label">Inspector</div>
        <div class="cover-meta-value">${data.inspectorName || 'No especificado'}</div>
      </div>
      <div class="cover-meta-row">
        <div class="cover-meta-label">Código</div>
        <div class="cover-meta-value" style="font-family:monospace">${data.codigoVehiculo || data.id.slice(-8).toUpperCase()}</div>
      </div>
      <div class="cover-meta-row">
        <div class="cover-meta-label">Placa</div>
        <div class="cover-meta-value" style="font-size:18px;color:#93c5fd;letter-spacing:2px">${data.placa}</div>
      </div>
      <div class="cover-meta-row">
        <div class="cover-meta-label">Total Fotos</div>
        <div class="cover-meta-value">${totalPhotoCount} imágenes</div>
      </div>
    </div>
  </div>

  <!-- ═══ REPORT BODY (pages 2+) ═══ -->
  <!-- Each logical page has its own header + footer -->

  <!-- PAGE HEADER (repeated via JS on print) -->
  <div class="page-header" id="main-header">
    <div class="page-header-brand">
      ${logoSrc ? `<img src="${logoSrc}" alt="BT" class="page-header-logo" />` : ''}
      <div>
        <div class="page-header-title">Ballistic Technology — Inspección Vehicular</div>
        <div class="page-header-sub">Placa: ${data.placa} | Inspector: ${data.inspectorName || '—'} | ID: ${data.id.slice(-10).toUpperCase()}</div>
      </div>
    </div>
    <div class="page-header-right">
      Generado: ${generatedAt}<br/>
      ${data.isLocked ? '🔒 Evidencia Finalizada' : '📋 Borrador'}
    </div>
  </div>

  <div class="body-content">

    <!-- ═══ LEGAL EVIDENCE BLOCK ═══ -->
    <div class="section-break">
      <div class="legal-box">
        <div class="legal-box-title">⚖️ Registro de Evidencia Legal — Trazabilidad de Auditoría</div>
        <div class="legal-row">
          <span class="legal-label">ID de Inspección:</span>
          <span class="legal-value" style="font-family:monospace;font-size:10px">${data.id}</span>
        </div>
        <div class="legal-row">
          <span class="legal-label">Inspector Responsable:</span>
          <span class="legal-value">${data.inspectorName || '—'}${data.inspectorId ? ` (ID: ${data.inspectorId.slice(-8).toUpperCase()})` : ''}</span>
        </div>
        <div class="legal-row">
          <span class="legal-label">Fecha/Hora de Creación:</span>
          <span class="legal-value">${formatISODate(data.creationTimestamp)}</span>
        </div>
        <div class="legal-row">
          <span class="legal-label">Fecha/Hora de Finalización:</span>
          <span class="legal-value">${data.finalizationTimestamp ? formatISODate(data.finalizationTimestamp) : '— (No finalizada)'}</span>
        </div>
        <div class="legal-row">
          <span class="legal-label">Estado de Bloqueo:</span>
          <span class="legal-value">${data.isLocked ? '🔒 Bloqueada — Evidencia inmutable' : '🔓 Editable (borrador)'}</span>
        </div>
        ${data.unlockedAt ? `<div class="legal-row"><span class="legal-label">Desbloqueada por Admin:</span><span class="legal-value">${formatISODate(data.unlockedAt)}</span></div>` : ''}
        <div class="legal-row">
          <span class="legal-label">Reporte Generado:</span>
          <span class="legal-value">${generatedAt}</span>
        </div>
        ${data.pdfGenerationCount ? `<div class="legal-row"><span class="legal-label">Número de Generación PDF:</span><span class="legal-value">#${data.pdfGenerationCount}</span></div>` : ''}
        <div class="legal-row">
          <span class="legal-label">Total de Imágenes:</span>
          <span class="legal-value">${totalPhotoCount} imágenes de evidencia</span>
        </div>
        <div class="legal-row">
          <span class="legal-label">Plataforma:</span>
          <span class="legal-value">Ballistic Technology — Sistema de Inspección Vehicular Legal</span>
        </div>
      </div>
    </div>

    <!-- ═══ 1. VEHICLE INFORMATION ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">1</span>
        <span>Información del Vehículo</span>
      </div>
      <div class="info-grid">
        <div class="info-label">Marca</div><div class="info-value">${data.marca || '—'}</div>
        <div class="info-label">Modelo</div><div class="info-value">${data.modelo || '—'}</div>
        <div class="info-label">Color</div><div class="info-value">${data.color || '—'}</div>
        <div class="info-label">Placa</div><div class="info-value" style="font-weight:900;color:#1B4F72;font-size:16px;letter-spacing:2px">${data.placa || '—'}</div>
        <div class="info-label">VIN / Chasis</div><div class="info-value" style="font-family:monospace;font-size:12px">${data.vin || '—'}</div>
        <div class="info-label">Estado</div><div class="info-value">${data.estado || '—'}</div>
        <div class="info-label">Propietario</div><div class="info-value">${data.propietario || '—'}</div>
        <div class="info-label">Teléfono</div><div class="info-value">${data.telefono || '—'}</div>
        <div class="info-label">Celular</div><div class="info-value">${data.celular || '—'}</div>
        <div class="info-label">Kilometraje</div><div class="info-value">${data.km ? data.km + ' km' : '—'}</div>
        <div class="info-label">Bodega</div><div class="info-value">${data.bodega || '—'}</div>
        <div class="info-label">Nivel</div><div class="info-value">${data.nivel || '—'}</div>
      </div>
    </div>

    <!-- ═══ 2. ACCESORIOS ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">2</span>
        <span>Accesorios</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:50%">Accesorio</th>
          <th style="width:25%">Estado</th>
          <th style="width:25%">Fotos</th>
        </tr></thead>
        <tbody>
          ${data.accesorios.map((item) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#374151">${item.nombre}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
              <span class="badge" style="background:${estadoBg(item.estado)};color:${estadoColor(item.estado)}">${estadoLabel(item.estado)}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280;text-align:center">
              ${item.fotos.length > 0 ? `<span style="color:#1B4F72;font-weight:700">${item.fotos.length} foto${item.fotos.length > 1 ? 's' : ''}</span>` : '—'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- ═══ 3. DOCUMENTOS ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">3</span>
        <span>Documentos</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:60%">Documento</th>
          <th style="width:20%">Estado</th>
          <th style="width:20%">Notas</th>
        </tr></thead>
        <tbody>
          ${data.documentos.map((doc) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#374151">${doc.nombre}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
              ${doc.tiene === true ? '<span class="badge" style="background:#dcfce7;color:#16a34a">SÍ</span>' : doc.tiene === false ? '<span class="badge" style="background:#fee2e2;color:#dc2626">NO</span>' : '<span class="badge" style="background:#f3f4f6;color:#6b7280">Sin revisar</span>'}
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${doc.notas || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- ═══ 4. PIEZAS ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">4</span>
        <span>Piezas del Vehículo</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:40%">Pieza</th>
          <th style="width:20%">Condición</th>
          <th style="width:25%">Notas</th>
          <th style="width:15%">Fotos</th>
        </tr></thead>
        <tbody>${buildItemRows(data.piezas, imageMap)}</tbody>
      </table>
    </div>

    <!-- ═══ 5. COMPONENTES ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">5</span>
        <span>Componentes del Vehículo</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:40%">Componente</th>
          <th style="width:20%">Condición</th>
          <th style="width:25%">Notas</th>
          <th style="width:15%">Fotos</th>
        </tr></thead>
        <tbody>${buildItemRows(data.componentes, imageMap)}</tbody>
      </table>
    </div>

    <!-- ═══ 6. MECÁNICA / EXTERIOR ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">6</span>
        <span>Sistema Mecánico / Exterior</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:30%">Ítem</th>
          <th style="width:20%">Categoría</th>
          <th style="width:20%">Condición</th>
          <th style="width:20%">Notas</th>
          <th style="width:10%">Fotos</th>
        </tr></thead>
        <tbody>
          ${data.mecanica.map((item) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#374151">${item.nombre}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${item.categoria}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
              <span class="badge" style="background:${estadoBg(item.estado)};color:${estadoColor(item.estado)}">${estadoLabel(item.estado)}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${item.notas || '—'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center">
              ${item.fotos.length > 0 ? `<span style="color:#1B4F72;font-weight:700">${item.fotos.length}</span>` : '—'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- ═══ 7. COMBUSTIBLE ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">7</span>
        <span>Nivel de Combustible</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="font-size:32px;font-weight:900;color:#1B4F72">${['E','1/4','1/2','3/4','F'][data.combustible]}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">${fuelLabel(data.combustible)}</div>
            <div class="fuel-bar">
              <div class="fuel-fill" style="width:${fuelPct}%;background:${fuelColorVal}"></div>
            </div>
          </div>
          <div style="font-size:24px">⛽</div>
        </div>
        ${data.combustible <= 1 ? '<div style="margin-top:10px;background:#fee2e2;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;color:#dc2626">⚠️ Nivel crítico — requiere recarga inmediata</div>' : ''}
      </div>
    </div>

    <!-- ═══ 8. SCANNER ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">8</span>
        <span>Revisión de Scanner OBD</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;display:flex;gap:20px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="margin-bottom:10px">
            <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">Estado del Scanner</span>
            <div style="margin-top:6px">
              <span class="badge" style="background:${data.scanner.status === 'aprobado' ? '#dcfce7' : data.scanner.status === 'revision' ? '#ffedd5' : '#f3f4f6'};color:${scannerColor(data.scanner.status)};font-size:13px;padding:4px 14px">${scannerLabel(data.scanner.status)}</span>
            </div>
          </div>
          ${data.scanner.notas ? `<div><span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">Notas</span><p style="margin-top:4px;font-size:12px;color:#374151;line-height:1.6">${data.scanner.notas}</p></div>` : ''}
        </div>
        ${scannerImg
          ? `<div><span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;display:block;margin-bottom:6px">Imagen del Scanner</span><img src="${scannerImg}" alt="Scanner OBD" style="max-width:240px;max-height:160px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;display:block" /></div>`
          : '<div style="color:#9ca3af;font-size:12px;font-style:italic;align-self:center">Sin imagen adjunta</div>'}
      </div>
    </div>

    <!-- ═══ 9. LATONERÍA ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">9</span>
        <span>Latonería y Pintura — Diagrama de Daños</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:14px;text-align:center">
        <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:12px">Mapa Visual de Daños</p>
        <svg viewBox="0 0 200 260" width="200" height="260" style="display:inline-block">
          <rect x="30" y="10" width="140" height="240" rx="16" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5"/>
          <rect x="50" y="55" width="100" height="50" rx="6" fill="#bfdbfe" stroke="#93c5fd" stroke-width="1"/>
          <rect x="50" y="155" width="100" height="50" rx="6" fill="#bfdbfe" stroke="#93c5fd" stroke-width="1"/>
          <circle cx="42" cy="55" r="14" fill="#374151"/><circle cx="42" cy="55" r="8" fill="#6b7280"/>
          <circle cx="158" cy="55" r="14" fill="#374151"/><circle cx="158" cy="55" r="8" fill="#6b7280"/>
          <circle cx="42" cy="205" r="14" fill="#374151"/><circle cx="42" cy="205" r="8" fill="#6b7280"/>
          <circle cx="158" cy="205" r="14" fill="#374151"/><circle cx="158" cy="205" r="8" fill="#6b7280"/>
          ${damageSvgZones}
        </svg>
        <div style="display:flex;justify-content:center;gap:16px;margin-top:10px;flex-wrap:wrap">
          ${[['#22c55e','Sin daño'],['#eab308','Rayón'],['#f97316','Golpe'],['#ef4444','Abolladura'],['#a855f7','Pintura']].map(([color,label]) => `
          <div style="display:flex;align-items:center;gap:5px">
            <div style="width:12px;height:12px;border-radius:50%;background:${color}"></div>
            <span style="font-size:10px;font-weight:600;color:#374151">${label}</span>
          </div>`).join('')}
        </div>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:35%">Zona</th>
          <th style="width:25%">Daño</th>
          <th style="width:25%">Notas</th>
          <th style="width:15%">Fotos</th>
        </tr></thead>
        <tbody>
          ${data.latoneria.map((zona) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#374151">${zona.nombre}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
              <span class="badge" style="background:${zona.tipo ? danoColor(zona.tipo) + '22' : '#f3f4f6'};color:${danoColor(zona.tipo)}">${danoLabel(zona.tipo)}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280">${zona.notas || '—'}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center">
              ${zona.fotos.length > 0 ? `<span style="color:#1B4F72;font-weight:700">${zona.fotos.length}</span>` : '—'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- ═══ 10. VIDRIOS ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">10</span>
        <span>Vidrios</span>
      </div>
      <table class="checklist">
        <thead><tr>
          <th style="width:50%">Vidrio</th>
          <th style="width:30%">Condición</th>
          <th style="width:20%">Fotos</th>
        </tr></thead>
        <tbody>
          ${data.vidrios.map((item) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#374151">${item.nombre}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
              <span class="badge" style="background:${item.estado === 'bueno' ? '#dcfce7' : item.estado === 'rayado' ? '#fef3c7' : item.estado === 'roto' ? '#fee2e2' : item.estado === 'deslaminado' ? '#ffedd5' : '#f3f4f6'};color:${item.estado === 'bueno' ? '#16a34a' : item.estado === 'rayado' ? '#d97706' : item.estado === 'roto' ? '#dc2626' : item.estado === 'deslaminado' ? '#ea580c' : '#6b7280'}">${vidrioLabel(item.estado)}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;text-align:center">
              ${item.fotos.length > 0 ? `<span style="color:#1B4F72;font-weight:700">${item.fotos.length}</span>` : '—'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- ═══ 11. OBSERVACIONES ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">11</span>
        <span>Observaciones Generales</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;min-height:80px;background:#fafafa">
        ${data.observaciones
          ? `<p style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${data.observaciones}</p>`
          : '<p style="font-size:12px;color:#9ca3af;font-style:italic">Sin observaciones registradas</p>'}
      </div>
    </div>

    <!-- ═══ 12. VIDEO ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">12</span>
        <span>Video del Vehículo</span>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px">
        ${data.video.tieneVideo === null
          ? '<p style="font-size:12px;color:#9ca3af;font-style:italic">Sin respuesta registrada</p>'
          : data.video.tieneVideo === false
          ? '<span class="badge" style="background:#f3f4f6;color:#6b7280">No incluye video</span>'
          : `<div>
              <span class="badge" style="background:#dcfce7;color:#16a34a;margin-bottom:10px;display:inline-block">✅ Incluye video</span>
              ${data.video.videoDuration ? `<div style="margin-top:6px;font-size:11px;color:#6b7280">Duración: ${Math.round(data.video.videoDuration)}s (${Math.floor(data.video.videoDuration / 60)}m ${Math.round(data.video.videoDuration % 60)}s)</div>` : ''}
              ${data.video.videoLink
                ? `<div style="margin-top:8px;padding:10px;background:#f0f4f8;border-radius:8px;border:1px solid #e5e7eb">
                    <span style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;display:block;margin-bottom:4px">🔗 Enlace Seguro del Video:</span>
                    <a href="${data.video.videoLink}" style="color:#1B4F72;font-size:12px;font-weight:600;word-break:break-all">${data.video.videoLink}</a>
                    <div style="margin-top:4px;font-size:10px;color:#9ca3af">Acceder al video de evidencia mediante el enlace anterior</div>
                  </div>`
                : ''}
              ${data.video.videoFile ? '<div style="margin-top:8px;font-size:12px;color:#374151;padding:8px;background:#f0f4f8;border-radius:6px">📹 Archivo de video adjunto en el sistema de inspección</div>' : ''}
            </div>`}
      </div>
    </div>

    <!-- ═══ 13. FIRMAS ═══ -->
    <div class="section-break">
      <div class="section-header">
        <span class="section-num">13</span>
        <span>Firmas y Aprobación</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Inspector: ${data.firmas.inspectorName || data.inspectorName || 'No especificado'}</p>
          <div class="sig-box">
            ${inspectorSig
              ? `<img src="${inspectorSig}" class="sig-img" alt="Firma del inspector" />`
              : '<p style="font-size:11px;color:#9ca3af;font-style:italic">Sin firma</p>'}
          </div>
          <div style="border-top:1px solid #374151;margin-top:8px;padding-top:4px;text-align:center">
            <p style="font-size:10px;color:#6b7280">Firma del Inspector</p>
          </div>
        </div>
        <div>
          <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Cliente: ${data.firmas.clienteName || 'No especificado'}</p>
          <div class="sig-box">
            ${clienteSig
              ? `<img src="${clienteSig}" class="sig-img" alt="Firma del cliente" />`
              : '<p style="font-size:11px;color:#9ca3af;font-style:italic">Sin firma</p>'}
          </div>
          <div style="border-top:1px solid #374151;margin-top:8px;padding-top:4px;text-align:center">
            <p style="font-size:10px;color:#6b7280">Firma del Cliente</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ PHOTO GALLERY (grouped by section) ═══ -->
    ${hasPhotos ? `
    <div class="photo-page">
      <div class="section-header">
        <span class="section-num">📷</span>
        <span>Galería de Imágenes — Evidencia Fotográfica (${totalPhotoCount} imágenes)</span>
      </div>

      ${scannerImg ? `
      <div style="margin-bottom:20px;page-break-inside:avoid">
        <p style="font-size:12px;font-weight:800;color:#1B4F72;margin-bottom:10px;padding:6px 10px;background:#f0f4f8;border-left:3px solid #1B4F72;border-radius:0 4px 4px 0">Scanner OBD</p>
        <img src="${scannerImg}" alt="Imagen del scanner" style="max-width:320px;border-radius:8px;border:1px solid #e5e7eb;display:block" />
      </div>` : ''}

      ${photoSections.map((sec) => buildPhotoGallerySection(sec.label, sec.items, imageMap)).join('')}
    </div>` : ''}

  </div>

  <!-- ═══ FOOTER ═══ -->
  <div class="page-footer">
    <div class="page-footer-left">
      ${logoSrc ? `<img src="${logoSrc}" alt="BT" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px" />` : ''}
      Ballistic Technology — Sistema de Inspección Vehicular Legal
    </div>
    <div class="page-footer-center">
      Reporte generado: ${generatedAt}<br/>
      <span style="font-size:8px">Documento de evidencia legal — No modificar</span>
    </div>
    <div class="page-footer-right">
      ID: ${data.id.slice(-12).toUpperCase()}<br/>
      Placa: ${data.placa}
    </div>
  </div>

</div>

<script>
  // Auto-print after a short delay to ensure all images are rendered
  window.addEventListener('load', function() {
    // Verify all images loaded
    var imgs = document.querySelectorAll('img');
    var pending = imgs.length;
    if (pending === 0) {
      setTimeout(function() { window.print(); }, 600);
      return;
    }
    var done = 0;
    function checkDone() {
      done++;
      if (done >= pending) {
        setTimeout(function() { window.print(); }, 600);
      }
    }
    imgs.forEach(function(img) {
      if (img.complete) { checkDone(); }
      else {
        img.addEventListener('load', checkDone);
        img.addEventListener('error', checkDone);
      }
    });
    // Fallback: print after 5s regardless
    setTimeout(function() { window.print(); }, 5000);
  });
</script>
</body>
</html>`;
}

// ─── Main PDF generation with progress ───────────────────────────────────────

export async function generateInspectionPDFWithProgress(
  data: InspectionPDFData,
  onProgress: PDFProgressCallback
): Promise<{ success: boolean; html?: string; error?: string; failedImages: number }> {
  try {
    onProgress({ stage: 'preloading', message: 'Iniciando carga de imágenes...', percent: 2, totalImages: 0, loadedImages: 0, failedImages: 0 });

    // Step 1: Preload all images
    const { imageMap, failedCount } = await preloadAllImages(data, onProgress);

    onProgress({ stage: 'building', message: 'Construyendo reporte PDF...', percent: 50, totalImages: imageMap.size, loadedImages: imageMap.size - failedCount, failedImages: failedCount });

    // Step 2: Build HTML
    let html = generateInspectionHTML(data, imageMap);

    onProgress({ stage: 'rendering', message: 'Abriendo ventana de impresión...', percent: 90, totalImages: imageMap.size, loadedImages: imageMap.size - failedCount, failedImages: failedCount });

    return { success: true, html, failedImages: failedCount };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al generar PDF';
    onProgress({ stage: 'error', message: error, percent: 0, error, totalImages: 0, loadedImages: 0, failedImages: 0 });
    return { success: false, error, failedImages: 0 };
  }
}

// ─── Open PDF in print window ─────────────────────────────────────────────────

export function openPDFInPrintWindow(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Fallback: download as file
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ─── Legacy compatibility export ─────────────────────────────────────────────

export function downloadInspectionPDFFull(data: InspectionPDFData): void {
  let html = generateInspectionHTML(data, new Map());
  const filename = `BT-inspeccion-${data.placa.replace(/[^a-zA-Z0-9]/g, '-')}-${data.fecha.replace(/\//g, '-')}.html`;
  openPDFInPrintWindow(html, filename);
}