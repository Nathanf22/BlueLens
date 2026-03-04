import React, { useState } from 'react';
import { FolderOpen, Trash2, Plus, X, RefreshCw, AlertTriangle, GitBranch, Loader2, Globe, Clock, ChevronDown, ChevronUp, GitCommit, ArrowRightLeft, History as GitHistory } from 'lucide-react';
import { RepoConfig } from '../types';
import { fileSystemService } from '../services/fileSystemService';
import { useGitHistory } from '../hooks/useGitHistory';

interface RepoManagerProps {
  repos: RepoConfig[];
  onAddRepo: () => void;
  onAddGithubRepo?: (url: string) => boolean;
  onRemoveRepo: (repoId: string) => void;
  onReopenRepo: (repoId: string) => void;
  onClose: () => void;
  onCreateGraph?: (repoId: string, commitSha?: string) => Promise<any>;
  onStartCodebaseImport?: (repoId: string, commitSha?: string) => void;
  onStartComparison?: (repoId: string, commitSha: string) => void;
  hasConfiguredAI?: boolean;
}

// ---------------------------------------------------------------------------
// GitHistoryPanel — expandable per-repo commit list
// ---------------------------------------------------------------------------

const GitHistoryPanel: React.FC<{
  repoId: string;
  onSelectCommit: (repoId: string, sha: string) => void;
  onCompareCommit?: (repoId: string, sha: string) => void;
  isProcessing?: boolean;
}> = ({ repoId, onSelectCommit, onCompareCommit, isProcessing }) => {
  const [expanded, setExpanded] = useState(false);
  const { commits, loading, error, loadCommits, clearError } = useGitHistory(20);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && commits.length === 0 && !loading) {
      await loadCommits(repoId);
    }
  };

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="border-t border-gray-700/60">
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-dark-700/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Git History
          {commits.length > 0 && (
            <span className="ml-1 text-gray-500">({commits.length} commits)</span>
          )}
        </span>
        {loading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
        }
      </button>

      {/* Commit list */}
      {expanded && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto space-y-1">
          {error && (
            <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="hover:text-red-200">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {loading && commits.length === 0 && (
            <p className="text-xs text-gray-500 py-2 text-center">Loading commits…</p>
          )}
          {!loading && commits.length === 0 && !error && (
            <p className="text-xs text-gray-500 py-2 text-center italic">No commits found</p>
          )}
          {commits.map(commit => (
            <div
              key={commit.sha}
              className="w-full flex items-start gap-2 py-1.5 px-2 rounded hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GitCommit className="w-3.5 h-3.5 text-gray-500 group-hover:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-200 truncate leading-snug font-medium group-hover:text-emerald-300">
                    {commit.message.split('\n')[0]}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectCommit(repoId, commit.sha)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                    >
                      <GitHistory className="w-3.5 h-3.5" />
                      Time Travel
                    </button>
                    <button
                      onClick={() => onCompareCommit?.(repoId, commit.sha)}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Compare
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 italic">
                  <span className="font-mono text-brand-400/80 not-italic">{commit.sha.slice(0, 7)}</span>
                  {' · '}{commit.author}
                  {' · '}{formatDate(commit.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// RepoManager
// ---------------------------------------------------------------------------

export const RepoManager: React.FC<RepoManagerProps> = ({
  repos,
  onAddRepo,
  onAddGithubRepo,
  onRemoveRepo,
  onReopenRepo,
  onClose,
  onCreateGraph,
  onStartCodebaseImport,
  onStartComparison,
  hasConfiguredAI = false,
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
                // Only local (non-GitHub) connected repos can show Git history
                const canShowGitHistory = !isGithub && isConnected;
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
                          disabled={creatingGraphForRepo !== null || !hasConfiguredAI}
                          onClick={async () => {
                            setCreatingGraphForRepo(repo.id);
                            try {
                              onClose();
                              await onCreateGraph!(repo.id);
                            } finally {
                              setCreatingGraphForRepo(null);
                            }
                          }}
                          title={!hasConfiguredAI ? 'An AI API key is required — configure one in AI Settings' : undefined}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
                        >
                          {creatingGraphForRepo === repo.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <GitBranch className="w-3.5 h-3.5" />}
                          {creatingGraphForRepo === repo.id ? 'Creating…' : 'Create Code Graph'}
                        </button>
                        {!hasConfiguredAI && (
                          <span className="text-xs text-yellow-500/80">AI key required</span>
                        )}
                      </div>
                    )}

                    {/* Git History panel — only for local connected repos */}
                    {canShowGitHistory && (
                      <GitHistoryPanel
                        repoId={repo.id}
                        isProcessing={creatingGraphForRepo !== null}
                        onSelectCommit={async (repoId, sha) => {
                          if (onCreateGraph) {
                            setCreatingGraphForRepo(repoId);
                            try {
                              await onCreateGraph(repoId, sha);
                              onClose();
                            } finally {
                              setCreatingGraphForRepo(null);
                            }
                          } else {
                            onClose();
                            onStartCodebaseImport?.(repoId, sha);
                          }
                        }}
                        onCompareCommit={(repoId, sha) => {
                          onClose();
                          onStartComparison?.(repoId, sha);
                        }}
                      />
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
