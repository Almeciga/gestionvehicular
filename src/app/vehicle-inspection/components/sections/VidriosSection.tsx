'use client';
import React, { useState } from 'react';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { VidrioItemPDF } from '@/lib/inspectionPdfGenerator';

export type { VidrioItemPDF };

const vidriosInicial: VidrioItemPDF[] = [
  { id: 'vid-001', nombre: 'Parabrisas Delantero', estado: null, fotos: [] },
  { id: 'vid-002', nombre: 'Parabrisas Trasero', estado: null, fotos: [] },
  { id: 'vid-003', nombre: 'Ventana Delantera Izquierda', estado: null, fotos: [] },
  { id: 'vid-004', nombre: 'Ventana Delantera Derecha', estado: null, fotos: [] },
  { id: 'vid-005', nombre: 'Ventana Trasera Izquierda', estado: null, fotos: [] },
  { id: 'vid-006', nombre: 'Ventana Trasera Derecha', estado: null, fotos: [] },
  { id: 'vid-007', nombre: 'Luneta', estado: null, fotos: [] },
];

const estadoConfig: Record<NonNullable<VidrioItemPDF['estado']>, { label: string; bg: string; text: string }> = {
  bueno: { label: 'Bueno', bg: 'bg-green-500', text: 'text-white' },
  rayado: { label: 'Rayado', bg: 'bg-yellow-400', text: 'text-white' },
  roto: { label: 'Roto', bg: 'bg-red-500', text: 'text-white' },
  deslaminado: { label: 'Deslaminado', bg: 'bg-orange-400', text: 'text-white' },
};

interface VidriosSectionProps {
  items?: VidrioItemPDF[];
  onChange?: (items: VidrioItemPDF[]) => void;
}

export default function VidriosSection({ items: externalItems, onChange }: VidriosSectionProps) {
  const [localItems, setLocalItems] = useState<VidrioItemPDF[]>(vidriosInicial);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = externalItems ?? localItems;

  const updateItems = (updated: VidrioItemPDF[]) => {
    if (onChange) onChange(updated);
    else setLocalItems(updated);
  };

  const setEstado = (id: string, estado: VidrioItemPDF['estado']) => {
    updateItems(items.map((item) => item.id === id ? { ...item, estado } : item));
  };

  const setFotos = (id: string, fotos: string[]) => {
    updateItems(items.map((item) => item.id === id ? { ...item, fotos } : item));
  };

  const completados = items.filter((i) => i.estado !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">10</span>
          Vidrios
        </h3>
        <span className="text-xs font-semibold text-gray-500">{completados}/{items.length}</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="border border-gray-100 rounded-xl bg-white overflow-hidden">
            <div
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">{item.nombre}</p>
                {item.estado && (
                  <span className={`text-xs font-bold ${estadoConfig[item.estado].bg} ${estadoConfig[item.estado].text} px-2 py-0.5 rounded-full inline-block mt-0.5`}>
                    {estadoConfig[item.estado].label}
                  </span>
                )}
              </div>
              {item.fotos.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">{item.fotos.length}</span>
              )}
              <span className="text-xs text-gray-300">{expanded === item.id ? '▲' : '▼'}</span>
            </div>
            {expanded === item.id && (
              <div className="px-3 pb-3 border-t border-gray-50 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(estadoConfig) as [NonNullable<VidrioItemPDF['estado']>, typeof estadoConfig[NonNullable<VidrioItemPDF['estado']>]][]).map(([estado, cfg]) => (
                    <button
                      key={`vidrio-${item.id}-${estado}`}
                      type="button"
                      onClick={() => setEstado(item.id, estado)}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${item.estado === estado ? `${cfg.bg} ${cfg.text}` : 'bg-gray-100 text-gray-600'}`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
                <PhotoUpload photos={item.fotos} onChange={(f) => setFotos(item.id, f)} label="Fotos del vidrio" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
