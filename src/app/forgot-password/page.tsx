'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppImage from '@/components/ui/AppImage';
import AppIcon from '@/components/ui/AppIcon';

// Rate-limit: max 3 requests per 10 minutes per session
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const attemptTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove old timestamps outside the window
  while (attemptTimestamps.length > 0 && now - attemptTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    attemptTimestamps.shift();
  }
  return attemptTimestamps.length >= RATE_LIMIT_MAX;
}

function recordAttempt() {
  attemptTimestamps.push(Date.now());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Formato de correo inválido');
      return;
    }

    // Client-side rate limiting
    if (isRateLimited()) {
      setError('Demasiadas solicitudes. Por favor espera unos minutos antes de intentar de nuevo.');
      return;
    }

    setLoading(true);
    recordAttempt();

    try {
      const supabase = createClient();
      // IMPORTANT: Always show the same success message regardless of whether
      // the email exists — prevents user enumeration attacks.
      await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?type=recovery`,
      });
      // Always show success — never reveal if email exists
      setSubmitted(true);
    } catch {
      // Even on error, show generic success to prevent enumeration
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#1B4F72] to-[#0d2137] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-2xl p-2">
            <AppImage
              src="/assets/images/image-1778535755369.png"
              alt="Ballistic Technology Logo"
              width={68}
              height={68}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">Ballistic Technology</h1>
          <p className="text-sm text-blue-200 mt-1">Recuperación de contraseña</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl border border-white/20 p-6">
          {submitted ? (
            /* Success state — generic message regardless of email existence */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AppIcon name="EnvelopeIcon" size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">Revisa tu correo</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Revisa también tu carpeta de spam o correo no deseado.
              </p>
              <a
                href="/login"
                className="mt-6 block w-full py-3 bg-[#1B4F72] text-white font-bold rounded-xl text-sm text-center hover:bg-[#154060] transition-colors"
              >
                Volver al inicio de sesión
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-800 mb-1">¿Olvidaste tu contraseña?</h2>
              <p className="text-xs text-gray-500 mb-5">
                Ingresa tu correo y te enviaremos un enlace para restablecerla.
              </p>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AppIcon name="ExclamationCircleIcon" size={16} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-semibold">{error}</p>
                </div>
              )}

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
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#1B4F72] text-white font-bold rounded-xl text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <AppIcon name="PaperAirplaneIcon" size={16} className="text-white" />
                      Enviar enlace de recuperación
                    </>
                  )}
                </button>

                <div className="text-center">
                  <a
                    href="/login"
                    className="text-xs text-gray-500 hover:text-gray-700 underline transition-colors"
                  >
                    ← Volver al inicio de sesión
                  </a>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-blue-300/60 mt-6">
          © 2026 Ballistic Technology · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
