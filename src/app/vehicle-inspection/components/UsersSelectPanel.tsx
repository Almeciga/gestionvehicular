'use client';
import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'inspector';
  is_active: boolean;
  created_at: string;
}

export default function UsersSelectPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // 🔍 LOG: conexión a la BD
      console.group('%c[UsersSelectPanel] Conexión a Supabase', 'color: #3b82f6; font-weight: bold');
      console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '⚠️ NO DEFINIDA');
      console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Definida (valor oculto)' : '⚠️ NO DEFINIDA');
      console.log('Ejecutando: SELECT id, email, full_name, role, is_active, created_at FROM profiles ORDER BY created_at DESC');
      console.groupEnd();

      const { data, error: supabaseError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at')
        .order('created_at', { ascending: false });

      if (supabaseError) {
        // 🔴 LOG: error de permisos detallado
        console.group('%c[UsersSelectPanel] ❌ Error al consultar profiles', 'color: #ef4444; font-weight: bold');
        console.error('Mensaje:', supabaseError.message);
        console.error('Código:', supabaseError.code);
        console.error('Hint:', supabaseError.hint ?? 'N/A');
        console.error('Detalle:', supabaseError.details ?? 'N/A');
        console.error('Objeto completo:', supabaseError);
        console.warn(
          '💡 Causa probable: La RLS (Row Level Security) de la tabla "profiles" no permite SELECT con la anon key.',
          '\n   Verifica en Supabase → Authentication → Policies → tabla "profiles"',
          '\n   La política SELECT debe incluir: USING (auth.uid() = id) o similar para usuarios autenticados.'
        );
        console.groupEnd();
        setError(supabaseError.message);
        return;
      }

      // ✅ LOG: éxito
      console.log('%c[UsersSelectPanel] ✅ Usuarios cargados:', 'color: #22c55e; font-weight: bold', data?.length ?? 0, 'registros');
      setUsers((data as UserProfile[]) || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar usuarios';
      console.group('%c[UsersSelectPanel] ❌ Excepción inesperada', 'color: #ef4444; font-weight: bold');
      console.error('Error:', err);
      console.groupEnd();
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon name="UsersIcon" size={18} className="text-blue-600" />
          <span className="font-semibold text-gray-800 text-sm">Usuarios registrados (BD)</span>
          {!loading && isOpen && (
            <span className="ml-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {users.length}
            </span>
          )}
        </div>
        <Icon
          name={isOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={16}
          className="text-gray-500"
        />
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4">
          {/* Refresh button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
            >
              <Icon name="ArrowPathIcon" size={13} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
              <Icon name="ArrowPathIcon" size={18} className="animate-spin" />
              <span className="text-sm">Cargando usuarios...</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2 text-sm">
              <Icon name="ExclamationCircleIcon" size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && users.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No hay usuarios registrados.
            </div>
          )}

          {/* Table */}
          {!loading && !error && users.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Creado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-gray-800">
                        {user.full_name || <span className="text-gray-400 italic">Sin nombre</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{user.email}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin' ?'bg-purple-100 text-purple-700' :'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {user.role === 'admin' ? 'Admin' : 'Inspector'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-700' :'bg-red-100 text-red-600'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.is_active ? 'bg-green-500' : 'bg-red-400'
                            }`}
                          />
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
