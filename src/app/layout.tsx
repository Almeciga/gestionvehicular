import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import ToastProvider from '@/components/ToastProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import OfflineBanner from '@/components/OfflineBanner';
import QueryProvider from '@/components/QueryProvider';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'GestionVehicular — Inspección y Producción Automotriz',
  description: 'Plataforma profesional de inspección y producción vehicular para talleres automotrices. Checklists, fotos, firmas y reportes PDF.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <AuthProvider>
            <OfflineBanner />
            {children}
            <ToastProvider />
          </AuthProvider>
        </QueryProvider>

<script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fgestionveh3142back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.20" />
<script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.3" /></body>
    </html>
  );
}