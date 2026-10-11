'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { DBTrabajo, DBVehicle, DBMaterial, DBHerramienta } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialRow {
  material_id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
}

interface HerramientaRow {
  herramienta_id: string;
  nombre: string;
}

interface TrabajoFormData {
  descripcion: string;
  parte_vehiculo: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'pendiente' | 'en_ejecucion' | 'finalizado';
  responsable: string;
  observaciones: string;
  materiales: MaterialRow[];
  herramientas: HerramientaRow[];
}

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-amber-600', bg: 'bg-amber-100', icon: 'ClockIcon' },
  en_ejecucion: { label: 'En Ejecución', color: 'text-blue-600', bg: 'bg-blue-100', icon: 'WrenchScrewdriverIcon' },
  finalizado: { label: 'Finalizado', color: 'text-green-600', bg: 'bg-green-100', icon: 'CheckCircleIcon' },
};

const PARTES_VEHICULO = [
  'Motor', 'Transmisión', 'Frenos', 'Suspensión', 'Dirección', 'Sistema eléctrico',
  'Carrocería / Latonería', 'Pintura', 'Neumáticos', 'Escape', 'Refrigeración',
  'Combustible', 'Aire acondicionado', 'Vidrios', 'Interior', 'Otro',
];

interface TrabajoFormProps {
  vehicleId: string;
  trabajo?: DBTrabajo | null;
  onSave: () => void;
  onCancel: () => void;
}

function TrabajoForm({ vehicleId, trabajo, onSave, onCancel }: TrabajoFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<DBMaterial[]>([]);
  const [catalogHerramientas, setCatalogHerramientas] = useState<DBHerramienta[]>([]);
  const [form, setForm] = useState<TrabajoFormData>({
    descripcion: trabajo?.descripcion || '',
    parte_vehiculo: trabajo?.parte_vehiculo || '',
    fecha_inicio: trabajo?.fecha_inicio || new Date().toISOString().split('T')[0],
    fecha_fin: trabajo?.fecha_fin || '',
    estado: trabajo?.estado || 'pendiente',
    responsable: trabajo?.responsable || '',
    observaciones: trabajo?.observaciones || '',
    materiales: (trabajo?.materiales as MaterialRow[]) || [],
    herramientas: (trabajo?.herramientas as HerramientaRow[]) || [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const [matRes, herRes] = await Promise.all([
          supabase.from('materials').select('id,nombre,categoria,unidad,stock').order('nombre'),
          supabase.from('herramientas').select('id,nombre,categoria,estado').eq('activo', true).order('nombre'),
        ]);
        if (!cancelled) {
          if (matRes.data) setCatalogMaterials(matRes.data as DBMaterial[]);
          if (herRes.data) setCatalogHerramientas(herRes.data as DBHerramienta[]);
        }
      } catch {
        // silently fail — catalog is optional
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (field: keyof TrabajoFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const addMaterial = () => {
    set('materiales', [...form.materiales, { material_id: '', nombre: '', cantidad: 1, unidad: '' }]);
  };

  const removeMaterial = (idx: number) => {
    set('materiales', form.materiales.filter((_, i) => i !== idx));
  };

  const updateMaterial = (idx: number, field: keyof MaterialRow, value: string | number) => {
    const updated = form.materiales.map((m, i) => i === idx ? { ...m, [field]: value } : m);
    set('materiales', updated);
  };

  const handleSelectMaterial = (idx: number, materialId: string) => {
    const cat = catalogMaterials.find((c) => c.id === materialId);
    const updated = form.materiales.map((m, i) =>
      i === idx ? { ...m, material_id: materialId, nombre: cat?.nombre || '', unidad: cat?.unidad || '' } : m
    );
    set('materiales', updated);
  };

  const addHerramienta = () => {
    set('herramientas', [...form.herramientas, { herramienta_id: '', nombre: '' }]);
  };

  const removeHerramienta = (idx: number) => {
    set('herramientas', form.herramientas.filter((_, i) => i !== idx));
  };

  const handleSelectHerramienta = (idx: number, herramientaId: string) => {
    const cat = catalogHerramientas.find((c) => c.id === herramientaId);
    const updated = form.herramientas.map((h, i) =>
      i === idx ? { herramienta_id: herramientaId, nombre: cat?.nombre || '' } : h
    );
    set('herramientas', updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descripcion.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }
    if (!form.fecha_inicio) {
      toast.error('La fecha de inicio es obligatoria');
      return;
    }
    if (form.fecha_fin && form.fecha_fin < form.fecha_inicio) {
      toast.error('La fecha de fin debe ser igual o posterior a la fecha de inicio');
      return;
    }

    setSaving(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const payload = {
        vehicle_id: vehicleId,
        descripcion: form.descripcion.trim(),
        parte_vehiculo: form.parte_vehiculo || null,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || null,
        estado: form.estado,
        responsable: form.responsable.trim() || null,
        observaciones: form.observaciones.trim() || null,
        materiales: form.materiales.filter((m) => m.material_id),
        herramientas: form.herramientas.filter((h) => h.herramienta_id),
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };

      if (trabajo?.id) {
        const { error } = await supabase.from('trabajos').update(payload).eq('id', trabajo.id);
        if (error) throw error;
        toast.success('Trabajo actualizado');
      } else {
        const { error } = await supabase.from('trabajos').insert(payload);
        if (error) throw error;
        toast.success('Trabajo registrado');
      }
      onSave();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {/* Descripción */}
      <div>
        <label className="form-label">Descripción del trabajo *</label>
        <textarea
          value={form.descripcion}
          onChange={(e) => set('descripcion', e.target.value)}
          placeholder="¿Qué se va a hacer?"
          rows={3}
          className="form-input resize-none"
          required
        />
      </div>

      {/* Parte del vehículo */}
      <div>
        <label className="form-label">Parte del vehículo</label>
        <select value={form.parte_vehiculo} onChange={(e) => set('parte_vehiculo', e.target.value)} className="form-select">
          <option value="">Seleccionar parte</option>
          {PARTES_VEHICULO.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Fecha de inicio *</label>
          <input
            type="date"
            value={form.fecha_inicio}
            onChange={(e) => set('fecha_inicio', e.target.value)}
            className="form-input"
            required
          />
        </div>
        <div>
          <label className="form-label">Fecha de fin</label>
          <input
            type="date"
            value={form.fecha_fin}
            onChange={(e) => set('fecha_fin', e.target.value)}
            min={form.fecha_inicio}
            className="form-input"
          />
        </div>
      </div>

      {/* Estado */}
      <div>
        <label className="form-label">Estado *</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ESTADO_CONFIG) as Array<keyof typeof ESTADO_CONFIG>).map((est) => {
            const cfg = ESTADO_CONFIG[est];
            return (
              <button
                key={est}
                type="button"
                onClick={() => set('estado', est)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                  form.estado === est
                    ? `${cfg.bg} ${cfg.color} border-current`
                    : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Responsable */}
      <div>
        <label className="form-label">Responsable</label>
        <input
          type="text"
          value={form.responsable}
          onChange={(e) => set('responsable', e.target.value)}
          placeholder="Nombre del técnico responsable"
          className="form-input"
        />
      </div>

      {/* Materiales */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Materiales</label>
          <button type="button" onClick={addMaterial} className="text-xs text-[#1B4F72] font-bold flex items-center gap-1">
            <Icon name="PlusIcon" size={14} className="text-[#1B4F72]" />
            Agregar
          </button>
        </div>
        {form.materiales.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Sin materiales asignados</p>
        ) : (
          <div className="space-y-2">
            {form.materiales.map((mat, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={mat.material_id}
                  onChange={(e) => handleSelectMaterial(idx, e.target.value)}
                  className="form-select flex-1 text-xs"
                >
                  <option value="">Seleccionar material</option>
                  {catalogMaterials.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.unidad})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={mat.cantidad}
                  onChange={(e) => updateMaterial(idx, 'cantidad', parseFloat(e.target.value))}
                  className="form-input w-20 text-xs"
                  placeholder="Cant."
                />
                <span className="text-xs text-gray-400 w-12 truncate">{mat.unidad}</span>
                <button type="button" onClick={() => removeMaterial(idx)} className="p-1 text-red-400 hover:text-red-600">
                  <Icon name="XMarkIcon" size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Herramientas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="form-label mb-0">Herramientas</label>
          <button type="button" onClick={addHerramienta} className="text-xs text-[#1B4F72] font-bold flex items-center gap-1">
            <Icon name="PlusIcon" size={14} className="text-[#1B4F72]" />
            Agregar
          </button>
        </div>
        {form.herramientas.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Sin herramientas asignadas</p>
        ) : (
          <div className="space-y-2">
            {form.herramientas.map((her, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={her.herramienta_id}
                  onChange={(e) => handleSelectHerramienta(idx, e.target.value)}
                  className="form-select flex-1 text-xs"
                >
                  <option value="">Seleccionar herramienta</option>
                  {catalogHerramientas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.categoria})</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeHerramienta(idx)} className="p-1 text-red-400 hover:text-red-600">
                  <Icon name="XMarkIcon" size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <label className="form-label">Observaciones</label>
        <textarea
          value={form.observaciones}
          onChange={(e) => set('observaciones', e.target.value)}
          placeholder="Notas adicionales..."
          rows={2}
          className="form-input resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-3 text-sm">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm disabled:opacity-60"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon name="CheckCircleIcon" size={16} className="text-white" />
          )}
          {trabajo ? 'Actualizar' : 'Registrar Trabajo'}
        </button>
      </div>
    </form>
  );
}

// ─── Main TrabajosView ────────────────────────────────────────────────────────

interface TrabajosViewProps {
  vehicleId: string;
  vehicle?: DBVehicle | null;
}

export default function TrabajosView({ vehicleId, vehicle }: TrabajosViewProps) {
  const [trabajos, setTrabajos] = useState<DBTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTrabajo, setEditingTrabajo] = useState<DBTrabajo | null>(null);
  const [filterEstado, setFilterEstado] = useState<string>('todos');

  const loadTrabajos = useCallback(async () => {
    setLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data, error } = await supabase
        .from('trabajos')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setTrabajos((data || []) as DBTrabajo[]);
    } catch (err) {
      console.error('[TrabajosView] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    loadTrabajos();
  }, [loadTrabajos]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este trabajo?')) return;
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.from('trabajos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Trabajo eliminado');
      loadTrabajos();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const filtered = filterEstado === 'todos'
    ? trabajos
    : trabajos.filter((t) => t.estado === filterEstado);

  if (showForm) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-[#1B4F72] text-white px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setShowForm(false); setEditingTrabajo(null); }} className="p-1.5 rounded-lg hover:bg-white/10">
            <Icon name="ArrowLeftIcon" size={18} className="text-white" />
          </button>
          <h3 className="font-bold text-sm">{editingTrabajo ? 'Editar Trabajo' : 'Nuevo Trabajo'}</h3>
        </div>
        <TrabajoForm
          vehicleId={vehicleId}
          trabajo={editingTrabajo}
          onSave={() => { setShowForm(false); setEditingTrabajo(null); loadTrabajos(); }}
          onCancel={() => { setShowForm(false); setEditingTrabajo(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800">Trabajos</h3>
          {vehicle && (
            <p className="text-xs text-gray-500">{vehicle.marca} {vehicle.modelo} — {vehicle.placa}</p>
          )}
        </div>
        <button
          onClick={() => { setEditingTrabajo(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#1B4F72] text-white rounded-xl text-sm font-semibold active:scale-95 transition-all"
        >
          <Icon name="PlusIcon" size={16} className="text-white" />
          Nuevo
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['todos', 'pendiente', 'en_ejecucion', 'finalizado'].map((est) => {
          const cfg = est === 'todos'
            ? { label: 'Todos', color: 'text-gray-600', bg: 'bg-gray-100' }
            : ESTADO_CONFIG[est as keyof typeof ESTADO_CONFIG];
          return (
            <button
              key={est}
              onClick={() => setFilterEstado(est)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                filterEstado === est ? `${cfg.bg} ${cfg.color} ring-2 ring-current ring-offset-1` : 'bg-gray-50 text-gray-500'
              }`}
            >
              {cfg.label}
              {est !== 'todos' && (
                <span className="ml-1 opacity-70">
                  ({trabajos.filter((t) => t.estado === est).length})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
          <Icon name="WrenchScrewdriverIcon" size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            {filterEstado === 'todos' ? 'Sin trabajos registrados' : `Sin trabajos ${ESTADO_CONFIG[filterEstado as keyof typeof ESTADO_CONFIG]?.label?.toLowerCase()}`}
          </p>
          <button
            onClick={() => { setEditingTrabajo(null); setShowForm(true); }}
            className="mt-3 text-sm text-[#1B4F72] font-bold underline"
          >
            Registrar primer trabajo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((trabajo) => {
            const cfg = ESTADO_CONFIG[trabajo.estado];
            const mats = (trabajo.materiales as MaterialRow[]) || [];
            const hers = (trabajo.herramientas as HerramientaRow[]) || [];
            return (
              <div key={trabajo.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <Icon name={cfg.icon as any} size={11} className={cfg.color} />
                        {cfg.label}
                      </span>
                      {trabajo.parte_vehiculo && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{trabajo.parte_vehiculo}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2">{trabajo.descripcion}</p>
                    {trabajo.responsable && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Icon name="UserIcon" size={11} className="text-gray-400" />
                        {trabajo.responsable}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Icon name="CalendarIcon" size={11} className="text-gray-400" />
                        {new Date(trabajo.fecha_inicio).toLocaleDateString('es-ES')}
                        {trabajo.fecha_fin && ` → ${new Date(trabajo.fecha_fin).toLocaleDateString('es-ES')}`}
                      </span>
                      {mats.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Icon name="CubeIcon" size={11} className="text-gray-400" />
                          {mats.length} mat.
                        </span>
                      )}
                      {hers.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Icon name="WrenchIcon" size={11} className="text-gray-400" />
                          {hers.length} herr.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => { setEditingTrabajo(trabajo); setShowForm(true); }}
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Icon name="PencilIcon" size={14} className="text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(trabajo.id)}
                      className="p-2 rounded-xl bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <Icon name="TrashIcon" size={14} className="text-red-500" />
                    </button>
                  </div>
                </div>
                {trabajo.observaciones && (
                  <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2 italic">
                    {trabajo.observaciones}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
