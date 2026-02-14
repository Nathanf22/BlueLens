import React, { useState } from 'react';
import { X, GitBranch, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { RepoConfig, CodebaseImportProgress } from '../types';
import { fileSystemService } from '../services/fileSystemService';

interface CodebaseImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  repos: RepoConfig[];
  onStartImport: (repoId: string) => void;
  progress: CodebaseImportProgress | null;
  isImporting: boolean;
  onReset: () => void;
}

const STEP_LABELS: Record<string, string> = {
  scanning: 'Scanning Files',
  analyzing: 'Analyzing Structure',
  generating: 'Generating Diagrams',
  creating: 'Creating Diagrams',
  linking: 'Linking Navigation',
  done: 'Complete',
  error: 'Error',
};

export const CodebaseImportModal: React.FC<CodebaseImportModalProps> = ({
  isOpen,
  onClose,
  repos,
  onStartImport,
  progress,
  isImporting,
  onReset,
}) => {
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');

  if (!isOpen) return null;

  const connectedRepos = repos.filter(r => fileSystemService.hasHandle(r.id));
  const isDone = progress?.step === 'done';
  const isError = progress?.step === 'error';

  const handleStart = () => {
    if (!selectedRepoId) return;
    onStartImport(selectedRepoId);
  };

  const handleClose = () => {
    if (!isImporting) {
      onReset();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-gray-100">Generate Diagrams from Code</h2>
          </div>
          {!isImporting && (
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!progress && (
            <>
              <p className="text-sm text-gray-400">
                Analyze a connected repository and generate navigable Mermaid diagrams at 3 levels:
                system overview, module detail, and file detail.
              </p>

              {connectedRepos.length === 0 ? (
                <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-400">
                    No connected repositories. Open a repository from the Repo Manager first.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Select Repository
                    </label>
                    <select
                      value={selectedRepoId}
                      onChange={e => setSelectedRepoId(e.target.value)}
                      className="w-full bg-dark-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Choose a repository...</option>
                      {connectedRepos.map(repo => (
                        <option key={repo.id} value={repo.id}>{repo.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleStart}
                    disabled={!selectedRepoId}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    Generate Diagrams
                  </button>
                </>
              )}
            </>
          )}

          {progress && (
            <div className="space-y-4">
              {/* Step label */}
              <div className="flex items-center gap-2">
                {isDone && <CheckCircle className="w-5 h-5 text-green-400" />}
                {isError && <AlertCircle className="w-5 h-5 text-red-400" />}
                {!isDone && !isError && <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />}
                <span className={`text-sm font-medium ${
                  isDone ? 'text-green-400' : isError ? 'text-red-400' : 'text-gray-200'
                }`}>
                  {STEP_LABELS[progress.step] || progress.step}
                </span>
              </div>

              {/* Progress bar */}
              {!isError && (
                <div className="w-full bg-dark-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDone ? 'bg-green-500' : 'bg-brand-500'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              )}

              {/* Message */}
              <p className={`text-sm ${isError ? 'text-red-400' : 'text-gray-400'}`}>
                {progress.message}
              </p>

              {/* Summary on completion */}
              {isDone && progress.diagramsCreated && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-green-400">
                    Created {progress.diagramsCreated} diagrams with drill-down navigation.
                    Check the "Generated" folder in the sidebar.
                  </p>
                </div>
              )}

              {/* Close button when done or errored */}
              {(isDone || isError) && (
                <button
                  onClick={handleClose}
                  className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-lg transition-colors text-sm"
                >
                  {isDone ? 'Done' : 'Close'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
