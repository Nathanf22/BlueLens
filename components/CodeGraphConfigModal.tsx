/**
 * CodeGraphConfigModal — configuration editor for depth rules,
 * anomaly thresholds, and scan patterns.
 */

import React, { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import { CodeGraphConfig, GraphDepth, ScanConfig } from '../types';

interface CodeGraphConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CodeGraphConfig | null;
  onSave: (config: CodeGraphConfig) => void;
  repoId: string;
  graphId: string;
}

export const CodeGraphConfigModal: React.FC<CodeGraphConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  repoId,
  graphId,
}) => {
  const [maxFanOut, setMaxFanOut] = useState(8);
  const [maxFanIn, setMaxFanIn] = useState(10);
  const [includePaths, setIncludePaths] = useState('');
  const [excludePaths, setExcludePaths] = useState('');
  const [ignorePatterns, setIgnorePatterns] = useState('');

  useEffect(() => {
    if (config) {
      setMaxFanOut(config.anomalyThresholds.maxFanOut ?? 8);
      setMaxFanIn(config.anomalyThresholds.maxFanIn ?? 10);
      setIncludePaths(config.scanPatterns.includePaths.join(', '));
      setExcludePaths(config.scanPatterns.excludePaths.join(', '));
      setIgnorePatterns(config.scanPatterns.ignorePatterns.join(', '));
    }
  }, [config]);

  if (!isOpen) return null;

  const handleSave = () => {
    const newConfig: CodeGraphConfig = {
      id: config?.id || graphId,
      repoId,
      depthRules: config?.depthRules || {},
      defaultLensId: config?.defaultLensId,
      anomalyThresholds: {
        maxFanOut,
        maxFanIn,
      },
      scanPatterns: {
        includePaths: includePaths.split(',').map(s => s.trim()).filter(Boolean),
        excludePaths: excludePaths.split(',').map(s => s.trim()).filter(Boolean),
        ignorePatterns: ignorePatterns.split(',').map(s => s.trim()).filter(Boolean),
      },
    };
    onSave(newConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-gray-100">Graph Configuration</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Anomaly Thresholds */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Anomaly Thresholds</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Max Fan-Out</label>
                <input
                  type="number"
                  value={maxFanOut}
                  onChange={e => setMaxFanOut(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-dark-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Max Fan-In</label>
                <input
                  type="number"
                  value={maxFanIn}
                  onChange={e => setMaxFanIn(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-dark-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                  min={1}
                />
              </div>
            </div>
          </div>

          {/* Scan Patterns */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Scan Patterns</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Include Paths (comma-separated globs)</label>
                <input
                  type="text"
                  value={includePaths}
                  onChange={e => setIncludePaths(e.target.value)}
                  placeholder="e.g. src/**, lib/**"
                  className="w-full px-3 py-1.5 bg-dark-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Exclude Paths</label>
                <input
                  type="text"
                  value={excludePaths}
                  onChange={e => setExcludePaths(e.target.value)}
                  placeholder="e.g. **/*.test.ts, **/node_modules/**"
                  className="w-full px-3 py-1.5 bg-dark-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ignore Patterns (symbol names)</label>
                <input
                  type="text"
                  value={ignorePatterns}
                  onChange={e => setIgnorePatterns(e.target.value)}
                  placeholder="e.g. use*, handle*"
                  className="w-full px-3 py-1.5 bg-dark-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
