'use client';
import React, { useState } from 'react';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { ItemMecanicaPDF } from '@/lib/inspectionPdfGenerator';

export type { ItemMecanicaPDF };

const mecanicaInicial: ItemMecanicaPDF[] = [
  { id: 'mec-001', nombre: 'Luces Delanteras', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-002', nombre: 'Luces Traseras', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-003', nombre: 'Luces de Freno', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-004', nombre: 'Luces Intermitentes', categoria: 'Iluminación', estado: null, fotos: [] },
  { id: 'mec-005', nombre: 'Llantas Delanteras', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-006', nombre: 'Llantas Traseras', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-007', nombre: 'Rines / Aros', categoria: 'Neumáticos', estado: null, fotos: [] },
  { id: 'mec-008', nombre: 'Limpiaparabrisas', categoria: 'Exterior', estado: null, fotos: [] },
  { id: 'mec-009', nombre: 'Espejo Retrovisor Central', categoria: 'Exterior', estado: null, fotos: [] },
  { id: 'mec-010', nombre: 'Antena', categoria: 'Exterior', estado: null, fotos: [] },
];

const categorias = [...new Set(mecanicaInicial.map((i) => i.categoria))];

const estadoConfig = {
  bueno: { label: 'B', bg: 'bg-green-500', ring: 'ring-green-500' },
  regular: { label: 'R', bg: 'bg-yellow-400', ring: 'ring-yellow-400' },
  malo: { label: 'M', bg: 'bg-red-500', ring: 'ring-red-500' },
};

interface MecanicaSectionProps {
  items?: ItemMecanicaPDF[];
  onChange?: (items: ItemMecanicaPDF[]) => void;
}

export default function MecanicaSection({ items: externalItems, onChange }: MecanicaSectionProps) {
  const [localItems, setLocalItems] = useState<ItemMecanicaPDF[]>(mecanicaInicial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  const items = externalItems ?? localItems;

  const updateItems = (updated: ItemMecanicaPDF[]) => {
    if (onChange) onChange(updated);
    else setLocalItems(updated);
  };

  const setEstado = (id: string, estado: ItemMecanicaPDF['estado']) => {
    updateItems(items.map((item) => item.id === id ? { ...item, estado } : item));
  };

  const setFotos = (id: string, fotos: string[]) => {
    updateItems(items.map((item) => item.id === id ? { ...item, fotos } : item));
  };

  const filtered = activeCategory === 'Todos' ? items : items.filter((i) => i.categoria === activeCategory);
  const completados = items.filter((i) => i.estado !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">6</span>
          Sistema Mecánico / Exterior
        </h3>
        <span className="text-xs font-semibold text-gray-500">{completados}/{items.length}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {['Todos', ...categorias].map((cat) => (
          <button
            key={`cat-${cat}`}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-[#1B4F72] text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
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
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">{item.nombre}</p>
                <p className="text-xs text-gray-400">{item.categoria}</p>
              </div>
              {item.fotos.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">{item.fotos.length}</span>
              )}
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