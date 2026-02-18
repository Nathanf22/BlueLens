import React, { useState, useEffect } from 'react';
import { Code, Trash2, Plus, X } from 'lucide-react';
import { Diagram, RepoConfig, CodeSymbol } from '../types';
import { svgParserService, ParsedNode } from '../services/svgParserService';
import { fileSystemService } from '../services/fileSystemService';
import { codeParserService } from '../services/codeParserService';
import { FileBrowser } from './FileBrowser';

interface CodeLinkManagerProps {
  currentDiagram: Diagram;
  repos: RepoConfig[];
  onAddCodeLink: (
    nodeId: string,
    repoId: string,
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
    label?: string
  ) => void;
  onRemoveCodeLink: (nodeId: string) => void;
  onClose: () => void;
}

export const CodeLinkManager: React.FC<CodeLinkManagerProps> = ({
  currentDiagram,
  repos,
  onAddCodeLink,
  onRemoveCodeLink,
  onClose
}) => {
  const [availableNodes, setAvailableNodes] = useState<ParsedNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [lineStart, setLineStart] = useState('');
  const [lineEnd, setLineEnd] = useState('');
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  // Track which repos have an active handle (may update as reconnect runs)
  const [connectedRepoIds, setConnectedRepoIds] = useState<Set<string>>(
    () => new Set(repos.filter(r => fileSystemService.hasHandle(r.id)).map(r => r.id))
  );
  const [repoConnecting, setRepoConnecting] = useState(false);

  // Parse nodes from rendered SVG — retries once after 150ms if Mermaid not yet rendered.
  useEffect(() => {
    const queryNodes = () => {
      const svgContainer = document.querySelector('.mermaid-svg-container');
      const svgElement = svgContainer?.querySelector('svg');
      if (svgElement) {
        const nodes = svgParserService.parseNodes(svgElement as SVGElement);
        if (nodes.length > 0) { setAvailableNodes(nodes); return true; }
      }
      return false;
    };
    if (!queryNodes()) {
      const t = setTimeout(queryNodes, 150);
      return () => clearTimeout(t);
    }
  }, []);

  // Silently reconnect repos from IndexedDB on mount (handles lost after page refresh).
  useEffect(() => {
    let cancelled = false;
    const reconnect = async () => {
      const connected = new Set(repos.filter(r => fileSystemService.hasHandle(r.id)).map(r => r.id));
      for (const repo of repos) {
        if (connected.has(repo.id)) continue;
        const result = await fileSystemService.reconnectRepo(repo.id);
        if (!cancelled && result) connected.add(repo.id);
      }
      if (!cancelled) setConnectedRepoIds(new Set(connected));
    };
    reconnect();
    return () => { cancelled = true; };
  }, [repos]);

  // When the user selects a repo that isn't connected, try to reconnect it.
  const handleRepoSelect = async (repoId: string) => {
    setSelectedRepoId(repoId);
    setSelectedFilePath('');
    if (!repoId || connectedRepoIds.has(repoId)) return;
    setRepoConnecting(true);
    const result = await fileSystemService.reconnectRepo(repoId);
    if (result) setConnectedRepoIds(prev => new Set([...prev, repoId]));
    setRepoConnecting(false);
  };

  // Extract symbols when a file is selected
  useEffect(() => {
    if (!selectedRepoId || !selectedFilePath) {
      setSymbols([]);
      return;
    }

    const handle = fileSystemService.getHandle(selectedRepoId);
    if (!handle) return;

    let cancelled = false;
    fileSystemService.readFile(handle, selectedFilePath)
      .then(content => {
        if (cancelled) return;
        const lang = fileSystemService.getLanguage(selectedFilePath);
        setSymbols(codeParserService.extractSymbols(content, lang));
      })
      .catch(() => {
        if (!cancelled) setSymbols([]);
      });
    return () => { cancelled = true; };
  }, [selectedRepoId, selectedFilePath]);

  // Show ALL workspace repos — user can select any and we reconnect on demand
  const connectedRepos = repos;
  const codeLinks = currentDiagram.codeLinks || [];

  const handleAdd = () => {
    if (!selectedNodeId || !selectedRepoId || !selectedFilePath) return;
    const node = availableNodes.find(n => n.id === selectedNodeId);
    const label = node?.label || selectedNodeId;
    onAddCodeLink(
      selectedNodeId,
      selectedRepoId,
      selectedFilePath,
      lineStart ? parseInt(lineStart, 10) : undefined,
      lineEnd ? parseInt(lineEnd, 10) : undefined,
      label
    );
    // Reset form
    setSelectedNodeId('');
    setSelectedFilePath('');
    setLineStart('');
    setLineEnd('');
    setSymbols([]);
  };

  const handleSymbolClick = (sym: CodeSymbol) => {
    setLineStart(String(sym.lineStart));
    setLineEnd(String(sym.lineEnd));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-gray-100">Manage Code Links</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Existing Code Links */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Existing Code Links</h3>
            {codeLinks.length > 0 ? (
              <div className="space-y-2">
                {codeLinks.map(link => {
                  const repo = repos.find(r => r.id === link.repoId);
                  return (
                    <div key={link.nodeId} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-gray-700">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-200">
                          Node: <span className="text-green-400">{link.label || link.nodeId}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {repo?.name || 'Unknown repo'}/{link.filePath}
                          {link.lineStart && (
                            <span className="text-gray-600"> L{link.lineStart}{link.lineEnd ? `-${link.lineEnd}` : ''}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveCodeLink(link.nodeId)}
                        className="p-2 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                        title="Remove code link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No code links configured yet</p>
            )}
          </div>

          {/* Add New Code Link */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Add New Code Link</h3>

            {connectedRepos.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No repositories connected. Open the Repo Manager to add one.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Node Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Select Node</label>
                  {availableNodes.length > 0 ? (
                    <select
                      value={selectedNodeId}
                      onChange={e => setSelectedNodeId(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">-- Choose a node --</option>
                      {availableNodes.map(node => {
                        const display = node.label && node.label !== node.id
                          ? `${node.label} (${node.id})`
                          : node.label || node.id;
                        return (
                          <option key={node.id} value={node.id}>{display}</option>
                        );
                      })}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No nodes found. Make sure the diagram is rendered.</p>
                  )}
                </div>

                {/* Repo Selection */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Select Repository</label>
                  <select
                    value={selectedRepoId}
                    onChange={e => handleRepoSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand-500"
                    disabled={!selectedNodeId}
                  >
                    <option value="">-- Choose a repo --</option>
                    {connectedRepos.map(r => {
                      const isConnected = connectedRepoIds.has(r.id);
                      return (
                        <option key={r.id} value={r.id}>
                          {isConnected ? '● ' : '○ '}{r.name}
                        </option>
                      );
                    })}
                  </select>
                  {repoConnecting && (
                    <p className="text-xs text-gray-500 mt-1">Reconnecting repository…</p>
                  )}
                  {selectedRepoId && !repoConnecting && !connectedRepoIds.has(selectedRepoId) && (
                    <p className="text-xs text-yellow-500 mt-1">Repository not accessible — try opening the Repo Manager to reconnect.</p>
                  )}
                </div>

                {/* File Browser */}
                {selectedRepoId && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Select File {selectedFilePath && <span className="text-brand-400 ml-1">({selectedFilePath})</span>}
                    </label>
                    <FileBrowser
                      repoId={selectedRepoId}
                      onSelectFile={path => { setSelectedFilePath(path); setLineStart(''); setLineEnd(''); }}
                    />
                  </div>
                )}

                {/* Symbols */}
                {symbols.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Symbols (click to set line range)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {symbols.map((sym, i) => (
                        <button
                          key={i}
                          onClick={() => handleSymbolClick(sym)}
                          className="px-2 py-1 text-xs rounded bg-dark-800 border border-gray-700 hover:border-brand-500/50 text-gray-300 hover:text-brand-400 transition-colors"
                        >
                          <span className="text-gray-500 mr-1">{sym.kind}</span>
                          {sym.name}
                          <span className="text-gray-600 ml-1">L{sym.lineStart}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line range */}
                {selectedFilePath && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-2">Line Start (optional)</label>
                      <input
                        type="number"
                        min={1}
                        value={lineStart}
                        onChange={e => setLineStart(e.target.value)}
                        placeholder="1"
                        className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-2">Line End (optional)</label>
                      <input
                        type="number"
                        min={1}
                        value={lineEnd}
                        onChange={e => setLineEnd(e.target.value)}
                        placeholder="100"
                        className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                )}

                {/* Add Button */}
                <button
                  onClick={handleAdd}
                  disabled={!selectedNodeId || !selectedRepoId || !selectedFilePath}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Code Link
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
