'use client';
import React, { useState } from 'react';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { ItemConEstadoPDF } from '@/lib/inspectionPdfGenerator';

const componentesInicial: ItemConEstadoPDF[] = [
  { id: 'comp-001', nombre: 'Motor', estado: null, fotos: [] },
  { id: 'comp-002', nombre: 'Caja de Cambios', estado: null, fotos: [] },
  { id: 'comp-003', nombre: 'Sistema de Frenos', estado: null, fotos: [] },
  { id: 'comp-004', nombre: 'Dirección', estado: null, fotos: [] },
  { id: 'comp-005', nombre: 'Suspensión Delantera', estado: null, fotos: [] },
  { id: 'comp-006', nombre: 'Suspensión Trasera', estado: null, fotos: [] },
  { id: 'comp-007', nombre: 'Sistema Eléctrico', estado: null, fotos: [] },
  { id: 'comp-008', nombre: 'Batería', estado: null, fotos: [] },
  { id: 'comp-009', nombre: 'Alternador', estado: null, fotos: [] },
  { id: 'comp-010', nombre: 'Radiador', estado: null, fotos: [] },
  { id: 'comp-011', nombre: 'Escape / Silenciador', estado: null, fotos: [] },
  { id: 'comp-012', nombre: 'Transmisión', estado: null, fotos: [] },
];

const estadoConfig = {
  bueno: { label: 'B', bg: 'bg-green-500', ring: 'ring-green-500' },
  regular: { label: 'R', bg: 'bg-yellow-400', ring: 'ring-yellow-400' },
  malo: { label: 'M', bg: 'bg-red-500', ring: 'ring-red-500' },
};

interface ComponentesSectionProps {
  items?: ItemConEstadoPDF[];
  onChange?: (items: ItemConEstadoPDF[]) => void;
}

export default function ComponentesSection({ items: externalItems, onChange }: ComponentesSectionProps) {
  const [localItems, setLocalItems] = useState<ItemConEstadoPDF[]>(componentesInicial);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = externalItems ?? localItems;

  const updateItems = (updated: ItemConEstadoPDF[]) => {
    if (onChange) onChange(updated);
    else setLocalItems(updated);
  };

  const setEstado = (id: string, estado: ItemConEstadoPDF['estado']) => {
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
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">5</span>
          Componentes del Vehículo
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
              <div className="flex gap-1.5">
                {(['bueno', 'regular', 'malo'] as const).map((e) => (
                  <button
                    key={`${item.id}-${e}`}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); setEstado(item.id, e); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all active:scale-90 ${
                      item.estado === e
                        ? `${estadoConfig[e].bg} ring-2 ${estadoConfig[e].ring} ring-offset-1`
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {estadoConfig[e].label}
                  </button>
                ))}
              </div>
              <span className="flex-1 text-sm font-semibold text-gray-700">{item.nombre}</span>
              <div className="flex items-center gap-2">
                {item.fotos.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">{item.fotos.length}</span>
                )}
                <span className="text-xs text-gray-300">{expanded === item.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === item.id && (
              <div className="px-3 pb-3 border-t border-gray-50 pt-3">
                <PhotoUpload photos={item.fotos} onChange={(f) => setFotos(item.id, f)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}