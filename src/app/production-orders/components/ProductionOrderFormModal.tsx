'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import ConfirmModal from '@/components/ui/ConfirmModal';

import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { ProductionOrdersRepo, POCatalogRepo } from '@/lib/repositories';
import { createClient } from '@/lib/supabase/client';
import { getDB, type DBProductionOrder, type DBProductionOrderItem, type DBPOCliente, type DBPOCatalogItem, type DBPOPiezaVidrio,  } from '@/lib/db';
import {
  generateProductionOrderPDF,
  openProductionOrderPDF,
  type ProductionOrderPDFData,
} from '@/lib/productionOrderPdfGenerator';
import { PO_STATUS_CONFIG } from './ProductionOrdersListView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderFormItem {
  id: string;
  pieza_id: string;
  pieza_nombre: string;
  codigo: string;
  cantidad: number;
  nivel_nij_id: string;
  nivel_nij_nombre: string;
  lleva_marcacion: boolean;
  tipo_marcacion_id: string;
  tipo_marcacion_nombre: string;
  observaciones: string;
}

interface OrderFormData {
  fecha: string;
  cliente_id: string;
  cliente_nombre: string;
  pais: string;
  pais_override: string; // inline country entry when client has no country
  modelo_id: string;
  modelo_nombre: string;
  nivel_nij_id: string;
  nivel_nij_nombre: string;
  forma_pago_id: string;
  forma_pago_nombre: string;
  incoterm_id: string;
  incoterm_nombre: string;
  cantidad_vehiculos: number;
  observaciones: string;
  items: OrderFormItem[];
}

const DRAFT_KEY = 'po_draft_form';

const EMPTY_FORM: OrderFormData = {
  fecha: new Date().toISOString().slice(0, 10),
  cliente_id: '',
  cliente_nombre: '',
  pais: '',
  pais_override: '',
  modelo_id: '',
  modelo_nombre: '',
  nivel_nij_id: '',
  nivel_nij_nombre: '',
  forma_pago_id: '',
  forma_pago_nombre: '',
  incoterm_id: '',
  incoterm_nombre: '',
  cantidad_vehiculos: 1,
  observaciones: '',
  items: [],
};

const SECTIONS = [
  { id: 'datos', label: 'Datos de la Orden', icon: 'IdentificationIcon' },
  { id: 'vehiculo', label: 'Vehículo y Condiciones', icon: 'TruckIcon' },
  { id: 'piezas', label: 'Piezas de Vidrio', icon: 'WindowIcon' },
  { id: 'resumen', label: 'Observaciones y Resumen', icon: 'DocumentTextIcon' },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string | null;
  onClose: () => void;
  currentUserName: string;
  currentUserId: string;
}

// ─── Searchable Select ────────────────────────────────────────────────────────

interface SearchableSelectProps {
  options: { id: string; label: string; sub?: string }[];
  value: string;
  onChange: (id: string, label: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function SearchableSelect({ options, value, onChange, placeholder, disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(q.toLowerCase())
  );

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className={`w-full px-3 py-2.5 border rounded-xl text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#1B4F72] ${
          disabled ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white border-gray-200 hover:border-[#1B4F72]'
        }`}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="ChevronDownIcon" size={16} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">Sin resultados</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id, o.label); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#1B4F72]/10 transition-colors ${
                  o.id === value ? 'bg-[#1B4F72]/10 font-semibold text-[#1B4F72]' : 'text-gray-700'
                }`}
              >
                {o.label}
                {o.sub && <span className="text-xs text-gray-400 ml-1">({o.sub})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductionOrderFormModal({ orderId, onClose, currentUserName, currentUserId }: Props) {
  const { isAdmin, isComercial } = useAuth();
  const queryClient = useQueryClient();

  const [currentSection, setCurrentSection] = useState<SectionId>('datos');
  const [form, setForm] = useState<OrderFormData>(EMPTY_FORM);
  const [order, setOrder] = useState<DBProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [draftBanner, setDraftBanner] = useState(false);
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set());

  // Catalogs
  const [clientes, setClientes] = useState<DBPOCliente[]>([]);
  const [modelos, setModelos] = useState<DBPOCatalogItem[]>([]);
  const [niveles, setNiveles] = useState<DBPOCatalogItem[]>([]);
  const [formasPago, setFormasPago] = useState<DBPOCatalogItem[]>([]);
  const [incoterms, setIncoterms] = useState<DBPOCatalogItem[]>([]);
  const [piezas, setPiezas] = useState<DBPOPiezaVidrio[]>([]);
  const [marcaciones, setMarcaciones] = useState<DBPOCatalogItem[]>([]);

  const isReadOnly = order
    ? !['borrador', 'rechazada'].includes(order.status) || (!isAdmin && !isComercial)
    : false;

  // Load catalogs
  useEffect(() => {
    Promise.all([
      POCatalogRepo.getClientes(),
      POCatalogRepo.getModelos(),
      POCatalogRepo.getNiveles(),
      POCatalogRepo.getFormasPago(),
      POCatalogRepo.getIncoterms(),
      POCatalogRepo.getPiezas(),
      POCatalogRepo.getMarcaciones(),
    ]).then(([c, m, n, f, i, p, t]) => {
      setClientes(c.filter((x) => x.activo));
      setModelos(m.filter((x) => x.activo));
      setNiveles(n.filter((x) => x.activo));
      setFormasPago(f.filter((x) => x.activo));
      setIncoterms(i.filter((x) => x.activo));
      setPiezas(p.filter((x) => x.activo));
      setMarcaciones(t.filter((x) => x.activo));
    });
  }, []);

  // Load order or draft
  useEffect(() => {
    const loadOrder = async () => {
      setLoading(true);
      if (orderId) {
        const existing = await ProductionOrdersRepo.getById(orderId);
        if (existing) {
          setOrder(existing);
          // Load items from Supabase
          const supabase = createClient();
          const { data: items } = await supabase
            .from('production_order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('linea');

          setForm({
            fecha: existing.fecha,
            cliente_id: existing.cliente_id,
            cliente_nombre: existing.cliente_nombre,
            pais: existing.pais,
            pais_override: '',
            modelo_id: existing.modelo_id,
            modelo_nombre: existing.modelo_nombre,
            nivel_nij_id: existing.nivel_nij_id,
            nivel_nij_nombre: existing.nivel_nij_nombre,
            forma_pago_id: existing.forma_pago_id,
            forma_pago_nombre: existing.forma_pago_nombre,
            incoterm_id: existing.incoterm_id,
            incoterm_nombre: existing.incoterm_nombre,
            cantidad_vehiculos: existing.cantidad_vehiculos,
            observaciones: existing.observaciones ?? '',
            items: (items ?? []).map((it: Record<string, unknown>) => ({
              id: it.id as string,
              pieza_id: (it.pieza_id as string) ?? '',
              pieza_nombre: (it.pieza_nombre as string) ?? '',
              codigo: (it.codigo as string) ?? '',
              cantidad: (it.cantidad as number) ?? 1,
              nivel_nij_id: (it.nivel_nij_id as string) ?? '',
              nivel_nij_nombre: (it.nivel_nij_nombre as string) ?? '',
              lleva_marcacion: (it.lleva_marcacion as boolean) ?? false,
              tipo_marcacion_id: (it.tipo_marcacion_id as string) ?? '',
              tipo_marcacion_nombre: (it.tipo_marcacion_nombre as string) ?? '',
              observaciones: (it.observaciones as string) ?? '',
            })),
          });
        }
      } else {
        // Check for draft
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw) as OrderFormData;
            setDraftBanner(true);
            setForm(draft);
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    };
    loadOrder();
  }, [orderId]);

  // Autosave draft
  useEffect(() => {
    if (orderId || isReadOnly) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [form, orderId, isReadOnly]);

  // Compute completed sections
  useEffect(() => {
    const completed = new Set<SectionId>();
    if (form.fecha && form.cliente_id && form.pais && form.cantidad_vehiculos >= 1) {
      completed.add('datos');
    }
    if (form.modelo_id && form.nivel_nij_id && form.forma_pago_id && form.incoterm_id) {
      completed.add('vehiculo');
    }
    if (form.items.length > 0) {
      completed.add('piezas');
    }
    completed.add('resumen');
    setCompletedSections(completed);
  }, [form]);

  const totalPiezas = form.items.reduce((sum, it) => sum + (it.cantidad || 0), 0);

  const handleClientChange = (id: string, nombre: string) => {
    const cliente = clientes.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      cliente_id: id,
      cliente_nombre: nombre,
      pais: cliente?.pais ?? '',
      pais_override: '',
    }));
  };

  const handleAddItem = () => {
    if (form.items.length >= 20) {
      toast.error('Máximo 20 piezas por orden');
      return;
    }
    const newItem: OrderFormItem = {
      id: crypto.randomUUID(),
      pieza_id: '',
      pieza_nombre: '',
      codigo: '',
      cantidad: 1,
      nivel_nij_id: form.nivel_nij_id,
      nivel_nij_nombre: form.nivel_nij_nombre,
      lleva_marcacion: false,
      tipo_marcacion_id: '',
      tipo_marcacion_nombre: '',
      observaciones: '',
    };
    setForm((f) => ({ ...f, items: [...f.items, newItem] }));
  };

  const handleItemChange = (idx: number, changes: Partial<OrderFormItem>) => {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], ...changes };
      return { ...f, items };
    });
  };

  const handleItemPiezaChange = (idx: number, piezaId: string, piezaNombre: string) => {
    // Check duplicate
    const duplicate = form.items.some((it, i) => i !== idx && it.pieza_id === piezaId);
    if (duplicate) {
      toast.error('Esta pieza ya fue agregada');
      return;
    }
    const pieza = piezas.find((p) => p.id === piezaId);
    handleItemChange(idx, {
      pieza_id: piezaId,
      pieza_nombre: piezaNombre,
      codigo: pieza?.codigo ?? '',
    });
  };

  const handleRemoveItem = (idx: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const validateForm = (): { valid: boolean; section?: SectionId; message?: string } => {
    if (!form.fecha) return { valid: false, section: 'datos', message: 'La fecha es requerida' };
    if (!form.cliente_id) return { valid: false, section: 'datos', message: 'El cliente es requerido' };
    const effectivePais = form.pais || form.pais_override;
    if (!effectivePais) return { valid: false, section: 'datos', message: 'El país de origen es requerido' };
    if (!form.cantidad_vehiculos || form.cantidad_vehiculos < 1) return { valid: false, section: 'datos', message: 'La cantidad de vehículos debe ser al menos 1' };
    if (!form.modelo_id) return { valid: false, section: 'vehiculo', message: 'El modelo de vehículo es requerido' };
    if (!form.nivel_nij_id) return { valid: false, section: 'vehiculo', message: 'El nivel NIJ es requerido' };
    if (!form.forma_pago_id) return { valid: false, section: 'vehiculo', message: 'La forma de pago es requerida' };
    if (!form.incoterm_id) return { valid: false, section: 'vehiculo', message: 'El incoterm es requerido' };
    if (form.items.length === 0) return { valid: false, section: 'piezas', message: 'Debe agregar al menos una pieza' };
    if (form.items.length > 20) return { valid: false, section: 'piezas', message: 'Máximo 20 piezas por orden' };
    for (const item of form.items) {
      if (!item.pieza_id) return { valid: false, section: 'piezas', message: 'Todas las piezas deben estar seleccionadas' };
      if (!item.cantidad || item.cantidad < 1) return { valid: false, section: 'piezas', message: 'La cantidad de cada pieza debe ser al menos 1' };
      if (!item.nivel_nij_id) return { valid: false, section: 'piezas', message: 'El nivel NIJ de cada pieza es requerido' };
      if (item.lleva_marcacion && !item.tipo_marcacion_id) return { valid: false, section: 'piezas', message: 'El tipo de marcación es requerido cuando lleva marcación' };
    }
    return { valid: true };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const effectivePais = form.pais || form.pais_override;
      const now = new Date().toISOString();
      const isOnline = navigator.onLine;

      // If client had no country and user entered one, save it
      if (!form.pais && form.pais_override && form.cliente_id) {
        if (isOnline) {
          const supabase = createClient();
          await supabase.from('po_clientes').update({ pais: form.pais_override }).eq('id', form.cliente_id);
        }
        const db = getDB();
        await db.po_clientes.update(form.cliente_id, { pais: form.pais_override });
      }

      const orderData: Omit<DBProductionOrder, '_synced_at' | '_dirty'> = {
        id: orderId ?? crypto.randomUUID(),
        fecha: form.fecha,
        cliente_id: form.cliente_id,
        cliente_nombre: form.cliente_nombre,
        pais: effectivePais,
        modelo_id: form.modelo_id,
        modelo_nombre: form.modelo_nombre,
        nivel_nij_id: form.nivel_nij_id,
        nivel_nij_nombre: form.nivel_nij_nombre,
        forma_pago_id: form.forma_pago_id,
        forma_pago_nombre: form.forma_pago_nombre,
        incoterm_id: form.incoterm_id,
        incoterm_nombre: form.incoterm_nombre,
        cantidad_vehiculos: form.cantidad_vehiculos,
        observaciones: form.observaciones,
        status: order?.status ?? 'borrador',
        total_piezas: totalPiezas,
        version: order?.version ?? 1,
        created_by: order?.created_by ?? currentUserId,
        created_by_name: order?.created_by_name ?? currentUserName,
        created_at: order?.created_at ?? now,
        updated_at: now,
      };

      if (orderId) {
        await ProductionOrdersRepo.update(orderId, orderData);
      } else {
        await ProductionOrdersRepo.create(orderData);
      }

      // Save items to Supabase if online
      if (isOnline) {
        const supabase = createClient();
        const oid = orderId ?? orderData.id;
        // Delete existing items and re-insert
        await supabase.from('production_order_items').delete().eq('order_id', oid);
        if (form.items.length > 0) {
          const itemsToInsert = form.items.map((it, idx) => ({
            id: it.id || crypto.randomUUID(),
            order_id: oid,
            linea: idx + 1,
            pieza_id: it.pieza_id,
            pieza_nombre: it.pieza_nombre,
            codigo: it.codigo,
            cantidad: it.cantidad,
            nivel_nij_id: it.nivel_nij_id,
            nivel_nij_nombre: it.nivel_nij_nombre,
            lleva_marcacion: it.lleva_marcacion,
            tipo_marcacion_id: it.tipo_marcacion_id || null,
            tipo_marcacion_nombre: it.tipo_marcacion_nombre || null,
            observaciones: it.observaciones || null,
          }));
          await supabase.from('production_order_items').insert(itemsToInsert);
        }
        // Upsert order to Supabase
        const { _dirty: _d, _synced_at: _s, items: _i, ...cleanOrder } = orderData as unknown as Record<string, unknown>;
        await supabase.from('production_orders').upsert({ ...cleanOrder }, { onConflict: 'id' });
      } else {
        toast.info('Sin conexión. La orden se sincronizará cuando vuelva la red.');
      }

      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: queryKeys.productionOrders.all });
      toast.success(orderId ? 'Orden actualizada' : 'Orden guardada');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    const validation = validateForm();
    if (!validation.valid) {
      if (validation.section) setCurrentSection(validation.section);
      toast.error(validation.message ?? 'Formulario incompleto');
      return;
    }
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    setShowSubmitConfirm(false);
    try {
      // First save
      await handleSave();

      // Then submit via RPC
      if (orderId && navigator.onLine) {
        const supabase = createClient();
        const { error } = await supabase.rpc('po_submit_order', { p_order_id: orderId });
        if (error) throw new Error(error.message);
        toast.success('Orden enviada a aprobación');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!order) return;
    setPdfLoading(true);
    try {
      const supabase = createClient();
      const { data: items } = await supabase
        .from('production_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('linea');

      const pdfData: ProductionOrderPDFData = {
        id: order.id,
        numero_orden: order.numero_orden ?? 'Pendiente',
        fecha: order.fecha,
        status: order.status,
        cliente_nombre: order.cliente_nombre,
        pais: order.pais,
        modelo_nombre: order.modelo_nombre,
        nivel_nij_nombre: order.nivel_nij_nombre,
        forma_pago_nombre: order.forma_pago_nombre,
        incoterm_nombre: order.incoterm_nombre,
        cantidad_vehiculos: order.cantidad_vehiculos,
        observaciones: order.observaciones,
        total_piezas: order.total_piezas,
        items: (items ?? []).map((it: Record<string, unknown>, idx: number) => ({
          linea: (it.linea as number) ?? idx + 1,
          pieza_nombre: (it.pieza_nombre as string) ?? '',
          codigo: (it.codigo as string) ?? '',
          cantidad: (it.cantidad as number) ?? 1,
          nivel_nij_nombre: (it.nivel_nij_nombre as string) ?? '',
          lleva_marcacion: (it.lleva_marcacion as boolean) ?? false,
          tipo_marcacion_nombre: (it.tipo_marcacion_nombre as string | undefined) ?? undefined,
          observaciones: (it.observaciones as string | undefined) ?? undefined,
        })),
        created_by_name: order.created_by_name,
        created_at: order.created_at,
      };

      const html = await generateProductionOrderPDF(pdfData);
      openProductionOrderPDF(html);
    } catch {
      toast.error('Error al generar PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const sectionIdx = SECTIONS.findIndex((s) => s.id === currentSection);
  const progressPct = ((sectionIdx + 1) / SECTIONS.length) * 100;

  const statusCfg = order ? PO_STATUS_CONFIG[order.status] : null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* Blue Header */}
      <div className="bg-[#1B4F72] text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 transition-colors">
            <Icon name="XMarkIcon" size={22} className="text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base leading-tight">
              {order ? (order.numero_orden ?? `Orden`) : 'Nueva Orden'}
            </h2>
            <p className="text-xs text-white/70">
              {SECTIONS.find((s) => s.id === currentSection)?.label} — {sectionIdx + 1}/{SECTIONS.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {order?.numero_orden && (
              <span className="font-mono text-xs bg-white/20 px-2 py-1 rounded-lg">{order.numero_orden}</span>
            )}
            {order && (
              <button
                onClick={handleDownloadPDF}
                disabled={pdfLoading}
                className="p-2 rounded-xl hover:bg-white/20 transition-colors"
                title="Descargar PDF"
              >
                {pdfLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="DocumentArrowDownIcon" size={20} className="text-white" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-1.5 bg-green-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-hide">
          {SECTIONS.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentSection(s.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                currentSection === s.id
                  ? 'bg-white text-[#1B4F72]'
                  : 'text-white/70 hover:bg-white/20'
              }`}
            >
              {completedSections.has(s.id) && idx !== sectionIdx && (
                <Icon name="CheckCircleIcon" size={12} className="text-green-400" />
              )}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status banner */}
      {order && statusCfg && (
        <div className={`px-4 py-2 text-sm font-semibold flex items-center gap-2 flex-shrink-0 ${
          order.status === 'pendiente_aprobacion' ? 'bg-orange-50 text-orange-700 border-b border-orange-200' :
          order.status === 'rechazada' ? 'bg-red-50 text-red-700 border-b border-red-200' :
          order.status === 'aprobada' ? 'bg-sky-50 text-sky-700 border-b border-sky-200' :
          order.status === 'en_produccion' ? 'bg-blue-50 text-blue-700 border-b border-blue-200' :
          order.status === 'terminada' ? 'bg-green-50 text-green-700 border-b border-green-200' :
          order.status === 'despachada' ? 'bg-purple-50 text-purple-700 border-b border-purple-200' :
          order.status === 'cancelada'? 'bg-gray-100 text-gray-600 border-b border-gray-200' : 'bg-gray-50 text-gray-600 border-b border-gray-200'
        }`}>
          <Icon name={
            order.status === 'pendiente_aprobacion' ? 'ClockIcon' :
            order.status === 'rechazada' ? 'XCircleIcon' :
            order.status === 'aprobada' ? 'CheckCircleIcon' :
            order.status === 'en_produccion' ? 'WrenchScrewdriverIcon' :
            order.status === 'terminada' ? 'CheckBadgeIcon' :
            order.status === 'despachada' ? 'TruckIcon' :
            order.status === 'cancelada'? 'NoSymbolIcon' : 'DocumentTextIcon'
          } size={16} className="flex-shrink-0" />
          <span>{statusCfg.label}</span>
          {order.rejection_reason && (
            <span className="text-xs font-normal ml-1">— {order.rejection_reason}</span>
          )}
          {isReadOnly && <span className="ml-auto text-xs font-normal opacity-70">Solo lectura</span>}
        </div>
      )}

      {/* Draft banner */}
      {draftBanner && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-shrink-0">
          <Icon name="ExclamationTriangleIcon" size={16} className="text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-700 font-medium flex-1">Borrador recuperado</span>
          <button
            onClick={() => setDraftBanner(false)}
            className="text-xs text-amber-700 font-semibold underline"
          >
            Restaurar
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setDraftBanner(false); localStorage.removeItem(DRAFT_KEY); }}
            className="text-xs text-amber-600 font-semibold underline"
          >
            Ignorar
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Section 1: Datos de la Orden */}
        {currentSection === 'datos' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">N° Orden</label>
              <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-500">
                {order?.numero_orden ?? 'Se asignará al sincronizar'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha *</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                disabled={isReadOnly}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Cliente *</label>
              <SearchableSelect
                options={clientes.map((c) => ({ id: c.id, label: c.nombre, sub: c.pais ?? undefined }))}
                value={form.cliente_id}
                onChange={handleClientChange}
                placeholder="Seleccionar cliente..."
                disabled={isReadOnly}
              />
            </div>
            {/* Inline country if client has no country */}
            {form.cliente_id && !form.pais && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <label className="block text-sm font-semibold text-amber-800 mb-1">
                  País de Origen * <span className="text-xs font-normal">(Se guardará en el cliente)</span>
                </label>
                <input
                  type="text"
                  value={form.pais_override}
                  onChange={(e) => setForm((f) => ({ ...f, pais_override: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Ej: COLOMBIA"
                  className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
            )}
            {form.pais && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">País de Origen</label>
                <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
                  {form.pais}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Cantidad de Vehículos *</label>
              <input
                type="number"
                min={1}
                value={form.cantidad_vehiculos}
                onChange={(e) => setForm((f) => ({ ...f, cantidad_vehiculos: parseInt(e.target.value) || 1 }))}
                disabled={isReadOnly}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] disabled:bg-gray-50"
              />
            </div>
          </div>
        )}

        {/* Section 2: Vehículo y Condiciones */}
        {currentSection === 'vehiculo' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Modelo de Vehículo *</label>
              <SearchableSelect
                options={modelos.map((m) => ({ id: m.id, label: m.nombre }))}
                value={form.modelo_id}
                onChange={(id, label) => setForm((f) => ({ ...f, modelo_id: id, modelo_nombre: label }))}
                placeholder="Seleccionar modelo..."
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nivel NIJ *</label>
              <SearchableSelect
                options={niveles.map((n) => ({ id: n.id, label: n.nombre }))}
                value={form.nivel_nij_id}
                onChange={(id, label) => setForm((f) => ({ ...f, nivel_nij_id: id, nivel_nij_nombre: label }))}
                placeholder="Seleccionar nivel NIJ..."
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Forma de Pago *</label>
              <SearchableSelect
                options={formasPago.map((f) => ({ id: f.id, label: f.nombre }))}
                value={form.forma_pago_id}
                onChange={(id, label) => setForm((f) => ({ ...f, forma_pago_id: id, forma_pago_nombre: label }))}
                placeholder="Seleccionar forma de pago..."
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Incoterm *</label>
              <SearchableSelect
                options={incoterms.map((i) => ({ id: i.id, label: i.nombre }))}
                value={form.incoterm_id}
                onChange={(id, label) => setForm((f) => ({ ...f, incoterm_id: id, incoterm_nombre: label }))}
                placeholder="Seleccionar incoterm..."
                disabled={isReadOnly}
              />
            </div>
          </div>
        )}

        {/* Section 3: Piezas de Vidrio */}
        {currentSection === 'piezas' && (
          <div className="max-w-2xl mx-auto">
            {/* Sticky summary */}
            <div className="sticky top-0 bg-white border-b border-gray-100 pb-3 mb-4 z-10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {form.items.length} pieza{form.items.length !== 1 ? 's' : ''} · {form.items.length}/20
                </span>
                <div className="bg-[#1B4F72] text-white px-3 py-1 rounded-full text-sm font-bold">
                  TOTAL: {totalPiezas} piezas
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div key={item.id} className="card p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#1B4F72] bg-[#1B4F72]/10 px-2 py-0.5 rounded-full">
                      #{idx + 1}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Icon name="TrashIcon" size={14} className="text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Pieza *</label>
                      <SearchableSelect
                        options={piezas.map((p) => ({ id: p.id, label: p.nombre, sub: p.codigo }))}
                        value={item.pieza_id}
                        onChange={(id, label) => handleItemPiezaChange(idx, id, label)}
                        placeholder="Seleccionar pieza..."
                        disabled={isReadOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Código</label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-600">
                        {item.codigo || '—'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad *</label>
                      <input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={(e) => handleItemChange(idx, { cantidad: parseInt(e.target.value) || 1 })}
                        disabled={isReadOnly}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] disabled:bg-gray-50"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Nivel NIJ Pieza *</label>
                      <SearchableSelect
                        options={niveles.map((n) => ({ id: n.id, label: n.nombre }))}
                        value={item.nivel_nij_id}
                        onChange={(id, label) => handleItemChange(idx, { nivel_nij_id: id, nivel_nij_nombre: label })}
                        placeholder="Seleccionar nivel NIJ..."
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Lleva Marcación</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleItemChange(idx, { lleva_marcacion: true })}
                          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                            item.lleva_marcacion
                              ? 'bg-[#1B4F72] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50`}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleItemChange(idx, { lleva_marcacion: false, tipo_marcacion_id: '', tipo_marcacion_nombre: '' })}
                          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                            !item.lleva_marcacion
                              ? 'bg-[#1B4F72] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                    {item.lleva_marcacion && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Marcación *</label>
                        <SearchableSelect
                          options={marcaciones.map((m) => ({ id: m.id, label: m.nombre }))}
                          value={item.tipo_marcacion_id}
                          onChange={(id, label) => handleItemChange(idx, { tipo_marcacion_id: id, tipo_marcacion_nombre: label })}
                          placeholder="Seleccionar tipo..."
                          disabled={isReadOnly}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
                      <input
                        type="text"
                        value={item.observaciones}
                        onChange={(e) => handleItemChange(idx, { observaciones: e.target.value })}
                        disabled={isReadOnly}
                        placeholder="Observaciones opcionales..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!isReadOnly && form.items.length < 20 && (
              <button
                onClick={handleAddItem}
                className="mt-4 w-full py-3 border-2 border-dashed border-[#1B4F72]/30 rounded-xl text-sm font-semibold text-[#1B4F72] hover:bg-[#1B4F72]/5 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="PlusIcon" size={18} className="text-[#1B4F72]" />
                Agregar pieza
              </button>
            )}
          </div>
        )}

        {/* Section 4: Observaciones y Resumen */}
        {currentSection === 'resumen' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones Generales</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                disabled={isReadOnly}
                rows={4}
                placeholder="Observaciones opcionales..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72] disabled:bg-gray-50"
              />
            </div>

            {/* Summary */}
            <div className="card p-4 bg-gray-50">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">Resumen de la Orden</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente:</span>
                  <span className="font-semibold text-gray-800">{form.cliente_nombre || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">País:</span>
                  <span className="font-semibold text-gray-800">{form.pais || form.pais_override || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Modelo:</span>
                  <span className="font-semibold text-gray-800 text-right max-w-[60%]">{form.modelo_nombre || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nivel NIJ:</span>
                  <span className="font-semibold text-gray-800">{form.nivel_nij_nombre || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Forma de Pago:</span>
                  <span className="font-semibold text-gray-800 text-right max-w-[60%]">{form.forma_pago_nombre || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Incoterm:</span>
                  <span className="font-semibold text-gray-800">{form.incoterm_nombre || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehículos:</span>
                  <span className="font-semibold text-gray-800">{form.cantidad_vehiculos}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-bold">Total de Piezas:</span>
                  <span className="font-bold text-[#1B4F72] text-base">{totalPiezas}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3 bg-white flex items-center gap-3">
        <button
          onClick={() => {
            const idx = SECTIONS.findIndex((s) => s.id === currentSection);
            if (idx > 0) setCurrentSection(SECTIONS[idx - 1].id);
          }}
          disabled={sectionIdx === 0}
          className="btn-secondary py-3 px-5 text-sm disabled:opacity-40"
        >
          Ant.
        </button>

        {sectionIdx < SECTIONS.length - 1 ? (
          <button
            onClick={() => setCurrentSection(SECTIONS[sectionIdx + 1].id)}
            className="flex-1 py-3 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm"
          >
            Sig.
          </button>
        ) : (
          <div className="flex-1 flex gap-2">
            {!isReadOnly && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                {(isAdmin || isComercial) && (!order || ['borrador', 'rechazada'].includes(order.status)) && (
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Enviando...' : 'Enviar a Aprobación'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Submit Confirm */}
      <ConfirmModal
        isOpen={showSubmitConfirm}
        title="Enviar a aprobación"
        message="¿Enviar esta orden a aprobación? Ya no podrá editarla hasta que un administrador la apruebe o la rechace."
        confirmLabel="Enviar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={confirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
      />
    </div>
  );
}
