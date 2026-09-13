'use client';
import React, { useRef, useState, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';

interface PhotoUploadProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
  label?: string;
  required?: boolean;
}

// ─── Smart image compression ──────────────────────────────────────────────────

function compressImage(file: File, maxWidthPx = 1920, qualityJpeg = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Downscale only if larger than maxWidth
        if (width > maxWidthPx) {
          height = Math.round((height * maxWidthPx) / width);
          width = maxWidthPx;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(src); return; }
        ctx.drawImage(img, 0, 0, width, height);

        // Use JPEG for photos (much smaller), PNG for screenshots
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = mimeType === 'image/jpeg' ? qualityJpeg : undefined;
        resolve(canvas.toDataURL(mimeType, quality));
      };
      img.onerror = () => resolve(src); // fallback: use original
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoUpload({ photos, onChange, maxPhotos = 10, label, required }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const processingRef = useRef(false);

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || processingRef.current) return;
    processingRef.current = true;
    setUploading(true);

    const remaining = maxPhotos - photos.length;
    const toProcess = files.slice(0, remaining);

    try {
      const compressed = await Promise.all(
        toProcess.map((file) => compressImage(file))
      );
      onChange([...photos, ...compressed]);
    } catch {
      // fallback: read as-is
      const fallbacks = await Promise.all(
        toProcess.map(
          (file) =>
            new Promise<string>((res) => {
              const reader = new FileReader();
              reader.onload = (ev) => res(ev.target?.result as string);
              reader.readAsDataURL(file);
            })
        )
      );
      onChange([...photos, ...fallbacks]);
    } finally {
      setUploading(false);
      processingRef.current = false;
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [photos, onChange, maxPhotos]);

  const removePhoto = (idx: number) => {
    const updated = photos.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const isMissingRequired = required && photos.length === 0;

  return (
    <div>
      {label && (
        <p className={`text-xs font-semibold mb-2 ${isMissingRequired ? 'text-red-500' : 'text-gray-500'}`}>
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </p>
      )}
      {isMissingRequired && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <Icon name="ExclamationTriangleIcon" size={14} className="text-red-500 flex-shrink-0" />
          Foto obligatoria — ítem marcado como dañado
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {photos.map((src, idx) => (
          <div key={`photo-${idx}`} className="relative">
            <button type="button" onClick={() => setPreviewing(src)}>
              <AppImage
                src={src}
                alt={`Foto ${idx + 1}`}
                width={64}
                height={64}
                className="w-16 h-16 rounded-lg object-cover border border-gray-200"
              />
            </button>
            <button
              type="button"
              onClick={() => removePhoto(idx)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm"
            >
              <Icon name="XMarkIcon" size={12} className="text-white" />
            </button>
          </div>
        ))}
        {uploading && (
          <div className="w-16 h-16 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50">
            <Icon name="ArrowPathIcon" size={20} className="text-gray-400 animate-spin" />
          </div>
        )}
        {photos.length < maxPhotos && !uploading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
              isMissingRequired
                ? 'border-red-400 bg-red-50 hover:border-red-500' :'border-gray-300 hover:border-[#1B4F72] hover:bg-blue-50'
            }`}
          >
            <Icon name="CameraIcon" size={20} className={isMissingRequired ? 'text-red-400' : 'text-gray-400'} />
            <span className={`text-xs ${isMissingRequired ? 'text-red-400' : 'text-gray-400'}`}>Foto</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {previewing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewing(null)}
        >
          <div className="relative max-w-sm w-full">
            <AppImage
              src={previewing}
              alt="Vista previa de foto"
              width={400}
              height={400}
              className="w-full rounded-2xl object-contain"
            />
            <button
              onClick={() => setPreviewing(null)}
              className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow"
            >
              <Icon name="XMarkIcon" size={18} className="text-gray-700" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}