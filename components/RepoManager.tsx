import React, { useState } from 'react';
import { FolderOpen, Trash2, Plus, X, RefreshCw, AlertTriangle, GitBranch, Loader2, Globe } from 'lucide-react';
import { RepoConfig } from '../types';
import { fileSystemService } from '../services/fileSystemService';

interface RepoManagerProps {
  repos: RepoConfig[];
  onAddRepo: () => void;
  onAddGithubRepo?: (url: string) => boolean;
  onRemoveRepo: (repoId: string) => void;
  onReopenRepo: (repoId: string) => void;
  onClose: () => void;
  onCreateGraph?: (repoId: string) => Promise<any>;
}

export const RepoManager: React.FC<RepoManagerProps> = ({
  repos,
  onAddRepo,
  onAddGithubRepo,
  onRemoveRepo,
  onReopenRepo,
  onClose,
  onCreateGraph
}) => {
  const [creatingGraphForRepo, setCreatingGraphForRepo] = useState<string | null>(null);
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const isSupported = fileSystemService.isSupported();

  const handleAddGithubRepo = () => {
    if (!githubUrl.trim()) return;
    const ok = onAddGithubRepo?.(githubUrl.trim());
    if (ok !== false) {
      setGithubUrl('');
      setShowGithubInput(false);
    }
  };

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
                const isGithub = !!repo.githubOwner;
                const isConnected = isGithub || fileSystemService.hasHandle(repo.id);
                return (
                  <div
                    key={repo.id}
                    className="bg-dark-800 rounded-lg border border-gray-700 overflow-hidden"
                  >
                    {/* Top row: info + actions */}
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {isGithub
                          ? <Globe className="w-4 h-4 flex-shrink-0 text-blue-400" />
                          : <FolderOpen className={`w-4 h-4 flex-shrink-0 ${isConnected ? 'text-green-400' : 'text-gray-500'}`} />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{repo.name}</p>
                          <p className={`text-xs ${isGithub ? 'text-blue-400' : isConnected ? 'text-green-400' : 'text-gray-500'}`}>
                            {isGithub ? `Public GitHub · ${repo.githubBranch || 'main'}` : isConnected ? 'Connected' : 'Disconnected'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isConnected && !isGithub && (
                          <button
                            onClick={() => onReopenRepo(repo.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-dark-700 text-brand-400 hover:text-brand-300 transition-colors text-xs font-medium"
                            title="Reconnect this repository"
                            disabled={!isSupported}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Reconnect
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

                    {/* Bottom row: create graph button */}
                    {isConnected && onCreateGraph && (
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700/60 bg-dark-900/40">
                        <button
                          disabled={creatingGraphForRepo !== null}
                          onClick={async () => {
                            setCreatingGraphForRepo(repo.id);
                            try {
                              onClose();
                              await onCreateGraph!(repo.id);
                            } finally {
                              setCreatingGraphForRepo(null);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
                        >
                          {creatingGraphForRepo === repo.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <GitBranch className="w-3.5 h-3.5" />}
                          {creatingGraphForRepo === repo.id ? 'Creating…' : 'Create Code Graph'}
                        </button>
                      </div>
                    )}
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
        <div className="px-6 py-4 border-t border-gray-700 space-y-3">
          {/* GitHub URL input */}
          {showGithubInput && (
            <div className="flex gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="flex-1 text-sm bg-dark-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddGithubRepo();
                  if (e.key === 'Escape') { setShowGithubInput(false); setGithubUrl(''); }
                }}
              />
              <button
                onClick={handleAddGithubRepo}
                className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Add
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={onAddRepo}
                disabled={!isSupported}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Open Directory
              </button>
              {onAddGithubRepo && (
                <button
                  onClick={() => { setShowGithubInput(v => !v); setGithubUrl(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${showGithubInput ? 'bg-blue-700/20 border-blue-500/50 text-blue-400' : 'bg-dark-800 border-gray-700 text-gray-300 hover:text-blue-400 hover:border-blue-500/50'}`}
                >
                  <Globe className="w-4 h-4" />
                  GitHub URL
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
    </div>
  );
};
