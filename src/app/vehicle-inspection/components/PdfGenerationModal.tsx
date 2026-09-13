'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { PDFGenerationProgress } from '@/lib/inspectionPdfGenerator';

interface PdfGenerationModalProps {
  progress: PDFGenerationProgress;
  onRetry: () => void;
  onClose: () => void;
}

// Mapeos estáticos de etapa → etiqueta e ícono
const stageLabels: Record<PDFGenerationProgress['stage'], string> = {
  idle: 'Preparando...',
  preloading: 'Cargando imágenes',
  converting: 'Convirtiendo imágenes',
  building: 'Construyendo reporte',
  rendering: 'Abriendo PDF',
  done: 'PDF generado',
  error: 'Error al generar PDF',
};

const stageIcons: Record<PDFGenerationProgress['stage'], string> = {
  idle: 'ClockIcon',
  preloading: 'PhotoIcon',
  converting: 'ArrowPathIcon',
  building: 'DocumentTextIcon',
  rendering: 'PrinterIcon',
  done: 'CheckCircleIcon',
  error: 'ExclamationCircleIcon',
};

// Helper para pluralizar correctamente
function pluralizarImagenes(cantidad: number): { verbo: string; articulo: string } {
  if (cantidad === 1) return { verbo: 'pudo', articulo: 'La imagen fallida aparecerá' };
  return { verbo: 'pudieron', articulo: 'Las imágenes fallidas aparecerán' };
}

export default function PdfGenerationModal({
  progress,
  onRetry,
  onClose,
}: PdfGenerationModalProps) {
  const isDone = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const isActive = !isDone && !isError;
  const { verbo, articulo } = pluralizarImagenes(progress.failedImages);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Estado de generación del PDF"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Encabezado dinámico */}
        <div
          className={`px-6 py-4 flex items-center gap-3 ${
            isError
              ? 'bg-red-50 border-b border-red-100'
              : isDone
                ? 'bg-green-50 border-b border-green-100' :'bg-[#1B4F72]'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              isError ? 'bg-red-100' : isDone ? 'bg-green-100' : 'bg-white/20'
            }`}
          >
            <Icon
              name={stageIcons[progress.stage]}
              size={22}
              className={`${
                isError ? 'text-red-600' : isDone ? 'text-green-600' : 'text-white'
              } ${isActive ? 'animate-pulse' : ''}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="pdf-modal-title"
              className={`font-bold text-base ${
                isError ? 'text-red-800' : isDone ? 'text-green-800' : 'text-white'
              }`}
            >
              {isError
                ? 'Error al generar PDF'
                : isDone
                  ? 'PDF generado exitosamente'
                  : 'Generando PDF...'}
            </h3>
            <p
              className={`text-xs mt-0.5 ${
                isError ? 'text-red-600' : isDone ? 'text-green-600' : 'text-white/70'
              }`}
            >
              {stageLabels[progress.stage]}
            </p>
          </div>
          {/* Botón cerrar solo cuando finaliza o hay error */}
          {(isDone || isError) && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className={`p-1.5 rounded-lg transition-colors ${
                isError ? 'hover:bg-red-100 text-red-500' : 'hover:bg-green-100 text-green-600'
              }`}
            >
              <Icon name="XMarkIcon" size={18} className="text-current" />
            </button>
          )}
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-4">
          {/* Barra de progreso (excepto en error) */}
          {!isError && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-600">{progress.message}</span>
                <span className="text-xs font-bold text-[#1B4F72]">
                  {isDone ? 100 : progress.percent}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    isDone ? 'bg-green-500' : 'bg-[#1B4F72]'
                  }`}
                  style={{ width: `${isDone ? 100 : progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Estadísticas de imágenes (solo si hay imágenes y en etapas relevantes) */}
          {(progress.stage === 'preloading' || progress.stage === 'building' || isDone) &&
            progress.totalImages > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-[#1B4F72]">{progress.totalImages}</p>
                  <p className="text-xs text-gray-500 font-semibold">Total</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-green-600">{progress.loadedImages}</p>
                  <p className="text-xs text-gray-500 font-semibold">Cargadas</p>
                </div>
                <div
                  className={`rounded-xl p-3 text-center ${
                    progress.failedImages > 0 ? 'bg-red-50' : 'bg-gray-50'
                  }`}
                >
                  <p
                    className={`text-lg font-bold ${
                      progress.failedImages > 0 ? 'text-red-600' : 'text-gray-400'
                    }`}
                  >
                    {progress.failedImages}
                  </p>
                  <p className="text-xs text-gray-500 font-semibold">Fallidas</p>
                </div>
              </div>
            )}

          {/* Advertencia de imágenes fallidas (solo si hay fallos y no es error total) */}
          {progress.failedImages > 0 && !isError && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Icon
                name="ExclamationTriangleIcon"
                size={16}
                className="text-amber-600 flex-shrink-0 mt-0.5"
              />
              <p className="text-xs text-amber-700 font-medium">
                {progress.failedImages} imagen{progress.failedImages > 1 ? 'es' : ''} no {verbo}{' '}
                cargarse. {articulo} como marcador{progress.failedImages > 1 ? 'es' : ''} de
                posición.
              </p>
            </div>
          )}

          {/* Estado de error */}
          {isError && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <Icon
                  name="ExclamationCircleIcon"
                  size={16}
                  className="text-red-600 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-xs font-bold text-red-700 mb-1">Detalle del error:</p>
                  <p className="text-xs text-red-600">
                    {progress.error || 'Error desconocido al generar el PDF'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onRetry}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4F72] text-white font-bold text-sm active:scale-95 transition-all"
                >
                  <Icon name="ArrowPathIcon" size={16} className="text-white" />
                  Reintentar
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm active:scale-95 transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Estado de éxito */}
          {isDone && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                <Icon
                  name="CheckCircleIcon"
                  size={16}
                  className="text-green-600 flex-shrink-0 mt-0.5"
                />
                <p className="text-xs text-green-700 font-medium">
                  PDF generado correctamente. La ventana de impresión se abrió automáticamente. Usa{' '}
                  <strong>Guardar como PDF</strong> en el diálogo de impresión para guardar el
                  archivo.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold text-sm active:scale-95 transition-all"
              >
                <Icon name="CheckIcon" size={16} className="text-white" />
                Listo
              </button>
            </div>
          )}

          {/* Indicador de carga para etapas activas */}
          {isActive && (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="w-5 h-5 border-2 border-[#1B4F72] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500 font-medium">
                Procesando, por favor espere...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
