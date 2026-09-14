'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppImage from '@/components/ui/AppImage';
import AppIcon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

const bgPatternStyle: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 25% 25%, #ffffff 1px, transparent 1px), radial-gradient(circle at 75% 75%, #ffffff 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Consume searchParams so Next.js knows this component handles dynamic params
  // This prevents the SSR bailout crash on /login?rk_owner=true
  const _params = searchParams?.toString();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Rate-limit protection
  const failedAttemptsRef = useRef(0);
  const lastAttemptRef = useRef(0);
  const retryAfterRef = useRef(0);
  const [retryCountdown, setRetryCountdown] = useState(0);

  // Countdown ticker
  useEffect(() => {
    if (retryCountdown <= 0) return;
    const t = setTimeout(() => setRetryCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [retryCountdown]);

  useEffect(() => {
    let cancelled = false;
    const checkDb = async () => {
      try {
        const supabase = createClient();
        // Lightweight ping — head request, no data returned
        const { error } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
        if (cancelled) return;
        if (!error || error.code === 'PGRST116') {
          setDbStatus('online');
        } else {
          setDbStatus('offline');
        }
      } catch {
        if (!cancelled) setDbStatus('offline');
      }
    };
    checkDb();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Por favor ingresa tu correo y contraseña');
      return;
    }

    // Enforce backoff window
    const now = Date.now();
    if (now < retryAfterRef.current) {
      const secs = Math.ceil((retryAfterRef.current - now) / 1000);
      toast.error(`Demasiados intentos. Espera ${secs}s antes de intentar de nuevo.`);
      setRetryCountdown(secs);
      return;
    }

    // Debounce: ignore if last attempt was < 1 s ago
    if (now - lastAttemptRef.current < 1000) return;
    lastAttemptRef.current = now;

    setLoading(true);
    try {
      const data = (await signIn(email, password)) as { user?: { id: string; user_metadata?: Record<string, unknown> } } | null;

      // Success — reset backoff
      failedAttemptsRef.current = 0;
      retryAfterRef.current = 0;
      setRetryCountdown(0);

      if (data?.user) {
        // Read must_reset_password and is_active from JWT metadata — NO DB query
        const meta = data.user.user_metadata ?? {};
        const isActive = meta.is_active !== undefined ? Boolean(meta.is_active) : true;
        const mustReset = Boolean(meta.must_reset_password);

        if (!isActive) {
          const supabase = createClient();
          await supabase.auth.signOut();
          toast.error('Tu cuenta está desactivada. Contacta al administrador.');
          setLoading(false);
          return;
        }

        if (mustReset) {
          router.replace('/reset-password');
          return;
        }
      }

      router.replace('/vehicle-inspection');
      router.refresh();
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number };
      const msg = err?.message || '';
      const status = err?.status ?? 0;

      // Increment failed attempts and compute exponential backoff
      failedAttemptsRef.current += 1;
      const attempts = failedAttemptsRef.current;

      if (status === 429 || msg.toLowerCase().includes('too many requests') || msg.toLowerCase().includes('rate limit')) {
        const waitMs = 60_000;
        retryAfterRef.current = Date.now() + waitMs;
        const secs = Math.ceil(waitMs / 1000);
        setRetryCountdown(secs);
        toast.error(`Demasiadas solicitudes al servidor. Espera ${secs}s.`);
      } else if (attempts >= 3) {
        const waitMs = Math.min(5_000 * Math.pow(2, attempts - 3), 120_000);
        retryAfterRef.current = Date.now() + waitMs;
        const secs = Math.ceil(waitMs / 1000);
        setRetryCountdown(secs);
        if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
          toast.error(`Credenciales incorrectas. Espera ${secs}s antes de reintentar.`);
        } else {
          toast.error(`Error al iniciar sesión. Espera ${secs}s antes de reintentar.`);
        }
      } else {
        if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
          toast.error('Correo o contraseña incorrectos');
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          toast.error('Por favor confirma tu correo electrónico');
        } else {
          toast.error('Error al iniciar sesión. Intenta de nuevo.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#1B4F72] to-[#0d2137] flex flex-col items-center justify-center px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={bgPatternStyle} />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mb-5 shadow-2xl p-2">
            <AppImage
              src="/assets/images/image-1778535755369.png"
              alt="Ballistic Technology Logo"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Ballistic Technology</h1>
          <p className="text-sm text-blue-200 mt-1 font-medium">Plataforma de Inspección Vehicular</p>
          <div className="flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-3 py-1">
            <AppIcon name="ShieldCheckIcon" size={12} className="text-blue-300" />
            <span className="text-xs text-blue-200 font-semibold">Evidencia Legal Certificada</span>
          </div>
          {/* DB Connection Status */}
          <div className={`flex items-center gap-1.5 mt-2 rounded-full px-3 py-1 ${
            dbStatus === 'checking' ? 'bg-white/10' :
            dbStatus === 'online' ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            {dbStatus === 'checking' ? (
              <>
                <svg className="animate-spin h-2.5 w-2.5 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-blue-200">Verificando conexión BD...</span>
              </>
            ) : dbStatus === 'online' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-300 font-semibold">BD Conectada</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs text-red-300 font-semibold">BD Sin conexión</span>
              </>
            )}
          </div>
        </div>

        {/* Retry countdown banner */}
        {retryCountdown > 0 && (
          <div className="mb-4 bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-3 flex items-center gap-2">
            <AppIcon name="ClockIcon" size={16} className="text-amber-300 flex-shrink-0" />
            <p className="text-xs text-amber-200 font-semibold">
              Demasiados intentos. Espera {retryCountdown}s antes de reintentar.
            </p>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-white/20 p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Iniciar Sesión</h2>
          <p className="text-xs text-gray-500 mb-5">Acceso exclusivo para personal autorizado</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <AppIcon name="EnvelopeIcon" size={18} className="text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72] transition-colors bg-gray-50"
                  disabled={loading || retryCountdown > 0}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <AppIcon name="LockClosedIcon" size={18} className="text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/30 focus:border-[#1B4F72] transition-colors bg-gray-50"
                  disabled={loading || retryCountdown > 0}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  tabIndex={-1}
                >
                  <AppIcon
                    name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'}
                    size={18}
                    className="text-gray-400"
                  />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || retryCountdown > 0}
              className="w-full py-3 bg-[#1B4F72] text-white font-bold rounded-xl text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Iniciando sesión...
                </>
              ) : retryCountdown > 0 ? (
                `Espera ${retryCountdown}s`
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-blue-300/60 mt-6">
          © 2026 Ballistic Technology · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#1B4F72] to-[#0d2137]"><div className="text-white text-sm">Cargando...</div></div>}>
      <LoginPageInner />
    </Suspense>
  );
}
