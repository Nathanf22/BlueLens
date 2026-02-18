import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9998]" onClick={onCancel}>
    <div
      className="bg-dark-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-sm mx-4 p-5"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start gap-3 mb-5">
        <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-yellow-400'}`} />
        <p className="text-sm text-gray-200 leading-relaxed">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 bg-dark-800 hover:bg-dark-700 border border-gray-700 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-3 py-1.5 text-sm text-white rounded-md transition-colors ${
            danger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
