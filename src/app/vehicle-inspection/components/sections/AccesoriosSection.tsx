'use client';
import React, { useState } from 'react';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { AccesorioItemPDF } from '@/lib/inspectionPdfGenerator';

export type { AccesorioItemPDF };

const accesoriosInicial: AccesorioItemPDF[] = [
  { id: 'acc-001', nombre: 'Radio / Estéreo', estado: null, fotos: [] },
  { id: 'acc-002', nombre: 'Aire Acondicionado', estado: null, fotos: [] },
  { id: 'acc-003', nombre: 'Calefacción', estado: null, fotos: [] },
  { id: 'acc-004', nombre: 'Elevavidrios Eléctrico', estado: null, fotos: [] },
  { id: 'acc-005', nombre: 'Retrovisores Eléctricos', estado: null, fotos: [] },
  { id: 'acc-006', nombre: 'Tapetes / Alfombras', estado: null, fotos: [] },
  { id: 'acc-007', nombre: 'Cinturones de Seguridad', estado: null, fotos: [] },
  { id: 'acc-008', nombre: 'Airbags', estado: null, fotos: [] },
  { id: 'acc-009', nombre: 'GPS / Navegador', estado: null, fotos: [] },
  { id: 'acc-010', nombre: 'Cámara de Reversa', estado: null, fotos: [] },
  { id: 'acc-011', nombre: 'Sensores de Parqueo', estado: null, fotos: [] },
  { id: 'acc-012', nombre: 'Llanta de Repuesto', estado: null, fotos: [] },
  { id: 'acc-013', nombre: 'Gato Hidráulico', estado: null, fotos: [] },
  { id: 'acc-014', nombre: 'Triángulos de Emergencia', estado: null, fotos: [] },
  { id: 'acc-015', nombre: 'Extintor', estado: null, fotos: [] },
  { id: 'acc-016', nombre: 'Botiquín', estado: null, fotos: [] },
];

const estadoConfig = {
  bueno: { label: 'Bueno', bg: 'bg-green-500', text: 'text-white', ring: 'ring-green-500' },
  regular: { label: 'Regular', bg: 'bg-yellow-400', text: 'text-white', ring: 'ring-yellow-400' },
  malo: { label: 'Malo', bg: 'bg-red-500', text: 'text-white', ring: 'ring-red-500' },
};

interface AccesoriosSectionProps {
  items?: AccesorioItemPDF[];
  onChange?: (items: AccesorioItemPDF[]) => void;
}

export default function AccesoriosSection({ items: externalItems, onChange }: AccesoriosSectionProps) {
  const [localItems, setLocalItems] = useState<AccesorioItemPDF[]>(accesoriosInicial);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = externalItems ?? localItems;

  const updateItems = (updated: AccesorioItemPDF[]) => {
    if (onChange) {
      onChange(updated);
    } else {
      setLocalItems(updated);
    }
  };

  const setEstado = (id: string, estado: AccesorioItemPDF['estado']) => {
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
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">2</span>
          Accesorios
        </h3>
        <span className="text-xs font-semibold text-gray-500">{completados}/{items.length}</span>
      </div>

      {/* Estado legend */}
      <div className="flex gap-3 bg-gray-50 rounded-xl p-3">
        {(['bueno', 'regular', 'malo'] as const).map((e) => (
          <div key={`legend-${e}`} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${estadoConfig[e].bg}`} />
            <span className="text-xs font-semibold text-gray-600">{estadoConfig[e].label}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`border rounded-xl overflow-hidden transition-all ${item.estado ? 'border-gray-200' : 'border-gray-100'} bg-white`}>
            <div
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            >
              {/* Estado buttons */}
              <div className="flex gap-1.5">
                {(['bueno', 'regular', 'malo'] as const).map((e) => (
                  <button
                    key={`${item.id}-${e}`}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); setEstado(item.id, e); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all active:scale-90 ${
                      item.estado === e
                        ? `${estadoConfig[e].bg} ${estadoConfig[e].text} ring-2 ${estadoConfig[e].ring} ring-offset-1`
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {e === 'bueno' ? 'B' : e === 'regular' ? 'R' : 'M'}
                  </button>
                ))}
              </div>
              <span className="flex-1 text-sm font-semibold text-gray-700">{item.nombre}</span>
              <div className="flex items-center gap-2">
                {item.fotos.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">
                    {item.fotos.length} foto{item.fotos.length > 1 ? 's' : ''}
                  </span>
                )}
                <span className={`text-xs text-gray-400 transition-transform ${expanded === item.id ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </div>
            {expanded === item.id && (
              <div className="px-3 pb-3 border-t border-gray-100 pt-3">
                <PhotoUpload
                  photos={item.fotos}
                  onChange={(fotos) => setFotos(item.id, fotos)}
                  label="Fotos del accesorio"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}