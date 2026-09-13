'use client';

import React, { useEffect } from 'react';
import { installGlobalErrorHandlers } from '@/lib/errorLogger';

/**
 * Mounts global window error + unhandledrejection listeners.
 * Renders nothing — purely a side-effect component.
 */
export default function GlobalErrorCapture() {
  useEffect(() => {
    const cleanup = installGlobalErrorHandlers();
    return cleanup;
  }, []);

  return null;
}
