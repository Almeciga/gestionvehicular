'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { POCatalogRepo } from '@/lib/repositories';
import { createClient } from '@/lib/supabase/client';
import {
  type DBPOCliente,
  type DBPOCatalogItem,
  type DBPOPiezaVidrio,
} from '@/lib/db';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

type TabId = 'clientes' | 'modelos' | 'niveles' | 'formasPago' | 'incoterms' | 'piezas' | 'marcaciones';

const TABS: { id: TabId; label: string }[] = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'modelos', label: 'Modelos' },
  { id: 'niveles', label: 'Niveles NIJ' },
  { id: 'formasPago', label: 'Formas de Pago' },
  { id: 'incoterms', label: 'Incoterms' },
  { id: 'piezas', label: 'Piezas' },
  { id: 'marcaciones', label: 'Marcaciones' },
];

interface EditState {
  id?: string;
  nombre: string;
  pais?: string;
  codigo?: string;
  abreviatura?: string;
  activo: boolean;
}

const EMPTY_EDIT: EditState = { nombre: '', activo: true };

export default function POCatalogsView() {
  const { isAdmin, isComercial, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('clientes');
  const [clientes, setClientes] = useState<DBPOCliente[]>([]);
  const [modelos, setModelos] = useState<DBPOCatalogItem[]>([]);
  const [niveles, setNiveles] = useState<DBPOCatalogItem[]>([]);
  const [formasPago, setFormasPago] = useState<DBPOCatalogItem[]>([]);
  const [incoterms, setIncoterms] = useState<DBPOCatalogItem[]>([]);
  const [piezas, setPiezas] = useState<DBPOPiezaVidrio[]>([]);
  const [marcaciones, setMarcaciones] = useState<DBPOCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin && !isComercial) {
      router.replace('/production-orders');
    }
  }, [authLoading, isAdmin, isComercial, router]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [c, m, n, f, i, p, t] = await Promise.all([
        supabase.from('po_clientes').select('*').order('nombre'),
        supabase.from('po_modelos_vehiculo').select('*').order('orden'),
        supabase.from('po_niveles_nij').select('*').order('orden'),
        supabase.from('po_formas_pago').select('*').order('orden'),
        supabase.from('po_incoterms').select('*').order('orden'),
        supabase.from('po_piezas_vidrio').select('*').order('orden'),
        supabase.from('po_tipos_marcacion').select('*').order('orden'),
      ]);
      setClientes((c.data ?? []) as DBPOCliente[]);
      setModelos((m.data ?? []) as DBPOCatalogItem[]);
      setNiveles((n.data ?? []) as DBPOCatalogItem[]);
      setFormasPago((f.data ?? []) as DBPOCatalogItem[]);
      setIncoterms((i.data ?? []) as DBPOCatalogItem[]);
      setPiezas((p.data ?? []) as DBPOPiezaVidrio[]);
      setMarcaciones((t.data ?? []) as DBPOCatalogItem[]);

      // Also update IndexedDB cache
      await POCatalogRepo.bulkUpsertCatalogs({
        clientes: (c.data ?? []) as DBPOCliente[],
        modelos: (m.data ?? []) as DBPOCatalogItem[],
        niveles: (n.data ?? []) as DBPOCatalogItem[],
        formasPago: (f.data ?? []) as DBPOCatalogItem[],
        incoterms: (i.data ?? []) as DBPOCatalogItem[],
        piezas: (p.data ?? []) as DBPOPiezaVidrio[],
        marcaciones: (t.data ?? []) as DBPOCatalogItem[],
      });
    } catch {
      toast.error('Error al cargar catálogos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (isAdmin || isComercial)) {
      loadAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin, isComercial]);

  const getCurrentItems = (): (DBPOCliente | DBPOCatalogItem | DBPOPiezaVidrio)[] => {
    const q = search.toLowerCase();
    const filter = <T extends { nombre: string }>(items: T[]): T[] =>
      q ? items.filter((i) => i.nombre.toLowerCase().includes(q)) : items;
    switch (activeTab) {
      case 'clientes': return filter(clientes);
      case 'modelos': return filter(modelos);
      case 'niveles': return filter(niveles);
      case 'formasPago': return filter(formasPago);
      case 'incoterms': return filter(incoterms);
      case 'piezas': return filter(piezas);
      case 'marcaciones': return filter(marcaciones);
    }
  };

  const handleNew = () => {
    setEdit(EMPTY_EDIT);
    setShowForm(true);
  };

  const handleEdit = (item: DBPOCliente | DBPOCatalogItem | DBPOPiezaVidrio) => {
    setEdit({
      id: item.id,
      nombre: item.nombre,
      activo: item.activo,
      pais: (item as DBPOCliente).pais ?? undefined,
      codigo: (item as DBPOPiezaVidrio).codigo ?? undefined,
      abreviatura: (item as DBPOPiezaVidrio).abreviatura ?? undefined,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (item: DBPOCliente | DBPOCatalogItem | DBPOPiezaVidrio) => {
    try {
      const supabase = createClient();
      const tableMap: Record<TabId, string> = {
        clientes: 'po_clientes',
        modelos: 'po_modelos_vehiculo',
        niveles: 'po_niveles_nij',
        formasPago: 'po_formas_pago',
        incoterms: 'po_incoterms',
        piezas: 'po_piezas_vidrio',
        marcaciones: 'po_tipos_marcacion',
      };
      const { error } = await supabase
        .from(tableMap[activeTab])
        .update({ activo: !item.activo })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(item.activo ? 'Elemento desactivado' : 'Elemento activado');
      await loadAll();
      queryClient.invalidateQueries({ queryKey: queryKeys.poCatalogs.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit.nombre.trim()) { toast.error('El nombre es requerido'); return; }
    if (activeTab === 'clientes' && !edit.pais?.trim()) { toast.error('El país es requerido para clientes'); return; }
    if (activeTab === 'piezas' && !edit.codigo?.trim()) { toast.error('El código es requerido'); return; }
    if (activeTab === 'piezas' && !edit.abreviatura?.trim()) { toast.error('La abreviatura es requerida'); return; }

    setSaving(true);
    try {
      const supabase = createClient();
      const tableMap: Record<TabId, string> = {
        clientes: 'po_clientes',
        modelos: 'po_modelos_vehiculo',
        niveles: 'po_niveles_nij',
        formasPago: 'po_formas_pago',
        incoterms: 'po_incoterms',
        piezas: 'po_piezas_vidrio',
        marcaciones: 'po_tipos_marcacion',
      };

      const payload: Record<string, unknown> = {
        nombre: edit.nombre.trim(),
        activo: edit.activo,
      };
      if (activeTab === 'clientes') payload.pais = edit.pais?.trim() || null;
      if (activeTab === 'piezas') {
        payload.codigo = edit.codigo?.trim();
        payload.abreviatura = edit.abreviatura?.trim();
      }

      if (edit.id) {
        const { error } = await supabase.from(tableMap[activeTab]).update(payload).eq('id', edit.id);
        if (error) throw error;
        toast.success('Elemento actualizado');
      } else {
        const { error } = await supabase.from(tableMap[activeTab]).insert(payload);
        if (error) throw error;
        toast.success('Elemento creado');
      }

      setShowForm(false);
      setEdit(EMPTY_EDIT);
      await loadAll();
      queryClient.invalidateQueries({ queryKey: queryKeys.poCatalogs.all });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('Ya existe un elemento con ese nombre');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const items = getCurrentItems();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isComercial) return null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.push('/production-orders')}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Catálogos</h1>
          <p className="text-sm text-gray-500">Órdenes de Producción</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); }}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-[#1B4F72] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + New */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
        </div>
        <button onClick={handleNew} className="btn-primary flex items-center gap-2">
          <Icon name="PlusIcon" size={16} className="text-white" />
          <span className="hidden sm:inline">Nuevo</span>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Items list */}
      {!loading && (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="card p-10 text-center">
              <Icon name="InboxIcon" size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-semibold">Sin elementos</p>
            </div>
          )}
          {items.map((item) => {
            const isCliente = activeTab === 'clientes';
            const isPieza = activeTab === 'piezas';
            const cliente = item as DBPOCliente;
            const pieza = item as DBPOPiezaVidrio;

            return (
              <div key={item.id} className={`card p-3 flex items-center gap-3 ${!item.activo ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{item.nombre}</span>
                    {isCliente && !cliente.pais && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Sin país</span>
                    )}
                    {isPieza && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{pieza.codigo}</span>
                    )}
                    {!item.activo && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                    )}
                  </div>
                  {isCliente && cliente.pais && (
                    <p className="text-xs text-gray-500 mt-0.5">{cliente.pais}</p>
                  )}
                  {isPieza && (
                    <p className="text-xs text-gray-500 mt-0.5">{pieza.abreviatura}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <Icon name="PencilIcon" size={14} className="text-gray-600" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={`p-2 rounded-xl transition-colors ${
                      item.activo ? 'hover:bg-red-50' : 'hover:bg-green-50'
                    }`}
                  >
                    <Icon
                      name={item.activo ? 'EyeSlashIcon' : 'EyeIcon'}
                      size={14}
                      className={item.activo ? 'text-red-500' : 'text-green-600'}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">{edit.id ? 'Editar' : 'Nuevo'} elemento</h3>
              <button onClick={() => { setShowForm(false); setEdit(EMPTY_EDIT); }} className="p-2 rounded-xl hover:bg-gray-100">
                <Icon name="XMarkIcon" size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={edit.nombre}
                  onChange={(e) => setEdit((s) => ({ ...s, nombre: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                  placeholder="Nombre del elemento"
                />
              </div>
              {activeTab === 'clientes' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">País de Origen *</label>
                  <input
                    type="text"
                    value={edit.pais ?? ''}
                    onChange={(e) => setEdit((s) => ({ ...s, pais: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                    placeholder="Ej: COLOMBIA"
                  />
                </div>
              )}
              {activeTab === 'piezas' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Código *</label>
                    <input
                      type="text"
                      value={edit.codigo ?? ''}
                      onChange={(e) => setEdit((s) => ({ ...s, codigo: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                      placeholder="Ej: 00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Abreviatura *</label>
                    <input
                      type="text"
                      value={edit.abreviatura ?? ''}
                      onChange={(e) => setEdit((s) => ({ ...s, abreviatura: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                      placeholder="Ej: PBS"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEdit(EMPTY_EDIT); }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
