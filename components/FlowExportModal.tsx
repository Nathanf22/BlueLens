import React from 'react';
import { GitBranch, RefreshCw, Plus, X } from 'lucide-react';
import { Button } from './Button';
import { CodeGraph } from '../types';

interface FlowExportModalProps {
  graph: CodeGraph;
  flowCount: number;
  onOverwrite: () => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export const FlowExportModal: React.FC<FlowExportModalProps> = ({
  graph,
  flowCount,
  onOverwrite,
  onCreateNew,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-cyan-400" />
            <h2 className="font-semibold text-white">Export Flows to Diagrams</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-300">
            <span className="text-white font-medium">{flowCount} flow{flowCount !== 1 ? 's' : ''}</span> from{' '}
            <span className="text-cyan-400 font-medium">{graph.name}</span> are ready to be added to your diagrams.
          </p>
          <p className="text-sm text-gray-400">
            A folder <span className="text-gray-200 font-mono text-xs bg-dark-800 px-1.5 py-0.5 rounded">Flows: {graph.name}</span> already exists.
            What would you like to do?
          </p>

          <div className="space-y-2 pt-1">
            <button
              onClick={onOverwrite}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-cyan-700 hover:bg-cyan-900/10 transition-colors text-left"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-white">Overwrite existing</div>
                <div className="text-xs text-gray-500 mt-0.5">Replace the previous export. Existing edits on those diagrams will be lost.</div>
              </div>
            </button>

            <button
              onClick={onCreateNew}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-dark-800 transition-colors text-left"
            >
              <Plus className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-white">Create new folder</div>
                <div className="text-xs text-gray-500 mt-0.5">Keep the old diagrams and create a new versioned folder alongside.</div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};
