'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { MaterialsRepo } from '@/lib/repositories';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

type CategoriaType = 'Pintura' | 'Mecánica' | 'Carrocería' | 'Eléctrico' | 'Interior' | 'Consumibles';

interface Material {
  id: string;
  nombre: string;
  categoria: CategoriaType;
  unidad: string;
  stock: number;
  stockMinimo: number;
  descripcion: string;
}

interface MaterialFormData {
  nombre: string;
  categoria: CategoriaType;
  unidad: string;
  stock: number;
  stockMinimo: number;
  descripcion: string;
}

const categorias: CategoriaType[] = ['Pintura', 'Mecánica', 'Carrocería', 'Eléctrico', 'Interior', 'Consumibles'];
const unidades = ['Litros', 'Metros', 'Kilogramos', 'Unidad', 'Galones', 'Piezas', 'Juego', 'Tubos', 'Rollos'];

interface MaterialFormProps {
  material: Material | null;
  onClose: () => void;
  createdBy?: string;
}

export default function MaterialForm({ material, onClose, createdBy }: MaterialFormProps) {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MaterialFormData>({
    defaultValues: material
      ? {
        nombre: material.nombre,
        categoria: material.categoria,
        unidad: material.unidad,
        stock: material.stock,
        stockMinimo: material.stockMinimo,
        descripcion: material.descripcion,
      }
      : {
        categoria: 'Consumibles',
        unidad: 'Unidad',
        stock: 0,
        stockMinimo: 5,
      },
  });

  const onSubmit = async (data: MaterialFormData) => {
    setSaving(true);
    try {
      if (material) {
        // Update in IndexedDB + enqueue for Supabase sync
        await MaterialsRepo.update(material.id, {
          nombre: data.nombre,
          categoria: data.categoria,
          unidad: data.unidad,
          stock: data.stock,
          stock_minimo: data.stockMinimo,
          descripcion: data.descripcion,
        });
        toast.success('Material actualizado correctamente');
      } else {
        // Create in IndexedDB + enqueue for Supabase sync
        // NOTE: materials.id in Supabase is of type uuid — must use a valid UUID,
        // not a custom string, or Supabase rejects the insert with 400.
        const id = crypto.randomUUID();
        await MaterialsRepo.create({
          id,
          nombre: data.nombre,
          categoria: data.categoria,
          unidad: data.unidad,
          stock: data.stock,
          stock_minimo: data.stockMinimo,
          descripcion: data.descripcion,
          created_by: createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        toast.success('Material agregado al catálogo');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
      onClose();
    } catch (err: unknown) {
      toast.error('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-modal max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">
            {material ? 'Editar Material' : 'Nuevo Material'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <Icon name="XMarkIcon" size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="form-label">Nombre del Material *</label>
            <input
              {...register('nombre', { required: 'El nombre es requerido' })}
              placeholder="Ej: Pintura base epóxica"
              className="form-input"
            />
            {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre.message}</p>}
          </div>

          <div>
            <label className="form-label">Descripción</label>
            <textarea
              {...register('descripcion')}
              placeholder="Descripción breve del material y su uso"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B4F72] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Categoría *</label>
              <select {...register('categoria', { required: 'Requerido' })} className="form-select">
                {categorias.map((c) => <option key={`form-cat-${c}`} value={c}>{c}</option>)}
              </select>
              {errors.categoria && <p className="text-xs text-red-500 mt-1">{errors.categoria.message}</p>}
            </div>
            <div>
              <label className="form-label">Unidad *</label>
              <select {...register('unidad', { required: 'Requerido' })} className="form-select">
                {unidades.map((u) => <option key={`form-unit-${u}`} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Stock Actual *</label>
              <p className="text-xs text-gray-400 mb-1">Cantidad disponible ahora</p>
              <input
                {...register('stock', { required: 'Requerido', min: { value: 0, message: 'Mínimo 0' } })}
                type="number"
                min="0"
                step="1"
                className="form-input"
              />
              {errors.stock && <p className="text-xs text-red-500 mt-1">{errors.stock.message}</p>}
            </div>
            <div>
              <label className="form-label">Stock Mínimo *</label>
              <p className="text-xs text-gray-400 mb-1">Alerta cuando baje de este nivel</p>
              <input
                {...register('stockMinimo', { required: 'Requerido', min: { value: 1, message: 'Mínimo 1' } })}
                type="number"
                min="1"
                step="1"
                className="form-input"
              />
              {errors.stockMinimo && <p className="text-xs text-red-500 mt-1">{errors.stockMinimo.message}</p>}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Icon name="ArrowPathIcon" size={16} className="text-white animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={16} className="text-white" />
                {material ? 'Actualizar' : 'Agregar Material'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}