'use client';
import React from 'react';

/**
 * Global license notice — fixed bottom-right corner on ALL pages.
 * Small, low-opacity, non-blocking. Required by global rules.
 * Positioned above the bottom nav (pb-16 = 64px nav height) to avoid overlap.
 */
export default function LicenseNotice() {
  return (
    <div
      aria-label="Aviso de licencia"
      className="fixed bottom-[72px] right-2 z-[9999] pointer-events-none select-none max-w-[calc(100vw-1rem)]"
      style={{ opacity: 0.45 }}
    >
      <p className="text-[10px] text-gray-600 font-medium leading-tight text-right break-words">
        Recuerda: tienes<br />pendiente un pago.
      </p>
    </div>
  );
}
