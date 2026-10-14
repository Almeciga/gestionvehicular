'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

type ConfirmReasonDialogProps = {
  placa: string;
  variant: 'unlock' | 'reject';
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export default function ConfirmReasonDialog({ placa, variant, onConfirm, onCancel }: ConfirmReasonDialogProps) {
  const [reason, setReason] = useState('');

  const isUnlock = variant === 'unlock';

  const config = isUnlock
    ? {
        iconName: 'LockOpenIcon' as const,
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        title: 'Desbloquear Inspección',
        helperText: 'Esta acción quedará registrada en el historial de auditoría. Ingrese el motivo del desbloqueo:',
        placeholder: 'Ej: Corrección de datos del propietario solicitada por gerencia...',
        helperCaption: 'Mínimo 5 caracteres requeridos',
        ringColor: 'focus:ring-amber-400',
        confirmBg: 'bg-amber-500',
        confirmLabel: 'Desbloquear',
      }
    : {
        iconName: 'XCircleIcon' as const,
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        title: 'Rechazar Inspección',
        helperText: null,
        placeholder: 'Motivo del rechazo...',
        helperCaption: null,
        ringColor: 'focus:ring-red-400',
        confirmBg: 'bg-red-500',
        confirmLabel: 'Rechazar',
      };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}>
            <Icon name={config.iconName} size={20} className={config.iconColor} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">{config.title}</h3>
            <p className="text-xs text-gray-500">{placa}</p>
          </div>
        </div>
        {config.helperText && (
          <p className="text-sm text-gray-600 mb-3">{config.helperText}</p>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={config.placeholder}
          className={`w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 ${config.ringColor}`}
        />
        {config.helperCaption && (
          <p className="text-xs text-gray-400 mt-1 mb-4">{config.helperCaption}</p>
        )}
        <div className={`flex gap-2 ${config.helperCaption ? '' : 'mt-4'}`}>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">Cancelar</button>
          <button
            onClick={() => reason.trim().length >= 5 && onConfirm(reason.trim())}
            disabled={reason.trim().length < 5}
            className={`flex-1 py-2.5 rounded-xl ${config.confirmBg} text-white font-semibold text-sm disabled:opacity-40`}
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
