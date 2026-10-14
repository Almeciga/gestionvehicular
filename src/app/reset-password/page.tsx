'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';
import AppIcon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

// Password strength validation
function validatePassword(pwd: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (pwd.length < 8) errors.push('Al menos 8 caracteres');
  if (!/[a-z]/.test(pwd)) errors.push('Al menos una letra minúscula');
  if (!/[A-Z]/.test(pwd)) errors.push('Al menos una letra mayúscula');
  if (!/\d/.test(pwd)) errors.push('Al menos un número');
  return { valid: errors.length === 0, errors };
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = searchParams?.get('error');
  const { user, profile, refreshProfile, loading } = useAuth();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const justReset = useRef(false);

  const { valid: pwdValid, errors: pwdErrors } = validatePassword(password);
  const confirmMatch = password === confirm;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profile && !profile.must_reset_password && !justReset.current) {
      router.replace('/vehicle-inspection');
    }
  }, [loading, user, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pwdValid) {
      toast.error('La contraseña no cumple los requisitos mínimos');
      return;
    }
    if (!confirmMatch) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        // Handle specific Supabase errors
        if (error.message?.toLowerCase().includes('same password')) {
          toast.error('La nueva contraseña debe ser diferente a la actual');
          return;
        }
        throw error;
      }

      // Clear must_reset_password flag
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_reset_password: false })
        .eq('id', user?.id);

      if (profileError) {
        console.error('[ResetPassword] Error clearing must_reset_password:', profileError);
      }

      justReset.current = true;
      await refreshProfile();
      toast.success('Contraseña actualizada correctamente. ¡Bienvenido!');
      router.replace('/vehicle-inspection');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar contraseña';
      toast.error(msg);
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

  // Expired / invalid link state
  if (linkError === 'link_expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AppIcon name="ExclamationCircleIcon" size={28} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Enlace expirado o inválido</h2>
            <p className="text-sm text-gray-600 mb-5">
              El enlace de recuperación ha expirado o ya fue utilizado. Por favor solicita uno nuevo.
            </p>
            <a
              href="/forgot-password"
              className="block w-full py-3 bg-[#1B4F72] text-white font-bold rounded-xl text-sm text-center hover:bg-[#154060] transition-colors"
            >
              Solicitar nuevo enlace
            </a>
            <a href="/login" className="block mt-3 text-xs text-gray-500 underline">
              Volver al inicio de sesión
            </a>
          </div>
        </div>
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
          <p className="text-sm text-gray-500 mt-1">Cambio de contraseña</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
            <AppIcon name="ExclamationTriangleIcon" size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {profile?.must_reset_password ? 'Cambio de contraseña obligatorio' : 'Nueva contraseña'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Establece una contraseña segura con al menos 8 caracteres, mayúsculas, minúsculas y números.
              </p>
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
                  autoComplete="new-password"
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
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 bg-gray-50 ${
                    confirm && !confirmMatch
                      ? 'border-red-300 focus:ring-red-200' :'border-gray-200 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72]'
                  }`}
                  disabled={saving}
                  autoComplete="new-password"
                />
              </div>
              {confirm && !confirmMatch && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Password strength indicators */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Requisitos de seguridad:</p>
              {[
                { label: 'Al menos 8 caracteres', ok: password.length >= 8 },
                { label: 'Letras mayúsculas y minúsculas', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
                { label: 'Al menos un número', ok: /\d/.test(password) },
                { label: 'Las contraseñas coinciden', ok: !!confirm && confirmMatch },
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
              disabled={saving || !pwdValid || !confirmMatch}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#1B4F72] border-t-transparent rounded-full" />
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}
