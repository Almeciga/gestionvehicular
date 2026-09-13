'use client';
import React, { useState } from 'react';

interface ObservacionesSectionProps {
  texto?: string;
  onChange?: (texto: string) => void;
}

export default function ObservacionesSection({ texto: externalTexto, onChange }: ObservacionesSectionProps) {
  const [localTexto, setLocalTexto] = useState('');
  const maxChars = 1000;

  const texto = externalTexto ?? localTexto;

  const setTexto = (val: string) => {
    const sliced = val.slice(0, maxChars);
    if (onChange) onChange(sliced);
    else setLocalTexto(sliced);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">11</span>
        Observaciones Generales
      </h3>
      <div className="card p-4">
        <label className="form-label">Observaciones del Inspector</label>
        <p className="text-xs text-gray-400 mb-2">Anote cualquier detalle adicional sobre el estado del vehículo</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e?.target?.value ?? '')}
          placeholder="Ej: Vehículo presenta desgaste en tapicería del asiento del conductor. Ruido en la suspensión delantera al girar. Se recomienda revisión de rotulas..."
          rows={8}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4F72] resize-none leading-relaxed"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">Mínimo 10 caracteres recomendado</span>
          <span className={`text-xs font-semibold ${texto?.length > maxChars * 0.9 ? 'text-orange-500' : 'text-gray-400'}`}>
            {texto?.length}/{maxChars}
          </span>
        </div>
      </div>
      {/* Quick suggestions */}
      <div className="card p-4">
        <p className="text-xs font-bold text-gray-500 mb-2">OBSERVACIONES FRECUENTES</p>
        <div className="flex flex-wrap gap-2">
          {[
            'Desgaste en tapicería',
            'Ruido en suspensión',
            'Aceite bajo',
            'Filtros para cambio',
            'Alineación requerida',
            'Frenos desgastados',
          ]?.map((sugerencia) => (
            <button
              key={`sug-${sugerencia}`}
              type="button"
              onClick={() => setTexto(texto ? texto + '. ' + sugerencia : sugerencia)}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold hover:bg-[#1B4F72] hover:text-white transition-colors active:scale-95"
            >
              + {sugerencia}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}