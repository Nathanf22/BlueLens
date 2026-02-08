import React, { useState } from 'react';
import { X, Search, CheckCircle2, AlertTriangle, Info, Loader2, Plus, Trash2, RefreshCw, Settings2, Check, XCircle } from 'lucide-react';
import { Button } from './Button';
import { ScanResult, RepoConfig, SyncSuggestion, SyncMode, ScanConfig } from '../types';

interface ScanResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repos: RepoConfig[];
  scanResult: ScanResult | null;
  isScanning: boolean;
  scanError: string | null;
  onRunScan: (repoId: string) => void;
  onAddMissing: (entityNames: string[]) => void;
  syncMode: SyncMode;
  onSetSyncMode: (mode: SyncMode) => void;
  onApplySuggestion: (suggestion: SyncSuggestion) => void;
  onApplyAllSuggestions: (suggestions: SyncSuggestion[]) => void;
  onUpdateScanConfig?: (repoId: string, config: ScanConfig) => void;
}

const SUGGESTION_ICONS: Record<SyncSuggestion['type'], React.ReactNode> = {
  add_component: <Plus className="w-3.5 h-3.5 text-green-400" />,
  remove_component: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
  add_relationship: <Plus className="w-3.5 h-3.5 text-blue-400" />,
  update_relationship: <RefreshCw className="w-3.5 h-3.5 text-yellow-400" />,
  mark_obsolete: <XCircle className="w-3.5 h-3.5 text-orange-400" />,
};

const SUGGESTION_COLORS: Record<SyncSuggestion['type'], string> = {
  add_component: 'border-green-900/30 bg-green-900/10',
  remove_component: 'border-red-900/30 bg-red-900/10',
  add_relationship: 'border-blue-900/30 bg-blue-900/10',
  update_relationship: 'border-yellow-900/30 bg-yellow-900/10',
  mark_obsolete: 'border-orange-900/30 bg-orange-900/10',
};

export const ScanResultsPanel: React.FC<ScanResultsPanelProps> = ({
  isOpen,
  onClose,
  repos,
  scanResult,
  isScanning,
  scanError,
  onRunScan,
  onAddMissing,
  syncMode,
  onSetSyncMode,
  onApplySuggestion,
  onApplyAllSuggestions,
  onUpdateScanConfig,
}) => {
  const [selectedRepoId, setSelectedRepoId] = useState<string>(repos[0]?.id || '');
  const [showScanConfig, setShowScanConfig] = useState(false);
  const [configInclude, setConfigInclude] = useState('');
  const [configExclude, setConfigExclude] = useState('');
  const [configIgnore, setConfigIgnore] = useState('');
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const handleScan = () => {
    if (selectedRepoId) {
      setAppliedSuggestions(new Set());
      onRunScan(selectedRepoId);
    }
  };

  const handleApplySuggestion = (suggestion: SyncSuggestion, index: number) => {
    onApplySuggestion(suggestion);
    setAppliedSuggestions(prev => new Set(prev).add(index));
  };

  const handleApplyAll = () => {
    if (scanResult) {
      const unapplied = scanResult.suggestions.filter((_, i) => !appliedSuggestions.has(i));
      onApplyAllSuggestions(unapplied);
      setAppliedSuggestions(new Set(scanResult.suggestions.map((_, i) => i)));
    }
  };

  const handleSaveScanConfig = () => {
    if (selectedRepoId && onUpdateScanConfig) {
      onUpdateScanConfig(selectedRepoId, {
        includePaths: configInclude.split(',').map(s => s.trim()).filter(Boolean),
        excludePaths: configExclude.split(',').map(s => s.trim()).filter(Boolean),
        ignorePatterns: configIgnore.split(',').map(s => s.trim()).filter(Boolean),
      });
    }
  };

  const suggestions = scanResult?.suggestions || [];
  const groupedByType = suggestions.reduce((acc, s) => {
    if (!acc[s.type]) acc[s.type] = [];
    acc[s.type].push(s);
    return acc;
  }, {} as Record<string, SyncSuggestion[]>);

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

        {/* Sync Mode + Scan Controls */}
        <div className="p-4 border-b border-gray-800 space-y-3 shrink-0">
          {/* Sync Mode Selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 shrink-0">Sync Mode:</label>
            <select
              value={syncMode}
              onChange={e => onSetSyncMode(e.target.value as SyncMode)}
              className="bg-dark-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="manual">Manual</option>
              <option value="semi-auto">Semi-auto</option>
              <option value="auto">Auto</option>
            </select>
            <span className="text-[10px] text-gray-600">
              {syncMode === 'manual' && 'Review and apply suggestions individually'}
              {syncMode === 'semi-auto' && 'Auto-add new components, review removals'}
              {syncMode === 'auto' && 'Auto-add all, confirm before removing'}
            </span>
          </div>

          {/* Repo + Scan button */}
          <div className="flex items-center gap-3">
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
            <button
              onClick={() => setShowScanConfig(!showScanConfig)}
              className="p-2 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Scan config"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <Button
              onClick={handleScan}
              isLoading={isScanning}
              disabled={!selectedRepoId || repos.length === 0}
              icon={<Search className="w-4 h-4" />}
            >
              Scan
            </Button>
          </div>

          {/* Scan Config (expandable) */}
          {showScanConfig && (
            <div className="bg-dark-800 border border-gray-700 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-400 font-medium">Scan Configuration</p>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Include paths (comma-separated globs)</label>
                <input
                  value={configInclude}
                  onChange={e => setConfigInclude(e.target.value)}
                  placeholder="e.g. src/**, lib/**"
                  className="w-full bg-dark-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Exclude paths (comma-separated globs)</label>
                <input
                  value={configExclude}
                  onChange={e => setConfigExclude(e.target.value)}
                  placeholder="e.g. **/*.test.ts, **/node_modules/**"
                  className="w-full bg-dark-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Ignore symbol patterns (comma-separated)</label>
                <input
                  value={configIgnore}
                  onChange={e => setConfigIgnore(e.target.value)}
                  placeholder="e.g. use*, handle*, *Helper"
                  className="w-full bg-dark-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                />
              </div>
              <button
                onClick={handleSaveScanConfig}
                className="text-xs px-3 py-1 bg-brand-600 text-white rounded hover:bg-brand-500 transition-colors"
              >
                Save Config
              </button>
            </div>
          )}
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

              {/* Typed Suggestions */}
              {suggestions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-yellow-400">
                      <AlertTriangle className="w-4 h-4" />
                      Suggestions ({suggestions.length})
                    </h3>
                    {suggestions.length > 1 && (
                      <button
                        onClick={handleApplyAll}
                        className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        Apply all
                      </button>
                    )}
                  </div>

                  {Object.entries(groupedByType).map(([type, items]) => (
                    <div key={type} className="mb-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                        {type.replace(/_/g, ' ')}
                      </p>
                      <div className="space-y-1">
                        {items.map((suggestion, i) => {
                          const globalIndex = suggestions.indexOf(suggestion);
                          const isApplied = appliedSuggestions.has(globalIndex);
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-2 text-xs border rounded px-3 py-2 ${SUGGESTION_COLORS[suggestion.type]}`}
                            >
                              {SUGGESTION_ICONS[suggestion.type]}
                              <div className="flex-1 min-w-0">
                                <span className="text-gray-200 font-medium">{suggestion.label}</span>
                                <p className="text-gray-500 text-[10px] truncate">{suggestion.description}</p>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                suggestion.confidence === 'exact' ? 'bg-green-900/40 text-green-300' :
                                suggestion.confidence === 'fuzzy' ? 'bg-yellow-900/40 text-yellow-300' :
                                'bg-gray-800 text-gray-400'
                              }`}>
                                {suggestion.confidence}
                              </span>
                              {isApplied ? (
                                <span className="text-green-400">
                                  <Check className="w-4 h-4" />
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleApplySuggestion(suggestion, globalIndex)}
                                  className="text-brand-400 hover:text-brand-300 transition-colors p-1"
                                  title="Apply"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing in Code (kept for context) */}
              {scanResult.missingInCode.length > 0 && suggestions.filter(s => s.type === 'mark_obsolete').length === 0 && (
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
                </div>
              )}

              {scanResult.matches.length === 0 && suggestions.length === 0 && scanResult.missingInCode.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No symbols found to compare.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
