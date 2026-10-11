'use client';
import React, { useEffect, useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { DBVehicle, DBVehicleBrand } from '@/lib/db';
import { getOpenInspectionForVehicle } from '@/lib/store';
import { toast } from 'sonner';

const statusLabels: Record<string, string> = {
  borrador: 'en borrador', activo: 'en proceso', pendiente_revision: 'en revisión',
  aprobado: 'aprobada', completado: 'completada', rechazado: 'rechazada',
};

export interface DatosGeneralesValues {
  vehicleId: string;
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
  readOnly?: boolean;
  inspectionId?: string | null;
}

const estados = ['Nuevo', 'Usado', 'Reparación', 'Siniestro'];
const niveles = ['1', '2', '3', '4', '5'];
const colores = ['Blanco', 'Negro', 'Gris', 'Rojo', 'Azul', 'Verde', 'Plateado', 'Beige', 'Amarillo', 'Naranja', 'Otro'];

// Colombian plate format: 3 letters + 3 digits (cars) or 3 letters + 2 digits + 1 letter (motos)
function isValidColombianPlate(plate: string): boolean {
  if (!plate) return false;
  const p = plate.toUpperCase().trim();
  return /^[A-Z]{3}[0-9]{3}$/.test(p) || /^[A-Z]{3}[0-9]{2}[A-Z]$/.test(p);
}

// ─── Inline vehicle registration form ────────────────────────────────────────

interface NewVehicleFormProps {
  onSave: (vehicle: DBVehicle) => void;
  onCancel: () => void;
}

function NewVehicleForm({ onSave, onCancel }: NewVehicleFormProps) {
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<DBVehicleBrand[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    placa: '', marca: '', modelo: '', color: '', propietario: '', vin: '',
    cantidad_puestos: 5, cantidad_ejes: 2,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load brands
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase
          .from('vehicle_brands')
          .select('id, nombre, categoria, pais_origen, activo')
          .eq('activo', true)
          .order('nombre');
        if (!cancelled && data && data.length > 0) {
          setBrands(data as DBVehicleBrand[]);
        }
      } catch {
        setBrands([
          { id: '1', nombre: 'Chevrolet', categoria: 'auto' },
          { id: '2', nombre: 'Renault', categoria: 'auto' },
          { id: '3', nombre: 'Kia', categoria: 'auto' },
          { id: '4', nombre: 'Hyundai', categoria: 'auto' },
          { id: '5', nombre: 'Toyota', categoria: 'auto' },
          { id: '6', nombre: 'Mazda', categoria: 'auto' },
          { id: '7', nombre: 'Nissan', categoria: 'auto' },
          { id: '8', nombre: 'Ford', categoria: 'auto' },
          { id: '9', nombre: 'Volkswagen', categoria: 'auto' },
          { id: '10', nombre: 'Mitsubishi', categoria: 'auto' },
          { id: '11', nombre: 'Otro', categoria: 'auto' },
        ]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close brand dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) {
        setShowBrandDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredBrands = brands.filter((b) =>
    !brandSearch.trim() || b.nombre.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const set = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.placa && !form.vin) e.placa = 'Se requiere placa o VIN';
    if (form.placa && !isValidColombianPlate(form.placa)) {
      e.placa = 'Formato inválido. Ej: ABC123 o ABC12D';
    }
    if (!form.marca) e.marca = 'Selecciona la marca';
    if (!form.modelo.trim()) e.modelo = 'El modelo es obligatorio';
    if (!form.propietario.trim()) e.propietario = 'El propietario es obligatorio';
    if (form.cantidad_puestos < 1 || form.cantidad_puestos > 100) e.cantidad_puestos = 'Valor inválido';
    if (form.cantidad_ejes < 1 || form.cantidad_ejes > 10) e.cantidad_ejes = 'Valor inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { VehiclesRepo } = await import('@/lib/repositories');

      // Check for duplicate plate
      if (form.placa) {
        const all = await VehiclesRepo.getAll();
        const dup = all.find((v) => v.placa?.toUpperCase() === form.placa.toUpperCase());
        if (dup) {
          setErrors({ placa: 'Ya existe un vehículo con esta placa' });
          setSaving(false);
          return;
        }
      }

      const now = new Date().toISOString();
      const newVehicle: Omit<DBVehicle, '_synced_at' | '_dirty' | 'version' | 'base_version'> = {
        id: crypto.randomUUID(),
        placa: form.placa.toUpperCase(),
        marca: form.marca,
        modelo: form.modelo,
        color: form.color,
        propietario: form.propietario,
        vin: form.vin,
        cantidad_puestos: form.cantidad_puestos,
        cantidad_ejes: form.cantidad_ejes,
        fecha_creacion: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        materials: [],
        created_at: now,
        updated_at: now,
      };

      await VehiclesRepo.create(newVehicle as DBVehicle);
      toast.success('Vehículo registrado correctamente');
      onSave(newVehicle as DBVehicle);
    } catch (err) {
      toast.error('Error al guardar el vehículo');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <Icon name="TruckIcon" size={16} className="text-[#1B4F72]" />
          Registrar vehículo nuevo
        </h4>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg hover:bg-blue-100">
          <Icon name="XMarkIcon" size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Placa */}
      <div>
        <label className="form-label">Placa *</label>
        <input
          value={form.placa}
          onChange={(e) => set('placa', e.target.value.toUpperCase())}
          placeholder="Ej: ABC123"
          maxLength={7}
          className={`form-input uppercase ${errors.placa ? 'border-red-400' : ''}`}
        />
        {errors.placa && <p className="text-xs text-red-500 mt-1">{errors.placa}</p>}
        <p className="text-xs text-gray-400 mt-0.5">Formato colombiano: 3 letras + 3 dígitos (o 3L+2D+1L para motos)</p>
      </div>

      {/* VIN */}
      <div>
        <label className="form-label">VIN / Número de serie</label>
        <input
          value={form.vin}
          onChange={(e) => set('vin', e.target.value)}
          placeholder="Opcional si hay placa"
          className="form-input"
        />
      </div>

      {/* Marca */}
      <div ref={brandRef} className="relative">
        <label className="form-label">Marca *</label>
        <input
          value={brandSearch}
          onChange={(e) => { setBrandSearch(e.target.value); setShowBrandDropdown(true); set('marca', ''); }}
          onFocus={() => setShowBrandDropdown(true)}
          placeholder="Buscar marca..."
          className={`form-input ${errors.marca ? 'border-red-400' : ''}`}
        />
        {errors.marca && <p className="text-xs text-red-500 mt-1">{errors.marca}</p>}
        {showBrandDropdown && filteredBrands.length > 0 && (
          <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
            {filteredBrands.map((b) => (
              <button
                key={b.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  set('marca', b.nombre);
                  setBrandSearch(b.nombre);
                  setShowBrandDropdown(false);
                }}
              >
                {b.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modelo */}
      <div>
        <label className="form-label">Modelo *</label>
        <input
          value={form.modelo}
          onChange={(e) => set('modelo', e.target.value)}
          placeholder="Ej: Tucson 2022"
          className={`form-input ${errors.modelo ? 'border-red-400' : ''}`}
        />
        {errors.modelo && <p className="text-xs text-red-500 mt-1">{errors.modelo}</p>}
      </div>

      {/* Color */}
      <div>
        <label className="form-label">Color</label>
        <select value={form.color} onChange={(e) => set('color', e.target.value)} className="form-select">
          <option value="">Seleccionar</option>
          {colores.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Propietario */}
      <div>
        <label className="form-label">Propietario *</label>
        <input
          value={form.propietario}
          onChange={(e) => set('propietario', e.target.value)}
          placeholder="Nombre del propietario"
          className={`form-input ${errors.propietario ? 'border-red-400' : ''}`}
        />
        {errors.propietario && <p className="text-xs text-red-500 mt-1">{errors.propietario}</p>}
      </div>

      {/* Puestos y Ejes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Cantidad de puestos *</label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.cantidad_puestos}
            onChange={(e) => set('cantidad_puestos', parseInt(e.target.value) || 1)}
            className={`form-input ${errors.cantidad_puestos ? 'border-red-400' : ''}`}
          />
          {errors.cantidad_puestos && <p className="text-xs text-red-500 mt-1">{errors.cantidad_puestos}</p>}
        </div>
        <div>
          <label className="form-label">Cantidad de ejes *</label>
          <input
            type="number"
            min={1}
            max={10}
            value={form.cantidad_ejes}
            onChange={(e) => set('cantidad_ejes', parseInt(e.target.value) || 2)}
            className={`form-input ${errors.cantidad_ejes ? 'border-red-400' : ''}`}
          />
          {errors.cantidad_ejes && <p className="text-xs text-red-500 mt-1">{errors.cantidad_ejes}</p>}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 btn-primary flex items-center justify-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon name="CheckIcon" size={16} className="text-white" />
          )}
          {saving ? 'Guardando...' : 'Guardar vehículo'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DatosGeneralesSection({ values, onChange, readOnly, inspectionId }: DatosGeneralesSectionProps) {
  const [today, setToday] = useState<string>('');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }, []);

  const [vehicles, setVehicles] = useState<DBVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [search, setSearch] = useState('');

  const loadVehicles = async () => {
    const { VehiclesRepo } = await import('@/lib/repositories');
    const all = await VehiclesRepo.getAll();
    setVehicles(all);
    setLoadingVehicles(false);
  };

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

  const handleNewVehicleSaved = async (vehicle: DBVehicle) => {
    // Reload vehicles list
    await loadVehicles();
    // Auto-select the newly created vehicle
    handleSelectVehicle(vehicle);
    setShowNewVehicleForm(false);
    setShowPicker(false);
  };

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
            Cargando vehículos...
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
        ) : showNewVehicleForm ? (
          <NewVehicleForm
            onSave={handleNewVehicleSaved}
            onCancel={() => setShowNewVehicleForm(false)}
          />
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 bg-gray-50 rounded-xl text-gray-600 font-semibold text-sm active:scale-95 transition-all hover:border-[#1B4F72] hover:text-[#1B4F72]"
            >
              <Icon name="MagnifyingGlassIcon" size={18} className="text-current" />
              Buscar vehículo existente
            </button>
            <button
              type="button"
              onClick={() => setShowNewVehicleForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl text-blue-700 font-semibold text-sm active:scale-95 transition-all hover:border-blue-500"
            >
              <Icon name="PlusCircleIcon" size={18} className="text-blue-600" />
              Registrar vehículo nuevo
            </button>
            {vehicles.length === 0 && (
              <p className="text-xs text-gray-400 text-center mt-1">
                Aún no hay vehículos registrados. Usa &quot;Registrar vehículo nuevo&quot; para agregar el primero.
              </p>
            )}
          </div>
        )}

        {vehicleMissing && !showNewVehicleForm && vehicles.length > 0 && (
          <p className="text-xs text-red-500 mt-2 font-semibold">
            Debes seleccionar o registrar un vehículo antes de continuar.
          </p>
        )}
      </div>

      {/* ── Picker modal ─────────────────────────────────────────────── */}
      {showPicker && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
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
              {/* Register new vehicle option at top */}
              <button
                type="button"
                onClick={() => { setShowPicker(false); setShowNewVehicleForm(true); }}
                className="w-full text-left px-4 py-3 border-b border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Icon name="PlusIcon" size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-blue-700">Registrar vehículo nuevo</p>
                  <p className="text-xs text-blue-500">Agregar un vehículo que no está en la lista</p>
                </div>
              </button>

              {filteredVehicles.length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400">
                  {vehicles.length === 0 ? 'No hay vehículos registrados aún' : 'Sin resultados'}
                </div>
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
          <select value={values?.nivel ?? ''} onChange={handle('nivel')} className="form-select">
            <option value="">Seleccionar</option>
            {niveles.map((n) => <option key={`nivel-${n}`} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Estado</label>
          <select value={values?.estado ?? ''} onChange={handle('estado')} className="form-select">
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
          <input type="tel" value={values?.telefono ?? ''} onChange={handle('telefono')} placeholder="Fijo" className="form-input" />
        </div>
        <div>
          <label className="form-label">Celular</label>
          <input type="tel" value={values?.celular ?? ''} onChange={handle('celular')} placeholder="Móvil" className="form-input" />
        </div>
      </div>

      <div>
        <label className="form-label">Inspector</label>
        <input value={values?.inspectorName ?? ''} onChange={handle('inspectorName')} placeholder="Nombre del inspector" className="form-input" />
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