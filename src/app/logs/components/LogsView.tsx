'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ErrorLogEntry, LogLevel } from '@/lib/errorLogger';
import Icon from '@/components/ui/AppIcon';

const LEVEL_STYLES: Record<LogLevel, { badge: string; row: string; dot: string }> = {
  error: {
    badge: 'bg-red-100 text-red-700 border border-red-200',
    row: 'bg-red-50/40',
    dot: 'bg-red-500',
  },
  warn: {
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
    row: 'bg-amber-50/40',
    dot: 'bg-amber-400',
  },
  info: {
    badge: 'bg-blue-100 text-blue-700 border border-blue-200',
    row: 'bg-blue-50/30',
    dot: 'bg-blue-400',
  },
};

const PAGE_SIZE = 50;

export default function LogsView() {
  const supabase = createClient();

  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Keep latest filter values accessible inside the subscription callback
  // without triggering a re-subscribe on every filter change
  const filterLevelRef = useRef(filterLevel);
  const searchRef = useRef(search);
  useEffect(() => { filterLevelRef.current = filterLevel; }, [filterLevel]);
  useEffect(() => { searchRef.current = search; }, [search]);

  const [tableMissing, setTableMissing] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('error_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (filterLevel !== 'all') {
        query = query.eq('level', filterLevel);
      }
      if (search.trim()) {
        query = query.ilike('message', `%${search.trim()}%`);
      }

      const { data, count, error } = await query;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableMissing(true);
        }
        // error_logs table not available locally; just show empty state
        setLogs([]);
        setTotalCount(0);
      } else {
        setTableMissing(false);
        setLogs((data as ErrorLogEntry[]) ?? []);
        setTotalCount(count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filterLevel, search]);

  // Initial fetch + re-fetch on filter change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time subscription — only re-created when liveMode changes.
  // Filter logic reads from refs so it never needs to re-subscribe.
  useEffect(() => {
    if (!liveMode) {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    // Avoid creating a duplicate channel if one already exists
    if (channelRef.current) return;

    const channel = supabase
      .channel('error_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'error_logs' },
        (payload: { new: unknown }) => {
          const newLog = payload.new as ErrorLogEntry;
          // Read current filter values from refs — no re-subscribe needed
          const currentLevel = filterLevelRef.current;
          const currentSearch = searchRef.current;
          if (currentLevel !== 'all' && newLog.level !== currentLevel) return;
          if (currentSearch.trim() && !newLog.message.toLowerCase().includes(currentSearch.toLowerCase())) return;
          setLogs((prev) => [newLog, ...prev].slice(0, PAGE_SIZE));
          setTotalCount((c) => c + 1);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [liveMode]); // ← only liveMode; filters use refs

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar todos los logs? Esta acción no se puede deshacer.')) return;
    setClearing(true);
    try {
      await supabase.from('error_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setLogs([]);
      setTotalCount(0);
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteOne = async (id: string) => {
    await supabase.from('error_logs').delete().eq('id', id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setTotalCount((c) => Math.max(0, c - 1));
  };

  const counts = {
    error: logs.filter((l) => l.level === 'error').length,
    warn: logs.filter((l) => l.level === 'warn').length,
    info: logs.filter((l) => l.level === 'info').length,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Icon name="ExclamationTriangleIcon" size={22} className="text-red-500" />
            Registro de Errores
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount} evento{totalCount !== 1 ? 's' : ''} registrado{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live toggle */}
          <button
            onClick={() => setLiveMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              liveMode
                ? 'bg-green-50 border-green-200 text-green-700' :'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${liveMode ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {liveMode ? 'En vivo' : 'Pausado'}
          </button>
          {/* Refresh */}
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Icon name="ArrowPathIcon" size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          {/* Clear all */}
          <button
            onClick={handleClearAll}
            disabled={clearing || logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
          >
            <Icon name="TrashIcon" size={14} />
            {clearing ? 'Limpiando…' : 'Limpiar todo'}
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-xs leading-relaxed space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
            <Icon name="ExclamationTriangleIcon" size={18} className="text-amber-600 shrink-0" />
            <span>Tabla remote `error_logs` no creada en Supabase (Mostrando Logs Locales)</span>
          </div>
          <p>
            Los errores se están capturando y mostrando de forma segura en la base de datos local (IndexedDB).
            Para sincronizarlos de forma remota, ejecuta la migración <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">20260629220000_error_logs.sql</code> en el SQL Editor de tu panel de Supabase.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(['error', 'warn', 'info'] as LogLevel[]).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(filterLevel === lvl ? 'all' : lvl)}
            className={`rounded-xl border p-3 text-left transition-all ${
              filterLevel === lvl
                ? LEVEL_STYLES[lvl].badge + ' shadow-sm'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_STYLES[lvl].dot}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {lvl === 'error' ? 'Errores' : lvl === 'warn' ? 'Advertencias' : 'Info'}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{counts[lvl]}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar en mensajes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72]"
          />
        </div>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value as LogLevel | 'all')}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72]"
        >
          <option value="all">Todos los niveles</option>
          <option value="error">Error</option>
          <option value="warn">Advertencia</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Icon name="ArrowPathIcon" size={20} className="animate-spin" />
            <span className="text-sm">Cargando logs…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <Icon name="CheckCircleIcon" size={40} className="text-green-300" />
            <p className="text-sm font-medium">Sin errores registrados</p>
            <p className="text-xs text-gray-400">Los errores aparecerán aquí en tiempo real</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => {
              const styles = LEVEL_STYLES[log.level as LogLevel] ?? LEVEL_STYLES.error;
              const isExpanded = expandedId === log.id;
              const date = new Date(log.created_at);

              return (
                <div key={log.id} className={`${styles.row} transition-colors`}>
                  <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-black/5"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${styles.badge}`}>
                          {log.level}
                        </span>
                        {log.context && (
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                            {log.context}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
                          {date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}{' '}
                          {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mt-1 font-medium line-clamp-2 break-words">
                        {log.message}
                      </p>
                      {log.user_email && (
                        <p className="text-xs text-gray-400 mt-0.5">{log.user_email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Icon
                        name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                        size={16}
                        className="text-gray-400"
                      />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 bg-white/60">
                      {log.stack && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1 mt-3">Stack Trace</p>
                          <pre className="text-xs text-gray-700 bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                            {log.stack}
                          </pre>
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1">Metadata</p>
                          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto font-mono text-gray-700">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-xs text-gray-400 font-mono">ID: {log.id}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteOne(log.id); }}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
                        >
                          <Icon name="TrashIcon" size={12} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalCount > PAGE_SIZE && (
        <p className="text-center text-xs text-gray-400">
          Mostrando los {PAGE_SIZE} más recientes de {totalCount} total
        </p>
      )}
    </div>
  );
}
