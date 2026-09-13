'use client';
import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import type { ScannerPDF } from '@/lib/inspectionPdfGenerator';

export type { ScannerPDF };

type ScannerStatus = 'pendiente' | 'aprobado' | 'revision';

const statusConfig: Record<ScannerStatus, { label: string; bg: string; text: string; icon: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-gray-100', text: 'text-gray-600', icon: 'ClockIcon' },
  aprobado: { label: 'Aprobado', bg: 'bg-green-100', text: 'text-green-700', icon: 'CheckCircleIcon' },
  revision: { label: 'Requiere Revisión', bg: 'bg-orange-100', text: 'text-orange-700', icon: 'ExclamationTriangleIcon' },
};

interface ScannerSectionProps {
  data?: ScannerPDF;
  onChange?: (data: ScannerPDF) => void;
}

export default function ScannerSection({ data: externalData, onChange }: ScannerSectionProps) {
  const [localData, setLocalData] = useState<ScannerPDF>({ imagen: null, status: 'pendiente', notas: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  const data = externalData ?? localData;

  const update = (patch: Partial<ScannerPDF>) => {
    const updated = { ...data, ...patch };
    if (onChange) onChange(updated);
    else setLocalData(updated);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update({ imagen: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">8</span>
        Revisión de Scanner
      </h3>

      {/* Image Upload */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-bold text-gray-700">Imagen del Scanner</p>
          <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold">Obligatorio</span>
        </div>
        {data.imagen ? (
          <div className="relative">
            <AppImage
              src={data.imagen}
              alt="Resultado del scanner vehicular"
              width={400}
              height={250}
              className="w-full rounded-xl object-cover max-h-56"
            />
            <button
              type="button"
              onClick={() => update({ imagen: null })}
              className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm"
            >
              <Icon name="XMarkIcon" size={16} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-[#1B4F72] hover:bg-blue-50 transition-colors"
          >
            <Icon name="QrCodeIcon" size={40} className="text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500">Toca para subir imagen del scanner</p>
              <p className="text-xs text-gray-400 mt-0.5">Foto de la pantalla del escáner OBD</p>
            </div>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      </div>

      {/* Estado */}
      <div className="card p-4">
        <p className="text-sm font-bold text-gray-700 mb-3">Estado del Scanner</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(statusConfig) as ScannerStatus[]).map((s) => {
            const cfg = statusConfig[s];
            return (
              <button
                key={`scanner-status-${s}`}
                type="button"
                onClick={() => update({ status: s })}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all active:scale-95 ${
                  data.status === s ? `${cfg.bg} border-current ${cfg.text}` : 'bg-gray-50 border-transparent text-gray-500'
                }`}
              >
                <Icon name={cfg.icon as Parameters<typeof Icon>[0]['name']} size={22} className={data.status === s ? cfg.text : 'text-gray-400'} />
                <span className="text-xs font-bold text-center leading-tight">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notas */}
      <div className="card p-4">
        <label className="form-label">Notas del Scanner (opcional)</label>
        <textarea
          value={data.notas}
          onChange={(e) => update({ notas: e.target.value })}
          placeholder="Ej: Código P0301 - Falla en cilindro 1..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4F72] resize-none"
        />
      </div>
    </div>
  );
}