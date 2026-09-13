'use client';
import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { DBVehicle } from '@/lib/db';
import { getOpenInspectionForVehicle } from '@/lib/store';
import { toast } from 'sonner';

const statusLabels: Record<string, string> = {
  borrador: 'en borrador', activo: 'en proceso', pendiente_revision: 'en revisión',
  aprobado: 'aprobada', completado: 'completada', rechazado: 'rechazada',
};

export interface DatosGeneralesValues {
  vehicleId: string; // reference to the vehicle created in Producción
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  propietario: string;
  vin: string;
  codigo: string;
  bodega: string;
  nivel: string;
  estado: string;
  km: string;
  telefono: string;
  celular: string;
  fecha: string;
  inspectorName: string;
}

interface DatosGeneralesSectionProps {
  values?: DatosGeneralesValues;
  onChange?: (field: keyof DatosGeneralesValues, value: string) => void;
  /** Whether this section is read-only (e.g. finalized inspection) */
  readOnly?: boolean;
  /** Current inspection's own id, so its own open record doesn't block itself */
  inspectionId?: string | null;
}

const estados = ['Nuevo', 'Usado', 'Reparación', 'Siniestro'];
const niveles = ['1', '2', '3', '4', '5'];

export default function DatosGeneralesSection({ values, onChange, readOnly, inspectionId }: DatosGeneralesSectionProps) {
  const [today, setToday] = useState<string>('');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }, []);

  const [vehicles, setVehicles] = useState<DBVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  // Load vehicles already registered in Producción — inspections can only be
  // created for vehicles that already exist there, never typed manually.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { VehiclesRepo } = await import('@/lib/repositories');
      const all = await VehiclesRepo.getAll();
      if (!cancelled) setVehicles(all);
      setLoadingVehicles(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handle = (field: keyof DatosGeneralesValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    onChange?.(field, e.target.value);
  };

  const selectedVehicle = vehicles.find((v) => v.id === values?.vehicleId);
  const vehicleMissing = !values?.vehicleId;

  const filteredVehicles = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (v.placa || '').toLowerCase().includes(q) ||
      (v.vin || '').toLowerCase().includes(q) ||
      (v.marca || '').toLowerCase().includes(q) ||
      (v.modelo || '').toLowerCase().includes(q) ||
      (v.propietario || '').toLowerCase().includes(q)
    );
  });

  const handleSelectVehicle = (vehicle: DBVehicle) => {
    const openElsewhere = getOpenInspectionForVehicle(vehicle.id);
    if (openElsewhere && openElsewhere.id !== inspectionId) {
      const label = statusLabels[openElsewhere.status] || openElsewhere.status;
      toast.error(`Este vehículo ya tiene una inspección ${label} (${openElsewhere.enterpriseId || openElsewhere.id}). Debe finalizarse o archivarse antes de iniciar otra.`, { duration: 6000 });
      return;
    }
    onChange?.('vehicleId', vehicle.id);
    onChange?.('placa', vehicle.placa || '');
    onChange?.('marca', vehicle.marca || '');
    onChange?.('modelo', vehicle.modelo || '');
    onChange?.('color', vehicle.color || '');
    onChange?.('propietario', vehicle.propietario || '');
    onChange?.('vin', vehicle.vin || '');
    setShowPicker(false);
    setSearch('');
  };

  const handleClearVehicle = () => {
    onChange?.('vehicleId', '');
    onChange?.('placa', '');
    onChange?.('marca', '');
    onChange?.('modelo', '');
    onChange?.('color', '');
    onChange?.('propietario', '');
    onChange?.('vin', '');
  };

// Arriba del componente, junto a los demás helpers
  const isoToDDMMYYYY = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const ddmmyyyyToISO = (ddmmyyyy: string) => {
    if (!ddmmyyyy || !ddmmyyyy.includes('/')) return '';
    const [d, m, y] = ddmmyyyy.split('/');
    return `${y}-${m}-${d}`;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">1</span>
        Datos Generales del Vehículo
      </h3>

      {/* ── Vehicle selector ─────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Vehículo a Inspeccionar *</label>
          {vehicleMissing && (
            <span className="text-xs font-bold text-red-500 flex items-center gap-1">
              <Icon name="ExclamationCircleIcon" size={13} className="text-red-500" />
              Obligatorio
            </span>
          )}
        </div>

        {loadingVehicles ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            Cargando vehículos de Producción...
          </div>
        ) : vehicles.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-semibold">
              No hay vehículos registrados en Producción todavía. Primero crea el vehículo en la sección
              &quot;Producción&quot; para poder inspeccionarlo aquí.
            </p>
          </div>
        ) : selectedVehicle ? (
          <div className={`border rounded-xl p-3 ${readOnly ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold text-[#1B4F72]">{selectedVehicle.placa || selectedVehicle.vin}</p>
                <p className="text-sm font-semibold text-gray-700">{selectedVehicle.marca} {selectedVehicle.modelo} — {selectedVehicle.color}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selectedVehicle.propietario}</p>
                {selectedVehicle.vin && <p className="text-xs text-gray-400 mt-0.5">VIN: {selectedVehicle.vin}</p>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="text-xs font-bold text-[#1B4F72] underline whitespace-nowrap"
                >
                  Cambiar
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-red-200 bg-red-50 rounded-xl text-red-600 font-semibold text-sm active:scale-95 transition-all"
          >
            <Icon name="TruckIcon" size={18} className="text-red-500" />
            Seleccionar vehículo de Producción
          </button>
        )}

        {vehicleMissing && vehicles.length > 0 && (
          <p className="text-xs text-red-500 mt-2 font-semibold">
            Debes seleccionar un vehículo antes de continuar con la inspección.
          </p>
        )}
      </div>

      {/* ── Picker modal ─────────────────────────────────────────────── */}
      {showPicker && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <Icon name="TruckIcon" size={18} className="text-[#1B4F72]" />
              <h4 className="font-bold text-gray-800 flex-1">Seleccionar Vehículo</h4>
              <button onClick={() => { setShowPicker(false); setSearch(''); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <Icon name="XMarkIcon" size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por placa, VIN, marca, propietario..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredVehicles.length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400">Sin resultados</div>
              ) : (
                filteredVehicles.map((v) => {
                  const blocking = getOpenInspectionForVehicle(v.id);
                  const isBlocked = !!blocking && blocking.id !== inspectionId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVehicle(v)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#1B4F72]">{v.placa || 'S/P'}</span>
                        {v.vin && <span className="text-xs text-gray-400 font-mono">{v.vin}</span>}
                        {isBlocked && (
                          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                                    En inspección
                                                </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-700">{v.marca} {v.modelo} — {v.color}</p>
                      <p className="text-xs text-gray-500">{v.propietario}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Read-only vehicle fields (auto-filled, not editable) ────────── */}
      {selectedVehicle && (
        <button
          type="button"
          onClick={handleClearVehicle}
          className="hidden"
          aria-hidden="true"
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Código</label>
          <input
            value={values?.codigo ?? ''}
            onChange={handle('codigo')}
            placeholder="Código interno"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Bodega</label>
          <input
            value={values?.bodega ?? ''}
            onChange={handle('bodega')}
            placeholder="Ej: Bodega A"
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Nivel</label>
          <select
            value={values?.nivel ?? ''}
            onChange={handle('nivel')}
            className="form-select"
          >
            <option value="">Seleccionar</option>
            {niveles.map((n) => <option key={`nivel-${n}`} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Estado</label>
          <select
            value={values?.estado ?? ''}
            onChange={handle('estado')}
            className="form-select"
          >
            <option value="">Seleccionar</option>
            {estados.map((e) => <option key={`estado-${e}`} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Kilometraje (KM)</label>
        <input
          type="number"
          value={values?.km ?? ''}
          onChange={handle('km')}
          placeholder="Ej: 45000"
          className="form-input"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Teléfono</label>
          <input
            type="tel"
            value={values?.telefono ?? ''}
            onChange={handle('telefono')}
            placeholder="Fijo"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Celular</label>
          <input
            type="tel"
            value={values?.celular ?? ''}
            onChange={handle('celular')}
            placeholder="Móvil"
            className="form-input"
          />
        </div>
      </div>

      <div>
        <label className="form-label">Inspector</label>
        <input
          value={values?.inspectorName ?? ''}
          onChange={handle('inspectorName')}
          placeholder="Nombre del inspector"
          className="form-input"
        />
      </div>

      <div>
        <label className="form-label">Fecha de Inspección</label>
        <input
          type="date"
          value={ddmmyyyyToISO(values?.fecha ?? today)}
          onChange={(e) => onChange?.('fecha', isoToDDMMYYYY(e.target.value))}
          className="form-input"
        />
      </div>
    </div>
  );
}