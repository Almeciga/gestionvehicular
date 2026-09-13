'use client';
import React, { useState } from 'react';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { ItemConEstadoPDF } from '@/lib/inspectionPdfGenerator';

export type { ItemConEstadoPDF };

const piezasInicial: ItemConEstadoPDF[] = [
  { id: 'pieza-001', nombre: 'Capó / Cofre', estado: null, fotos: [] },
  { id: 'pieza-002', nombre: 'Guardabarro Delantero Izquierdo', estado: null, fotos: [] },
  { id: 'pieza-003', nombre: 'Guardabarro Delantero Derecho', estado: null, fotos: [] },
  { id: 'pieza-004', nombre: 'Puerta Delantera Izquierda', estado: null, fotos: [] },
  { id: 'pieza-005', nombre: 'Puerta Delantera Derecha', estado: null, fotos: [] },
  { id: 'pieza-006', nombre: 'Puerta Trasera Izquierda', estado: null, fotos: [] },
  { id: 'pieza-007', nombre: 'Puerta Trasera Derecha', estado: null, fotos: [] },
  { id: 'pieza-008', nombre: 'Techo / Techo Solar', estado: null, fotos: [] },
  { id: 'pieza-009', nombre: 'Maletero / Cajuela', estado: null, fotos: [] },
  { id: 'pieza-010', nombre: 'Parachoques Delantero', estado: null, fotos: [] },
  { id: 'pieza-011', nombre: 'Parachoques Trasero', estado: null, fotos: [] },
  { id: 'pieza-012', nombre: 'Estribo Izquierdo', estado: null, fotos: [] },
  { id: 'pieza-013', nombre: 'Estribo Derecho', estado: null, fotos: [] },
];

const estadoConfig = {
  bueno: { label: 'B', bg: 'bg-green-500', ring: 'ring-green-500' },
  regular: { label: 'R', bg: 'bg-yellow-400', ring: 'ring-yellow-400' },
  malo: { label: 'M', bg: 'bg-red-500', ring: 'ring-red-500' },
};

interface PiezasSectionProps {
  items?: ItemConEstadoPDF[];
  onChange?: (items: ItemConEstadoPDF[]) => void;
}

export default function PiezasSection({ items: externalItems, onChange }: PiezasSectionProps) {
  const [localItems, setLocalItems] = useState<ItemConEstadoPDF[]>(piezasInicial);
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
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">4</span>
          Piezas del Vehículo
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