'use client';
import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { FirmasPDF } from '@/lib/inspectionPdfGenerator';

export type { FirmasPDF };

interface SignaturePadProps {
  label: string;
  sublabel: string;
  onSign: (dataUrl: string) => void;
  signed: boolean;
  onClear: () => void;
}

function SignaturePad({ label, sublabel, onSign, signed, onClear }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * (canvas.width / rect.width),
      y: ((e as React.MouseEvent).clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    lastPos.current = pos;
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1B4F72';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      onSign(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{sublabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {signed && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <Icon name="CheckCircleIcon" size={14} className="text-green-600" />
              Firmado
            </span>
          )}
          <button
            type="button"
            onClick={clearCanvas}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Icon name="TrashIcon" size={16} className="text-gray-400" />
          </button>
        </div>
      </div>
      <div className="relative border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50" style={{ height: '160px' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-full signature-canvas touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!signed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 opacity-30">
              <Icon name="PencilIcon" size={32} className="text-gray-400" />
              <p className="text-sm text-gray-400 font-semibold">Firme aquí</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 border-b-2 border-dashed border-gray-300 mx-6 mb-6" />
      </div>
    </div>
  );
}

interface FirmasSectionProps {
  data?: FirmasPDF;
  onChange?: (data: FirmasPDF) => void;
}

export default function FirmasSection({ data: externalData, onChange }: FirmasSectionProps) {
  const [localData, setLocalData] = useState<FirmasPDF>({
    inspectorName: '',
    clienteName: '',
    inspectorSignature: null,
    clienteSignature: null,
  });

  const data = externalData ?? localData;

  const update = (patch: Partial<FirmasPDF>) => {
    const updated = { ...data, ...patch };
    if (onChange) onChange(updated);
    else setLocalData(updated);
  };

  const inspectorSigned = !!data.inspectorSignature;
  const clienteSigned = !!data.clienteSignature;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">13</span>
        Firmas
      </h3>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Icon name="InformationCircleIcon" size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 font-semibold">Ambas firmas son necesarias para completar la inspección y generar el reporte PDF.</p>
      </div>

      <div>
        <label className="form-label">Nombre del Inspector</label>
        <input
          type="text"
          value={data.inspectorName}
          onChange={(e) => update({ inspectorName: e.target.value })}
          placeholder="Nombre completo del inspector"
          className="form-input"
        />
      </div>

      <SignaturePad
        label="Firma del Inspector"
        sublabel="Dibuje su firma en el recuadro"
        onSign={(sig) => update({ inspectorSignature: sig })}
        signed={inspectorSigned}
        onClear={() => update({ inspectorSignature: null })}
      />

      <div>
        <label className="form-label">Nombre del Cliente</label>
        <input
          type="text"
          value={data.clienteName}
          onChange={(e) => update({ clienteName: e.target.value })}
          placeholder="Nombre completo del cliente"
          className="form-input"
        />
      </div>

      <SignaturePad
        label="Firma del Cliente"
        sublabel="El cliente debe firmar para confirmar la inspección"
        onSign={(sig) => update({ clienteSignature: sig })}
        signed={clienteSigned}
        onClear={() => update({ clienteSignature: null })}
      />

      {inspectorSigned && clienteSigned && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Icon name="CheckCircleIcon" size={24} className="text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-700">Inspección lista para guardar</p>
            <p className="text-xs text-green-600 mt-0.5">Ambas firmas registradas. Presiona &quot;Guardar Inspección&quot; para finalizar.</p>
          </div>
        </div>
      )}
    </div>
  );
}