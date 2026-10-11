'use client';
import React from 'react';

/**
 * Global license notice — fixed bottom-right corner on ALL pages.
 * Small, low-opacity, non-blocking. Required by global rules.
 */
export default function LicenseNotice() {
  return (
    <div
      aria-label="Aviso de licencia"
      className="fixed bottom-2 right-2 z-[9999] pointer-events-none select-none"
      style={{ opacity: 0.45 }}
    >
      <p className="text-[10px] text-gray-600 font-medium leading-tight text-right">
        Recuerda: tienes pendiente un pago.
      </p>
    </div>
  );
}
