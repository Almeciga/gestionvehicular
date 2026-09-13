'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';
import AppIcon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, profile, refreshProfile, loading } = useAuth();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track if we just completed a reset to avoid redirect loop
  const justReset = useRef(false);

  useEffect(() => {
    // Don't redirect while still loading auth state
    if (loading) return;

    // No user at all — go to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // If profile is loaded, must_reset_password is false, and we didn't just reset,
    // this user shouldn't be here — redirect to app
    if (profile && !profile.must_reset_password && !justReset.current) {
      router.replace('/vehicle-inspection');
    }
  }, [loading, user, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Clear must_reset_password flag in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_reset_password: false })
        .eq('id', user?.id);

      if (profileError) {
        console.error('Error clearing must_reset_password:', profileError);
      }

      // Mark that we just reset so the useEffect guard doesn't fire prematurely
      justReset.current = true;

      await refreshProfile();
      toast.success('Contraseña actualizada correctamente. ¡Bienvenido!');
      router.replace('/vehicle-inspection');
    } catch (err: any) {
      toast.error(err?.message || 'Error al actualizar contraseña');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#1B4F72] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <AppLogo size={40} className="brightness-0 invert" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GestionVehicular</h1>
          <p className="text-sm text-gray-500 mt-1">Cambio de contraseña requerido</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
            <AppIcon name="ExclamationTriangleIcon" size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Cambio de contraseña obligatorio</p>
              <p className="text-xs text-amber-700 mt-0.5">Por seguridad, debes establecer una nueva contraseña antes de continuar. Usa una contraseña fuerte con al menos 8 caracteres.</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-gray-800 mb-4">Nueva contraseña</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <AppIcon name="LockClosedIcon" size={18} className="text-gray-400" />
                </div>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72] bg-gray-50"
                  disabled={saving}
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  tabIndex={-1}
                >
                  <AppIcon name={showPwd ? 'EyeSlashIcon' : 'EyeIcon'} size={18} className="text-gray-400" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <AppIcon name="LockClosedIcon" size={18} className="text-gray-400" />
                </div>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72] bg-gray-50"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Password strength hints */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Recomendaciones de seguridad:</p>
              {[
                { label: 'Al menos 8 caracteres', ok: password.length >= 8 },
                { label: 'Letras mayúsculas y minúsculas', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
                { label: 'Al menos un número', ok: /\d/.test(password) },
                { label: 'Al menos un símbolo (!@#$...)', ok: /[^a-zA-Z0-9]/.test(password) },
              ].map((hint) => (
                <div key={hint.label} className="flex items-center gap-2">
                  <AppIcon
                    name={hint.ok ? 'CheckCircleIcon' : 'XCircleIcon'}
                    size={14}
                    className={hint.ok ? 'text-green-500' : 'text-gray-300'}
                  />
                  <span className={`text-xs ${hint.ok ? 'text-green-700' : 'text-gray-400'}`}>{hint.label}</span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#1B4F72] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#154060] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Guardando...
                </>
              ) : (
                <>
                  <AppIcon name="LockClosedIcon" size={16} className="text-white" />
                  Establecer nueva contraseña
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
