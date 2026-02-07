import React, { useState } from 'react';
import { X, Search, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Button } from './Button';
import { ScanResult, RepoConfig, ScannedEntity } from '../types';

interface ScanResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repos: RepoConfig[];
  scanResult: ScanResult | null;
  isScanning: boolean;
  scanError: string | null;
  onRunScan: (repoId: string) => void;
  onAddMissing: (entityNames: string[]) => void;
}

export const ScanResultsPanel: React.FC<ScanResultsPanelProps> = ({
  isOpen,
  onClose,
  repos,
  scanResult,
  isScanning,
  scanError,
  onRunScan,
  onAddMissing,
}) => {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id || '');
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleToggleEntity = (name: string) => {
    setSelectedEntities(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSelectAll = (entities: ScannedEntity[]) => {
    setSelectedEntities(new Set(entities.map(e => e.name)));
  };

  const handleAddSelected = () => {
    onAddMissing(Array.from(selectedEntities));
    setSelectedEntities(new Set());
    onClose();
  };

  const handleScan = () => {
    if (selectedRepoId) {
      setSelectedEntities(new Set());
      onRunScan(selectedRepoId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50 shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-brand-400" />
            <h2 className="font-semibold text-white">Code Scan Results</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scan Controls */}
        <div className="p-4 border-b border-gray-800 flex items-center gap-3 shrink-0">
          <select
            value={selectedRepoId}
            onChange={e => setSelectedRepoId(e.target.value)}
            className="flex-1 bg-dark-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-brand-500"
          >
            {repos.length === 0 && <option value="">No repos connected</option>}
            {repos.map(repo => (
              <option key={repo.id} value={repo.id}>{repo.name}</option>
            ))}
          </select>
          <Button
            onClick={handleScan}
            isLoading={isScanning}
            disabled={!selectedRepoId || repos.length === 0}
            icon={<Search className="w-4 h-4" />}
          >
            Scan
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {scanError && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-900/50">
              {scanError}
            </div>
          )}

          {isScanning && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Scanning repository files...</p>
            </div>
          )}

          {!isScanning && !scanResult && !scanError && (
            <div className="text-center text-gray-500 py-8">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select a repository and click Scan to compare code with your diagram.</p>
            </div>
          )}

          {scanResult && (
            <>
              <p className="text-xs text-gray-500">
                Scanned {scanResult.entities.length} symbols in {scanResult.repoName} at{' '}
                {new Date(scanResult.scannedAt).toLocaleTimeString()}
              </p>

              {/* Matches */}
              {scanResult.matches.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-green-400 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Matches ({scanResult.matches.length})
                  </h3>
                  <div className="space-y-1">
                    {scanResult.matches.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-green-900/10 border border-green-900/30 rounded px-3 py-2">
                        <span className="text-gray-300">
                          <span className="text-green-400 font-medium">{m.nodeLabel}</span>
                          {' '}&rarr; {m.entity.name}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          m.confidence === 'exact' ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'
                        }`}>
                          {m.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing in Diagram */}
              {scanResult.missingInDiagram.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-yellow-400">
                      <AlertTriangle className="w-4 h-4" />
                      In Code, Not in Diagram ({scanResult.missingInDiagram.length})
                    </h3>
                    <button
                      onClick={() => handleSelectAll(scanResult.missingInDiagram)}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {scanResult.missingInDiagram.map((entity, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-2 text-xs bg-yellow-900/10 border border-yellow-900/30 rounded px-3 py-2 cursor-pointer hover:bg-yellow-900/20"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEntities.has(entity.name)}
                          onChange={() => handleToggleEntity(entity.name)}
                          className="accent-brand-500"
                        />
                        <span className="text-yellow-300 font-medium">{entity.name}</span>
                        <span className="text-gray-500">{entity.kind}</span>
                        <span className="text-gray-600 ml-auto truncate max-w-[200px]">{entity.filePath}</span>
                      </label>
                    ))}
                  </div>
                  {selectedEntities.size > 0 && (
                    <div className="mt-2">
                      <Button onClick={handleAddSelected} className="w-full">
                        Add {selectedEntities.size} selected to diagram
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Missing in Code */}
              {scanResult.missingInCode.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-orange-400 mb-2">
                    <Info className="w-4 h-4" />
                    In Diagram, Not in Code ({scanResult.missingInCode.length})
                  </h3>
                  <div className="space-y-1">
                    {scanResult.missingInCode.map((node, i) => (
                      <div key={i} className="flex items-center text-xs bg-orange-900/10 border border-orange-900/30 rounded px-3 py-2">
                        <span className="text-orange-300 font-medium">{node.label}</span>
                        <span className="text-gray-500 ml-2">(node: {node.nodeId})</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    These diagram nodes don't match any code symbols. They may be abstract concepts or need code links configured.
                  </p>
                </div>
              )}

              {scanResult.matches.length === 0 && scanResult.missingInDiagram.length === 0 && scanResult.missingInCode.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No symbols found to compare.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
