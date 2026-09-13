'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { DocItemPDF } from '@/lib/inspectionPdfGenerator';

export type { DocItemPDF };

const docsInicial: DocItemPDF[] = [
  { id: 'doc-001', nombre: 'Tarjeta de Propiedad', tiene: null },
  { id: 'doc-002', nombre: 'Seguro Obligatorio (SOAT)', tiene: null },
  { id: 'doc-003', nombre: 'Revisión Tecnomecánica', tiene: null },
  { id: 'doc-004', nombre: 'Manuales del Vehículo', tiene: null },
  { id: 'doc-005', nombre: 'Otros Documentos', tiene: null },
];

interface DocumentosSectionProps {
  docs?: DocItemPDF[];
  onChange?: (docs: DocItemPDF[]) => void;
}

export default function DocumentosSection({ docs: externalDocs, onChange }: DocumentosSectionProps) {
  const [localDocs, setLocalDocs] = useState<DocItemPDF[]>(docsInicial);

  const docs = externalDocs ?? localDocs;

  const updateDocs = (updated: DocItemPDF[]) => {
    if (onChange) onChange(updated);
    else setLocalDocs(updated);
  };

  const toggle = (id: string, val: boolean) => {
    updateDocs(docs.map((d) => d.id === id ? { ...d, tiene: val } : d));
  };

  const completados = docs.filter((d) => d.tiene !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">3</span>
          Documentos
        </h3>
        <span className="text-xs font-semibold text-gray-500">{completados}/{docs.length}</span>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.id} className={`border rounded-xl p-4 transition-all ${doc.tiene === true ? 'border-green-200 bg-green-50' : doc.tiene === false ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${doc.tiene === true ? 'bg-green-100' : doc.tiene === false ? 'bg-red-100' : 'bg-gray-100'}`}>
                <Icon
                  name={doc.tiene === true ? 'CheckCircleIcon' : doc.tiene === false ? 'XCircleIcon' : 'DocumentTextIcon'}
                  size={22}
                  className={doc.tiene === true ? 'text-green-600' : doc.tiene === false ? 'text-red-500' : 'text-gray-400'}
                />
              </div>
              <span className="flex-1 text-sm font-semibold text-gray-700">{doc.nombre}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggle(doc.id, true)}
                  className={`w-12 h-10 rounded-xl font-bold text-sm active:scale-95 transition-all ${doc.tiene === true ? 'bg-green-500 text-white ring-2 ring-green-400 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'}`}
                >
                  SÍ
                </button>
                <button
                  type="button"
                  onClick={() => toggle(doc.id, false)}
                  className={`w-12 h-10 rounded-xl font-bold text-sm active:scale-95 transition-all ${doc.tiene === false ? 'bg-red-500 text-white ring-2 ring-red-400 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500'}`}
                >
                  NO
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}