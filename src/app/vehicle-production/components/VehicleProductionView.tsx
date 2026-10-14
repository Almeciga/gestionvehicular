'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type TrabajoEstado = 'pendiente' | 'en_ejecucion' | 'finalizado';

interface TrabajoRow {
  id: string;
  descripcion: string;
  parte: string;
  estado: TrabajoEstado;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  responsable: string | null;
  avance: number;
  vehicle_id: string;
  placa?: string;
  marca?: string;
  modelo?: string;
}

const ESTADO_CONFIG: Record<TrabajoEstado, { label: string; color: string; bg: string; icon: string }> = {
  pendiente:    { label: 'Pendiente',    color: '#d97706', bg: '#fef3c7', icon: 'ClockIcon' },
  en_ejecucion: { label: 'En ejecución', color: '#2563eb', bg: '#dbeafe', icon: 'PlayIcon' },
  finalizado:   { label: 'Finalizado',   color: '#16a34a', bg: '#dcfce7', icon: 'CheckCircleIcon' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}

export default function VehicleProductionView() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [trabajos, setTrabajos] = useState<TrabajoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<TrabajoEstado | 'todos'>('todos');

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/vehicle-inspection');
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        // Join trabajos with vehicles to get placa/marca/modelo
        const { data, error } = await supabase
          .from('trabajos')
          .select(`
            id, descripcion, parte, estado, fecha_inicio, fecha_fin, responsable, avance, vehicle_id,
            vehicles (placa, marca, modelo)
          `)
          .order('created_at', { ascending: false });

        if (!cancelled && !error && data) {
          const rows: TrabajoRow[] = (data as unknown as Array<{
            id: string; descripcion: string; parte: string; estado: TrabajoEstado;
            fecha_inicio: string | null; fecha_fin: string | null; responsable: string | null;
            avance: number; vehicle_id: string;
            vehicles: { placa?: string; marca?: string; modelo?: string } | null;
          }>).map((r) => ({
            id: r.id,
            descripcion: r.descripcion,
            parte: r.parte,
            estado: r.estado,
            fecha_inicio: r.fecha_inicio,
            fecha_fin: r.fecha_fin,
            responsable: r.responsable,
            avance: r.avance ?? 0,
            vehicle_id: r.vehicle_id,
            placa: r.vehicles?.placa,
            marca: r.vehicles?.marca,
            modelo: r.vehicles?.modelo,
          }));
          setTrabajos(rows);
        }
      } catch {
        // silently fail — read-only view
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAdmin]);

  const filtered = trabajos.filter((t) => {
    const matchEstado = filterEstado === 'todos' || t.estado === filterEstado;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (t.placa || '').toLowerCase().includes(q) ||
      (t.descripcion || '').toLowerCase().includes(q) ||
      (t.parte || '').toLowerCase().includes(q) ||
      (t.responsable || '').toLowerCase().includes(q);
    return matchEstado && matchSearch;
  });

  const counts = {
    pendiente: trabajos.filter((t) => t.estado === 'pendiente').length,
    en_ejecucion: trabajos.filter((t) => t.estado === 'en_ejecucion').length,
    finalizado: trabajos.filter((t) => t.estado === 'finalizado').length,
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Info banner */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Icon name="InformationCircleIcon" size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 font-medium">
          Vista de seguimiento de trabajos — solo lectura. Para crear o editar trabajos, usa la pestaña <strong>Trabajo</strong> dentro de una inspección.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600 tabular-nums">{counts.pendiente}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Pendientes</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-blue-600 tabular-nums">{counts.en_ejecucion}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">En ejecución</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-green-600 tabular-nums">{counts.finalizado}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Finalizados</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa, trabajo, parte, responsable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
        </div>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as TrabajoEstado | 'todos')}
          className="py-3 px-4 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
        >
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_ejecucion">En ejecución</option>
          <option value="finalizado">Finalizado</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-10 text-center">
            <Icon name="WrenchScrewdriverIcon" size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">
              {trabajos.length === 0 ? 'No hay trabajos registrados aún' : 'Sin resultados para los filtros aplicados'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {trabajos.length === 0
                ? 'Los trabajos se crean desde la sección Trabajo dentro de una inspección.' :'Prueba con otros filtros o términos de búsqueda.'}
            </p>
          </div>
        )}
        {filtered.map((trabajo) => {
          const cfg = ESTADO_CONFIG[trabajo.estado] || ESTADO_CONFIG.pendiente;
          return (
            <div key={trabajo.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-base font-bold text-[#1B4F72]">{trabajo.placa || 'S/P'}</span>
                    {trabajo.marca && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                        {trabajo.marca} {trabajo.modelo}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">{trabajo.descripcion}</p>
                  {trabajo.parte && (
                    <p className="text-xs text-gray-500 mt-0.5">Parte: {trabajo.parte}</p>
                  )}
                </div>
                <span
                  className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ color: cfg.color, backgroundColor: cfg.bg }}
                >
                  {cfg.label}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Avance</span>
                  <span className="text-xs font-bold text-gray-700">{trabajo.avance ?? 0}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${trabajo.avance ?? 0}%`,
                      backgroundColor: cfg.color,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-500">
                <div>
                  <span className="font-semibold text-gray-600">Inicio:</span>{' '}
                  {formatDate(trabajo.fecha_inicio)}
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Fin:</span>{' '}
                  {formatDate(trabajo.fecha_fin)}
                </div>
                {trabajo.responsable && (
                  <div className="col-span-2 sm:col-span-1">
                    <span className="font-semibold text-gray-600">Responsable:</span>{' '}
                    {trabajo.responsable}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}