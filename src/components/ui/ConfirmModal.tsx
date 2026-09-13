'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-in slide-in-from-bottom-4 duration-200">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${variant === 'danger' ? 'bg-red-100' : 'bg-yellow-100'}`}>
          <Icon
            name={variant === 'danger' ? 'ExclamationTriangleIcon' : 'ExclamationCircleIcon'}
            size={24}
            className={variant === 'danger' ? 'text-red-600' : 'text-yellow-600'}
          />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{title}</h3>
        <p className="text-sm text-gray-500 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-secondary py-3 text-sm">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-sm rounded-xl font-semibold text-white active:scale-95 transition-all ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}