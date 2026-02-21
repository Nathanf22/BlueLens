import React from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Toast } from '../hooks/useToast';

const ICONS = {
  success: <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-400" />,
  error:   <AlertCircle  className="w-4 h-4 flex-shrink-0 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 flex-shrink-0 text-yellow-400" />,
  info:    <Info          className="w-4 h-4 flex-shrink-0 text-blue-400" />,
};

const STYLES = {
  success: 'border-green-500/40 bg-green-950/80',
  error:   'border-red-500/40 bg-red-950/80',
  warning: 'border-yellow-500/40 bg-yellow-950/80',
  info:    'border-blue-500/40 bg-blue-950/80',
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-xl pointer-events-auto
            ${STYLES[toast.type]} text-gray-100 text-sm animate-fade-in`}
        >
          {ICONS[toast.type]}
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 mt-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
