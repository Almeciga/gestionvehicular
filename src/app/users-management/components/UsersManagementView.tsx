'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { UserProfile, UserRole } from '@/contexts/AuthContext';
import { ProfilesRepo } from '@/lib/repositories';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { incrementalSync } from '@/lib/syncService';

interface CreateUserForm {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

const EMPTY_FORM: CreateUserForm = { email: '', password: '', full_name: '', role: 'inspector' };

// Singleton Supabase client — only used for mutations (create/update users)
const supabase = createClient();

export default function UsersManagementView() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreateUserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [resetingId, setResetingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/vehicle-inspection');
    }
  }, [authLoading, isAdmin, router]);

  // Read from IndexedDB — no Supabase query on render
  const { data: rawProfiles = [], isLoading } = useQuery({
    queryKey: queryKeys.profiles.list(),
    queryFn: () => ProfilesRepo.getAll(),
    enabled: !authLoading && isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const users: UserProfile[] = rawProfiles.map((p) => ({
    id: p.id,
    email: p.email,
    role: p.role,
    full_name: p.full_name,
    is_active: p.is_active,
    must_reset_password: p.must_reset_password,
    created_at: p.created_at,
  }));

  const refreshUsers = async () => {
    await incrementalSync(['profiles']);
    queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.full_name) {
      toast.error('Completa todos los campos');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al crear usuario');

      toast.success(`Usuario ${form.email} creado. Deberá cambiar su contraseña al iniciar sesión.`);
      setForm(EMPTY_FORM);
      setShowCreateForm(false);
      await refreshUsers();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    setTogglingId(user.id);
    try {
      // Update in Supabase (admin operation) + sync to IndexedDB
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);
      if (error) throw error;
      toast.success(user.is_active ? `${user.email} desactivado` : `${user.email} activado`);
      await refreshUsers();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || 'Error al actualizar usuario');
    } finally {
      setTogglingId(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      toast.success('Rol actualizado');
      await refreshUsers();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || 'Error al cambiar rol');
    }
  };

  const handleForcePasswordReset = async (user: UserProfile) => {
    setResetingId(user.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ must_reset_password: true })
        .eq('id', user.id);
      if (error) throw error;
      toast.success(`Se solicitará cambio de contraseña a ${user.email} en su próximo inicio de sesión`);
      await refreshUsers();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error?.message || 'Error al solicitar reset');
    } finally {
      setResetingId(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    inspectors: users.filter((u) => u.role === 'inspector').length,
    inactive: users.filter((u) => !u.is_active).length,
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-4 max-w-screen-2xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-[#1B4F72] tabular-nums">{stats.total}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Total</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-purple-600 tabular-nums">{stats.admins}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Admins</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-blue-600 tabular-nums">{stats.inspectors}</p>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">Inspectores</p>
        </div>
        <div className="card p-3 text-center border border-red-100 bg-red-50">
          <p className="text-xl font-bold text-red-500 tabular-nums">{stats.inactive}</p>
          <p className="text-xs text-red-500 font-semibold mt-0.5">Inactivos</p>
        </div>
      </div>

      {/* Search + New */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por email o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
          />
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          <Icon name="UserPlusIcon" size={18} className="text-white" />
          <span className="hidden sm:inline">Nuevo Usuario</span>
        </button>
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-800">Crear Nuevo Usuario</h3>
              <button onClick={() => { setShowCreateForm(false); setForm(EMPTY_FORM); }} className="p-2 rounded-xl hover:bg-gray-100">
                <Icon name="XMarkIcon" size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nombre del usuario"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                  disabled={saving}
                >
                  <option value="inspector">Inspector</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); setForm(EMPTY_FORM); }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#1B4F72] text-white font-semibold text-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Users list */}
      {!isLoading && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card p-10 text-center">
              <Icon name="UsersIcon" size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-500">No hay usuarios registrados</p>
            </div>
          )}
          {filtered.map((user) => (
            <div key={user.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800 text-sm">{user.full_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {user.role === 'admin' ? 'Admin' : 'Inspector'}
                    </span>
                    {!user.is_active && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                        Inactivo
                      </span>
                    )}
                    {user.must_reset_password && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        Reset pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleToggleActive(user)}
                  disabled={togglingId === user.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                    user.is_active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100' :'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  <Icon name={user.is_active ? 'XCircleIcon' : 'CheckCircleIcon'} size={14} className={user.is_active ? 'text-red-500' : 'text-green-500'} />
                  {togglingId === user.id ? '...' : user.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <select
                  value={user.role}
                  onChange={(e) => handleChangeRole(user.id, e.target.value as UserRole)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 border-0 focus:outline-none focus:ring-2 focus:ring-[#1B4F72]"
                >
                  <option value="inspector">Inspector</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => handleForcePasswordReset(user)}
                  disabled={resetingId === user.id}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-all active:scale-95"
                >
                  <Icon name="KeyIcon" size={14} className="text-amber-600" />
                  {resetingId === user.id ? '...' : 'Reset Pass'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
