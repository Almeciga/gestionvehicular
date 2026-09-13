'use client';
import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        style: {
          background: '#1B4F72',
          color: '#fff',
          borderRadius: '12px',
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: '600',
          fontSize: '14px',
        },
        duration: 3000,
      }}
    />
  );
}