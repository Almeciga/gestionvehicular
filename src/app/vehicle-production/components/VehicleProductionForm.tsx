'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '@/components/ui/AppIcon';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import type { DBMaterial, DBVehicleBrand } from '@/lib/db';
import { getOpenInspectionForVehicle, type Inspection } from '@/lib/store';

const statusLabels: Record<string, string> = {
  borrador: 'en borrador', activo: 'en proceso', pendiente_revision: 'en revisión',
  aprobado: 'aprobada', completado: 'completada', rechazado: 'rechazada',
};

interface MaterialRow {
  id: string;
  material_id?: string;
  nombre: string;
  cantidad: string;
  unidad: string;
  fotos: string[];
}

interface VehicleFormData {
  marca: string;
  modelo: string;
  color: string;
  placa: string;
  vin: string;
  propietario: string;
  fechaCreacion: string;
  cantidad_puestos: number;
  cantidad_ejes: number;
}

const colores = ['Blanco', 'Negro', 'Gris', 'Rojo', 'Azul', 'Verde', 'Plateado', 'Beige', 'Amarillo', 'Naranja', 'Otro'];

const generateMaterialId = (index: number) => `mat-new-${String(index).padStart(3, '0')}`;

interface VehicleProductionFormProps {
  vehicleId: string | null;
  onClose: () => void;
}

export default function VehicleProductionForm({ vehicleId, onClose }: VehicleProductionFormProps) {
  const [materials, setMaterials] = useState<MaterialRow[]>(
    vehicleId ? [] : [{ id: generateMaterialId(1), nombre: '', cantidad: '1', unidad: '', fotos: [] }]
  );
  const [catalogMaterials, setCatalogMaterials] = useState<DBMaterial[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingVehicle, setLoadingVehicle] = useState(!!vehicleId);
  const [saving, setSaving] = useState(false);
  const [expandedMat, setExpandedMat] = useState<string | null>(null);
  const [blockingInspection, setBlockingInspection] = useState<Inspection | null>(null);
  const { user } = useAuth();

  // Brand search state
  const [brands, setBrands] = useState<DBVehicleBrand[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [selectedBrandName, setSelectedBrandName] = useState('');
  const brandRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VehicleFormData>({
    defaultValues: {
      fechaCreacion: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      cantidad_puestos: 5,
      cantidad_ejes: 2,
    },
  });

  const watchedMarca = watch('marca');

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

  // Load brands from Supabase (with Dexie fallback)
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
        // fallback: use static list
        if (!cancelled) {
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
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load materials catalog
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { MaterialsRepo } = await import('@/lib/repositories');
      const all = await MaterialsRepo.getAll();
      if (!cancelled) setCatalogMaterials(all);
      setLoadingCatalog(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load existing vehicle data for edit mode
  useEffect(() => {
    if (!vehicleId) {
      setLoadingVehicle(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { VehiclesRepo } = await import('@/lib/repositories');
      const vehicle = await VehiclesRepo.getById(vehicleId);
      if (cancelled) return;
      if (!vehicle) {
        setLoadingVehicle(false);
        return;
      }
      reset({
        marca: vehicle.marca || '',
        modelo: vehicle.modelo || '',
        color: vehicle.color || '',
        placa: vehicle.placa || '',
        vin: vehicle.vin || '',
        propietario: vehicle.propietario || '',
        fechaCreacion: vehicle.fecha_creacion || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        cantidad_puestos: vehicle.cantidad_puestos ?? 5,
        cantidad_ejes: vehicle.cantidad_ejes ?? 2,
      });
      setSelectedBrandName(vehicle.marca || '');
      setBrandSearch(vehicle.marca || '');
      const existing = Array.isArray(vehicle.materials) ? (vehicle.materials as MaterialRow[]) : [];
      setMaterials(
        existing.map((m, idx) => ({
          id: m.id || generateMaterialId(idx + 1),
          material_id: m.material_id,
          nombre: m.nombre || '',
          cantidad: m.cantidad || '1',
          unidad: m.unidad || '',
          fotos: m.fotos || [],
        }))
      );
      setBlockingInspection(getOpenInspectionForVehicle(vehicleId));
      setLoadingVehicle(false);
    })();
    return () => { cancelled = true; };
  }, [vehicleId, reset]);

  const filteredBrands = brands.filter((b) =>
    !brandSearch.trim() || b.nombre.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const handleSelectBrand = (brand: DBVehicleBrand) => {
    setValue('marca', brand.nombre, { shouldValidate: true });
    setSelectedBrandName(brand.nombre);
    setBrandSearch(brand.nombre);
    setShowBrandDropdown(false);
  };

  const addMaterial = () => {
    const newId = generateMaterialId(materials.length + 1 + Date.now() % 1000);
    setMaterials((prev) => [...prev, { id: newId, nombre: '', cantidad: '1', unidad: '', fotos: [] }]);
    setExpandedMat(newId);
  };

  const removeMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMaterial = (id: string, field: keyof MaterialRow, value: string | string[]) => {
    setMaterials((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleSelectCatalogMaterial = (matRowId: string, catalogId: string) => {
    const catalogItem = catalogMaterials.find((c) => c.id === catalogId);
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === matRowId
          ? { ...m, material_id: catalogId || undefined, nombre: catalogItem?.nombre || '', unidad: catalogItem?.unidad || '' }
          : m
      )
    );
  };

  const onSubmit = async (data: VehicleFormData) => {
    if (blockingInspection) {
      toast.error('No se puede actualizar: este vehículo tiene una inspección en curso.');
      return;
    }
    const validMaterials = materials.filter((m) => m.material_id && m.nombre.trim() !== '');

    if (!data.placa && !data.vin) {
      toast.error('Se requiere al menos Placa o VIN para registrar el vehículo');
      return;
    }
    if (!data.marca) {
      toast.error('Selecciona la marca del vehículo');
      return;
    }

    setSaving(true);
    try {
      const { VehiclesRepo } = await import('@/lib/repositories');
      const { queryKeys, getQueryClient } = await import('@/lib/queryClient');

      const vehicleData = {
        marca: data.marca,
        modelo: data.modelo,
        color: data.color,
        placa: data.placa,
        vin: data.vin,
        propietario: data.propietario,
        fecha_creacion: data.fechaCreacion,
        cantidad_puestos: Number(data.cantidad_puestos),
        cantidad_ejes: Number(data.cantidad_ejes),
        materials: validMaterials as unknown[],
      };

      if (vehicleId) {
        await VehiclesRepo.update(vehicleId, vehicleData);
        toast.success('Vehículo actualizado correctamente');
      } else {
        const id = crypto.randomUUID();
        await VehiclesRepo.create({
          id,
          ...vehicleData,
          created_by: user?.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (!navigator.onLine) {
          toast.info('Sin conexión. El vehículo se sincronizará cuando vuelva la red.');
        } else {
          toast.success('Vehículo registrado en producción');
        }
      }
      getQueryClient().invalidateQueries({ queryKey: queryKeys.vehicles.all });
      onClose();
    } catch {
      toast.error('Error al guardar el vehículo. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1B4F72] text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
          <Icon name="XMarkIcon" size={22} className="text-white" />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-base">{vehicleId ? 'Editar Vehículo' : 'Nuevo Vehículo en Producción'}</h2>
          <p className="text-xs text-white/70">Complete todos los campos del vehículo</p>
        </div>
      </div>

      {loadingVehicle ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
          {blockingInspection && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2">
              <Icon name="LockClosedIcon" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-700">
                Este vehículo tiene una inspección {statusLabels[blockingInspection.status] || blockingInspection.status} en curso
                ({blockingInspection.enterpriseId || blockingInspection.id}) — no se puede editar hasta que esa inspección se finalice o archive.
              </p>
            </div>
          )}
          <fieldset disabled={!!blockingInspection} className="px-4 py-4 max-w-screen-2xl mx-auto space-y-5 border-0 m-0 disabled:opacity-60">

            {/* Datos del Vehículo */}
            <div className="card p-4 space-y-4">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Icon name="TruckIcon" size={18} className="text-[#1B4F72]" />
                Datos del Vehículo
              </h3>

              {/* Brand search with autocomplete */}
              <div ref={brandRef} className="relative">
                <label className="form-label">Marca *</label>
                <input
                  type="text"
                  value={brandSearch}
                  onChange={(e) => {
                    setBrandSearch(e.target.value);
                    setValue('marca', e.target.value, { shouldValidate: true });
                    setSelectedBrandName(e.target.value);
                    setShowBrandDropdown(true);
                  }}
                  onFocus={() => setShowBrandDropdown(true)}
                  placeholder="Buscar marca..."
                  className="form-input"
                  autoComplete="off"
                />
                {/* Hidden input for react-hook-form */}
                <input type="hidden" {...register('marca', { required: 'Requerido' })} />
                {errors.marca && <p className="text-xs text-red-500 mt-1">{errors.marca.message}</p>}
                {showBrandDropdown && filteredBrands.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {filteredBrands.slice(0, 30).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleSelectBrand(b)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm flex items-center justify-between border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-800">{b.nombre}</span>
                        <span className="text-xs text-gray-400 capitalize">{b.categoria}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedBrandName && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Icon name="CheckCircleIcon" size={12} className="text-green-500" />
                    Marca seleccionada: {selectedBrandName}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label">Modelo *</label>
                <input
                  {...register('modelo', { required: 'Requerido' })}
                  placeholder="Ej: Hilux 4x4"
                  className="form-input"
                />
                {errors.modelo && <p className="text-xs text-red-500 mt-1">{errors.modelo.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Color *</label>
                  <select {...register('color', { required: 'Requerido' })} className="form-select">
                    <option value="">Seleccionar</option>
                    {colores.map((c) => <option key={`prod-color-${c}`} value={c}>{c}</option>)}
                  </select>
                  {errors.color && <p className="text-xs text-red-500 mt-1">{errors.color.message}</p>}
                </div>
                <div>
                  <label className="form-label">Placa</label>
                  <input
                    {...register('placa', { pattern: { value: /^[A-Za-z]{3}-\d{3}$/, message: 'Formato: ABC-123' } })}
                    placeholder="ABC-123"
                    className="form-input uppercase"
                  />
                  {errors.placa && <p className="text-xs text-red-500 mt-1">{errors.placa.message}</p>}
                </div>
              </div>

              <div>
                <label className="form-label">VIN / Chasis</label>
                <p className="text-xs text-gray-400 mb-1">Número de identificación vehicular (17 caracteres). Requerido si no se ingresa Placa.</p>
                <input
                  {...register('vin', { minLength: { value: 17, message: 'El VIN debe tener 17 caracteres' } })}
                  placeholder="Ej: 9BWZZZ377VT004251"
                  className="form-input uppercase tracking-wider"
                  maxLength={17}
                />
                {errors.vin && <p className="text-xs text-red-500 mt-1">{errors.vin.message}</p>}
              </div>

              <div>
                <label className="form-label">Propietario *</label>
                <input
                  {...register('propietario', { required: 'Requerido' })}
                  placeholder="Nombre completo del propietario"
                  className="form-input"
                />
                {errors.propietario && <p className="text-xs text-red-500 mt-1">{errors.propietario.message}</p>}
              </div>

              {/* Seats and axles — required fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Cantidad de Puestos *</label>
                  <p className="text-xs text-gray-400 mb-1">Número de pasajeros (incluye conductor)</p>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    {...register('cantidad_puestos', {
                      required: 'Requerido',
                      min: { value: 1, message: 'Mínimo 1' },
                      max: { value: 120, message: 'Máximo 120' },
                      valueAsNumber: true,
                    })}
                    className="form-input"
                  />
                  {errors.cantidad_puestos && <p className="text-xs text-red-500 mt-1">{errors.cantidad_puestos.message}</p>}
                </div>
                <div>
                  <label className="form-label">Cantidad de Ejes *</label>
                  <p className="text-xs text-gray-400 mb-1">Número de ejes del vehículo</p>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    {...register('cantidad_ejes', {
                      required: 'Requerido',
                      min: { value: 2, message: 'Mínimo 2' },
                      max: { value: 10, message: 'Máximo 10' },
                      valueAsNumber: true,
                    })}
                    className="form-input"
                  />
                  {errors.cantidad_ejes && <p className="text-xs text-red-500 mt-1">{errors.cantidad_ejes.message}</p>}
                </div>
              </div>

              {/* Diagram preview hint */}
              {watch('cantidad_puestos') && watch('cantidad_ejes') && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                  <Icon name="InformationCircleIcon" size={16} className="text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    {(() => {
                      const { getInspectionDiagramConfig } = require('@/lib/inspectionDiagram');
                      const cfg = getInspectionDiagramConfig(
                        Number(watch('cantidad_puestos')),
                        Number(watch('cantidad_ejes'))
                      );
                      return `Tipo: ${cfg.vehicleType} · ${cfg.tireCount} neumáticos · ${cfg.axleCount} ejes`;
                    })()}
                  </p>
                </div>
              )}

              <div>
                <label className="form-label">Fecha de Creación</label>
                <input {...register('fechaCreacion')} className="form-input" />
              </div>
            </div>

            {/* Materiales */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Icon name="CubeIcon" size={18} className="text-[#1B4F72]" />
                  Materiales Utilizados
                  <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">
                    {materials.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#1B4F72] text-white rounded-xl text-sm font-semibold active:scale-95 transition-all"
                >
                  <Icon name="PlusIcon" size={16} className="text-white" />
                  Agregar
                </button>
              </div>

              {!loadingCatalog && catalogMaterials.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  <p className="text-xs text-amber-700 font-semibold">
                    No hay materiales en el catálogo todavía. Agrégalos primero en la sección &quot;Materiales&quot;.
                  </p>
                </div>
              )}

              {materials.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <Icon name="CubeIcon" size={36} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-semibold">Sin materiales agregados</p>
                  <button type="button" onClick={addMaterial} className="mt-3 text-sm text-[#1B4F72] font-bold underline">
                    Agregar primer material
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {materials.map((mat, idx) => (
                  <div key={mat.id} className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => setExpandedMat(expandedMat === mat.id ? null : mat.id)}
                    >
                      <div className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">
                          {mat.nombre || 'Sin material seleccionado'}
                        </p>
                        <p className="text-xs text-gray-400">{mat.cantidad} {mat.unidad} · {mat.fotos.length} foto(s)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeMaterial(mat.id); }}
                          className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                        >
                          <Icon name="XMarkIcon" size={14} className="text-red-500" />
                        </button>
                        <span className="text-xs text-gray-300">{expandedMat === mat.id ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {expandedMat === mat.id && (
                      <div className="px-3 pb-4 space-y-3 border-t border-gray-100 pt-3 bg-white">
                        <div>
                          <label className="form-label">Material del Catálogo *</label>
                          <select
                            value={mat.material_id || ''}
                            onChange={(e) => handleSelectCatalogMaterial(mat.id, e.target.value)}
                            className="form-select"
                          >
                            <option value="">Seleccionar material</option>
                            {mat.material_id && !catalogMaterials.some((c) => c.id === mat.material_id) && (
                              <option value={mat.material_id} disabled>
                                {mat.nombre} (ya no está en el catálogo)
                              </option>
                            )}
                            {catalogMaterials.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre} — {c.stock} {c.unidad} disponibles
                              </option>
                            ))}
                          </select>
                          {loadingCatalog && <p className="text-xs text-gray-400 mt-1">Cargando catálogo...</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="form-label">Cantidad Usada *</label>
                            <input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={mat.cantidad}
                              onChange={(e) => updateMaterial(mat.id, 'cantidad', e.target.value)}
                              className="form-input"
                            />
                          </div>
                          <div>
                            <label className="form-label">Unidad</label>
                            <div className="form-input bg-gray-50 text-gray-500 flex items-center">
                              {mat.unidad || '—'}
                            </div>
                          </div>
                        </div>
                        <PhotoUpload
                          photos={mat.fotos}
                          onChange={(fotos) => updateMaterial(mat.id, 'fotos', fotos)}
                          label="Fotos del material"
                          maxPhotos={4}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="h-4" />
          </fieldset>
        </form>
      )}

      {/* Save bar */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
          Cancelar
        </button>
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={saving || loadingVehicle || !!blockingInspection}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-60"
        >
          {saving ? (
            <>
              <Icon name="ArrowPathIcon" size={18} className="text-white animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Icon name="CheckCircleIcon" size={18} className="text-white" />
              {vehicleId ? 'Actualizar Vehículo' : 'Registrar Vehículo'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}