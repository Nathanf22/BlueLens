import React from 'react';
import { FolderOpen, Trash2, Plus, X, RefreshCw, AlertTriangle, GitBranch } from 'lucide-react';
import { RepoConfig } from '../types';
import { fileSystemService } from '../services/fileSystemService';

interface RepoManagerProps {
  repos: RepoConfig[];
  onAddRepo: () => void;
  onRemoveRepo: (repoId: string) => void;
  onReopenRepo: (repoId: string) => void;
  onClose: () => void;
  onGenerateDiagrams?: () => void;
}

export const RepoManager: React.FC<RepoManagerProps> = ({
  repos,
  onAddRepo,
  onRemoveRepo,
  onReopenRepo,
  onClose,
  onGenerateDiagrams
}) => {
  const isSupported = fileSystemService.isSupported();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-gray-100">Repositories</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!isSupported && (
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-400">Browser Not Supported</p>
                <p className="text-xs text-yellow-400/70 mt-1">
                  The File System Access API is only available in Chrome and Edge. Please switch to a supported browser.
                </p>
              </div>
            </div>
          )}

          {repos.length > 0 ? (
            <div className="space-y-2">
              {repos.map(repo => {
                const isConnected = fileSystemService.hasHandle(repo.id);
                return (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderOpen className={`w-4 h-4 flex-shrink-0 ${isConnected ? 'text-green-400' : 'text-gray-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{repo.name}</p>
                        <p className={`text-xs ${isConnected ? 'text-green-400' : 'text-gray-500'}`}>
                          {isConnected ? 'Connected' : 'Disconnected — reopen to reconnect'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isConnected && (
                        <button
                          onClick={() => onReopenRepo(repo.id)}
                          className="p-2 rounded hover:bg-dark-700 text-brand-400 hover:text-brand-300 transition-colors"
                          title="Reopen directory"
                          disabled={!isSupported}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveRepo(repo.id)}
                        className="p-2 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                        title="Remove repository"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic text-center py-4">
              No repositories connected yet
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onAddRepo}
              disabled={!isSupported}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Open Directory
            </button>
            {onGenerateDiagrams && repos.some(r => fileSystemService.hasHandle(r.id)) && (
              <button
                onClick={() => { onClose(); onGenerateDiagrams(); }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <GitBranch className="w-4 h-4" />
                Generate Diagrams
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-lg transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
