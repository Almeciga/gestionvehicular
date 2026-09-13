'use client';
import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { VideoPDF } from '@/lib/inspectionPdfGenerator';
import { validateVideoDuration, VIDEO_MAX_DURATION_SECONDS } from '@/lib/inspectionPdfGenerator';

export type { VideoPDF };

interface VideoSectionProps {
  data?: VideoPDF;
  onChange?: (data: VideoPDF) => void;
}

export default function VideoSection({ data: externalData, onChange }: VideoSectionProps) {
  const [localData, setLocalData] = useState<VideoPDF>({ tieneVideo: null, videoLink: '', videoFile: null });
  const [uploadType, setUploadType] = useState<'file' | 'link'>('file');
  const [validating, setValidating] = useState(false);
  const [durationError, setDurationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const data = externalData ?? localData;

  const update = (patch: Partial<VideoPDF>) => {
    const updated = { ...data, ...patch };
    if (onChange) onChange(updated);
    else setLocalData(updated);
  };

  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDurationError(null);
    setValidating(true);

    try {
      const { valid, duration, error } = await validateVideoDuration(file);
      if (!valid) {
        setDurationError(error || 'Video demasiado largo');
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      update({ videoFile: objectUrl, videoDuration: duration });
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveVideo = () => {
    if (data.videoFile) {
      // Revoke object URL to free memory
      try { URL.revokeObjectURL(data.videoFile); } catch { /* ignore */ }
    }
    update({ videoFile: null, videoDuration: undefined });
    setDurationError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">12</span>
        Video del Vehículo
      </h3>

      <div className="card p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">¿Incluye video en esta inspección?</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => update({ tieneVideo: true })}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 font-bold text-base transition-all active:scale-95 ${data.tieneVideo === true ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            <Icon name="CheckCircleIcon" size={22} className={data.tieneVideo === true ? 'text-green-600' : 'text-gray-400'} />
            SÍ
          </button>
          <button
            type="button"
            onClick={() => update({ tieneVideo: false })}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 font-bold text-base transition-all active:scale-95 ${data.tieneVideo === false ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-600'}`}
          >
            <Icon name="XCircleIcon" size={22} className={data.tieneVideo === false ? 'text-red-500' : 'text-gray-400'} />
            NO
          </button>
        </div>
      </div>

      {data.tieneVideo === true && (
        <div className="card p-4 space-y-4">
          {/* Video duration limit notice */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <Icon name="InformationCircleIcon" size={16} className="text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700 font-medium">
              Límite máximo: <strong>{VIDEO_MAX_DURATION_SECONDS / 60} minutos</strong> por video. El sistema validará la duración automáticamente.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUploadType('file')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${uploadType === 'file' ? 'bg-[#1B4F72] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Subir Archivo
            </button>
            <button
              type="button"
              onClick={() => setUploadType('link')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${uploadType === 'link' ? 'bg-[#1B4F72] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Enlace URL
            </button>
          </div>

          {uploadType === 'file' ? (
            <div>
              {/* Duration error */}
              {durationError && (
                <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <Icon name="ExclamationCircleIcon" size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-700">Video rechazado</p>
                    <p className="text-xs text-red-600 mt-0.5">{durationError}</p>
                  </div>
                </div>
              )}

              {data.videoFile ? (
                <div className="relative">
                  <video src={data.videoFile} controls className="w-full rounded-xl" />
                  {data.videoDuration && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <Icon name="ClockIcon" size={13} className="text-gray-400" />
                      Duración: {Math.floor(data.videoDuration / 60)}m {Math.round(data.videoDuration % 60)}s
                      <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-bold">✓ Válido</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md"
                  >
                    <Icon name="XMarkIcon" size={16} className="text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => !validating && fileInputRef.current?.click()}
                  disabled={validating}
                  className="w-full h-36 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-[#1B4F72] hover:bg-blue-50 transition-colors disabled:opacity-60"
                >
                  {validating ? (
                    <>
                      <div className="w-8 h-8 border-2 border-[#1B4F72] border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-semibold text-gray-500">Validando duración del video...</p>
                    </>
                  ) : (
                    <>
                      <Icon name="VideoCameraIcon" size={36} className="text-gray-300" />
                      <p className="text-sm font-semibold text-gray-500">Toca para grabar o seleccionar video</p>
                      <p className="text-xs text-gray-400">Máximo {VIDEO_MAX_DURATION_SECONDS / 60} minutos</p>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={handleVideoFile}
              />
            </div>
          ) : (
            <div>
              <label className="form-label">Enlace del Video (URL segura)</label>
              <input
                type="url"
                value={data.videoLink}
                onChange={(e) => update({ videoLink: e.target.value })}
                placeholder="https://drive.google.com/... o YouTube"
                className="form-input"
              />
              {data.videoLink && (
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                  <Icon name="LinkIcon" size={12} className="text-gray-400" />
                  El enlace se incluirá como referencia segura en el PDF
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}