import React from 'react';
import { X, Check, XCircle } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';

interface DiffViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalCode: string;
  modifiedCode: string;
  onApply: (code: string) => void;
}

export const DiffViewModal: React.FC<DiffViewModalProps> = ({
  isOpen,
  onClose,
  originalCode,
  modifiedCode,
  onApply,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50 shrink-0">
          <h2 className="font-semibold text-white">Diagram Changes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 min-h-0">
          <DiffEditor
            original={originalCode}
            modified={modifiedCode}
            language="plaintext"
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800 bg-dark-800/50 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Dismiss
          </button>
          <button
            onClick={() => {
              onApply(modifiedCode);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-500 transition-colors"
          >
            <Check className="w-4 h-4" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
