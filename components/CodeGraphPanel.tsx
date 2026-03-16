/**
 * CodeGraphPanel — toolbar + property inspector for CodeGraph.
 *
 * Contains:
 * - LensSwitcher: tab bar for Component/Flow/Domain
 * - DepthNavigator: breadcrumb chips for depth navigation
 * - Action bar: Sync, Analyze Domain, Settings, Delete
 * - Selected node info panel
 * - Stats and anomalies
 */

import React, { useState, useMemo } from 'react';
import { ConfirmModal } from './ConfirmModal';
import {
  ChevronRight, Layers, Box, File, Code,
  GitBranch, RefreshCw, AlertTriangle, Trash2, Home,
  Brain, Settings, Eye, ArrowRight, Play, Plus, RotateCw,
  CheckCircle, CircleDot,
} from 'lucide-react';
import {
  CodeGraph, ViewLens, GraphNode, GraphRelation,
  CodeGraphAnomaly, SyncLockStatus, GraphFlow, SyncStatus,
} from '../types';

interface CodeGraphPanelProps {
  graph: CodeGraph;
  activeLens: ViewLens | null;
  focusNodeId: string | null;
  breadcrumbStack: Array<{ nodeId: string; name: string }>;
  selectedNode: GraphNode | null;
  isSyncing: boolean;
  isAnalyzingDomain: boolean;
  onSwitchLens: (lensId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onFocusUp: () => void;
  onFocusRoot: () => void;
  onNavigateBreadcrumb: (index: number) => void;
  onSyncGraph: () => void;
  onGetAnomalies: () => CodeGraphAnomaly[];
  onDeleteGraph: () => void;
  onRenameGraph: (name: string) => void;
  onAnalyzeDomain: () => void;
  onOpenConfig: () => void;
  onViewCode: (nodeId: string) => void;
  // Flows
  contextualFlows: GraphFlow[];
  activeFlowId: string | null;
  onSelectFlow: (flowId: string) => void;
  onDeselectFlow: () => void;
  // Flow generation
  isGeneratingFlows?: boolean;
  onRegenerateFlows?: (options?: { scopeNodeId?: string; customPrompt?: string }) => void;
  // Re-parse
  isReparsing?: boolean;
  onReparseGraph?: () => void;
  // Incremental sync status
  syncStatus?: SyncStatus;
  isCheckingSync?: boolean;
  onCheckSync?: () => void;
  // Pending diagram sync proposals
  pendingProposalCount?: number;
  onReviewProposals?: () => void;
}

const KIND_ICONS: Record<string, React.ReactNode> = {
  system: <Layers className="w-3.5 h-3.5 text-blue-400" />,
  package: <Box className="w-3.5 h-3.5 text-green-400" />,
  module: <File className="w-3.5 h-3.5 text-purple-400" />,
  class: <Code className="w-3.5 h-3.5 text-orange-400" />,
  function: <GitBranch className="w-3.5 h-3.5 text-cyan-400" />,
  interface: <Code className="w-3.5 h-3.5 text-yellow-400" />,
  variable: <Code className="w-3.5 h-3.5 text-gray-400" />,
  method: <GitBranch className="w-3.5 h-3.5 text-cyan-300" />,
  field: <Code className="w-3.5 h-3.5 text-gray-300" />,
};

function formatParsedAge(ts: number): { label: string; color: string; isStale: boolean } {
  const diffMs = Date.now() - ts;
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  let label: string;
  if (diffH < 1) label = 'just now';
  else if (diffH < 24) label = `${diffH}h ago`;
  else if (diffD === 1) label = 'yesterday';
  else label = `${diffD}d ago`;
  const color = diffD >= 30 ? 'text-red-400' : diffD >= 7 ? 'text-yellow-400' : 'text-gray-500';
  return { label, color, isStale: diffD >= 7 };
}

const SYNC_STATUS_COLORS: Record<SyncLockStatus, string> = {
  locked: 'text-green-400',
  modified: 'text-yellow-400',
  missing: 'text-red-400',
};

const SYNC_STATUS_LABELS: Record<SyncLockStatus, string> = {
  locked: 'Locked (in sync)',
  modified: 'Modified',
  missing: 'Missing',
};

export const CodeGraphPanel: React.FC<CodeGraphPanelProps> = ({
  graph,
  activeLens,
  focusNodeId,
  breadcrumbStack,
  selectedNode,
  isSyncing,
  isAnalyzingDomain,
  onSwitchLens,
  onFocusNode,
  onFocusUp,
  onFocusRoot,
  onNavigateBreadcrumb,
  onSyncGraph,
  onGetAnomalies,
  onDeleteGraph,
  onRenameGraph,
  onAnalyzeDomain,
  onOpenConfig,
  onViewCode,
  contextualFlows,
  activeFlowId,
  onSelectFlow,
  onDeselectFlow,
  isGeneratingFlows = false,
  onRegenerateFlows,
  isReparsing = false,
  onReparseGraph,
  syncStatus,
  isCheckingSync = false,
  onCheckSync,
  pendingProposalCount = 0,
  onReviewProposals,
}) => {
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [anomalies, setAnomalies] = useState<CodeGraphAnomaly[]>([]);
  const [customPromptText, setCustomPromptText] = useState('');
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);

  const parsedAge = (graph.parsedAt || graph.createdAt)
    ? formatParsedAge(graph.parsedAt || graph.createdAt)
    : null;

  const currentScopeId = focusNodeId || graph.rootNodeId;

  const handleAnalyzeAnomalies = () => {
    const results = onGetAnomalies();
    setAnomalies(results);
    setShowAnomalies(true);
  };

  const nodeCount = Object.keys(graph.nodes).length;
  const relationCount = Object.keys(graph.relations).length;

  // Compute full relations for selected node
  const selectedNodeRelations = useMemo(() => {
    if (!selectedNode) return null;
    const rels = Object.values(graph.relations).filter(r => r.type !== 'contains');
    const outgoing = rels
      .filter(r => r.sourceId === selectedNode.id)
      .map(r => ({ type: r.type, label: r.label, node: graph.nodes[r.targetId] }))
      .filter(r => r.node);
    const incoming = rels
      .filter(r => r.targetId === selectedNode.id)
      .map(r => ({ type: r.type, label: r.label, node: graph.nodes[r.sourceId] }))
      .filter(r => r.node);
    const domains = (selectedNode.domainProjections || [])
      .map(id => graph.domainNodes?.[id])
      .filter(Boolean);
    return { outgoing, incoming, domains };
  }, [graph.relations, graph.nodes, graph.domainNodes, selectedNode]);

  const syncEntry = selectedNode ? graph.syncLock[selectedNode.id] : null;
  const isDomainLens = activeLens?.type === 'domain';
  const isFlowLens = activeLens?.type === 'flow';

  return (
    <div className="flex flex-col h-full bg-dark-900 border-r border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Code Graph</h3>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-gray-500 truncate">{graph.name}</p>
          {parsedAge && (
            <span
              className={`text-[10px] flex items-center gap-0.5 ml-2 shrink-0 ${parsedAge.color}`}
              title={`Last parsed: ${new Date(graph.parsedAt || graph.createdAt).toLocaleString()}`}
            >
              {parsedAge.isStale && <AlertTriangle className="w-3 h-3" />}
              {parsedAge.label}
            </span>
          )}
        </div>
      </div>

      {/* Lens Switcher */}
      <div className="flex border-b border-gray-800">
        {graph.lenses.map(lens => (
          <button
            key={lens.id}
            onClick={() => onSwitchLens(lens.id)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
              graph.activeLensId === lens.id
                ? 'text-brand-400 border-b-2 border-brand-400 bg-dark-800'
                : 'text-gray-500 hover:text-gray-300 hover:bg-dark-800'
            }`}
          >
            {lens.name}
          </button>
        ))}
      </div>

      {/* Depth Breadcrumbs */}
      {breadcrumbStack.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800 overflow-x-auto text-xs">
          <button
            onClick={onFocusRoot}
            className="text-gray-500 hover:text-brand-400 flex-shrink-0 p-0.5 rounded hover:bg-dark-700"
            title="Go to root"
          >
            <Home className="w-3.5 h-3.5" />
          </button>

          {breadcrumbStack.map((entry, idx) => (
            <React.Fragment key={entry.nodeId}>
              <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
              <button
                onClick={() => onNavigateBreadcrumb(idx)}
                className={`flex-shrink-0 px-1.5 py-0.5 rounded ${
                  idx === breadcrumbStack.length - 1
                    ? 'text-brand-400 bg-brand-900/30'
                    : 'text-gray-400 hover:text-brand-400 hover:bg-dark-700'
                }`}
              >
                {entry.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800">

        {/* Adaptive sync button */}
        {syncStatus === 'synced' ? (
          <button
            onClick={onCheckSync}
            disabled={isCheckingSync}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-green-400 hover:bg-dark-700 transition-colors disabled:opacity-50"
            title="In sync — click to re-check"
          >
            <CheckCircle className={`w-3.5 h-3.5 ${isCheckingSync ? 'animate-pulse' : ''}`} />
            <span>{isCheckingSync ? 'Checking…' : 'Synced'}</span>
          </button>
        ) : syncStatus === 'suggestions' || syncStatus === 'conflicts' ? (
          <button
            onClick={onSyncGraph}
            disabled={isSyncing}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ${
              syncStatus === 'conflicts'
                ? 'text-red-400 hover:bg-red-900/20'
                : 'text-yellow-400 hover:bg-yellow-900/20'
            }`}
            title={syncStatus === 'conflicts' ? 'Missing files detected — sync to rebuild' : 'Files changed — click to sync'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing…' : syncStatus === 'conflicts' ? 'Conflicts' : 'Sync'}</span>
          </button>
        ) : (
          /* unknown or no status — show Check button */
          onCheckSync && (
            <button
              onClick={onCheckSync}
              disabled={isCheckingSync}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-blue-400 hover:bg-dark-700 transition-colors disabled:opacity-50"
              title="Check for file changes"
            >
              <CircleDot className={`w-3.5 h-3.5 ${isCheckingSync ? 'animate-pulse' : ''}`} />
              <span>{isCheckingSync ? 'Checking…' : 'Check'}</span>
            </button>
          )
        )}

        {pendingProposalCount > 0 && onReviewProposals && (
          <button
            onClick={onReviewProposals}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand-600 hover:bg-brand-500 text-white transition-colors animate-pulse"
            title="Diagram updates proposed — click to review"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>{pendingProposalCount} proposal{pendingProposalCount > 1 ? 's' : ''}</span>
          </button>
        )}

        {isDomainLens && (
          <button
            onClick={onAnalyzeDomain}
            disabled={isAnalyzingDomain}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-dark-700 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
            title="Analyze domain structure with LLM"
          >
            <Brain className={`w-3.5 h-3.5 ${isAnalyzingDomain ? 'animate-pulse' : ''}`} />
            <span>{isAnalyzingDomain ? 'Analyzing…' : 'Analyze'}</span>
          </button>
        )}



        <div className="flex-1" />

        {onReparseGraph && (
          <button
            onClick={() => setShowReparseConfirm(true)}
            disabled={isReparsing}
            className="p-1 rounded hover:bg-dark-700 text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Re-parse codebase from scratch (full rebuild)"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReparsing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          onClick={onOpenConfig}
          className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300 transition-colors"
          title="Graph settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleAnalyzeAnomalies}
          className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-yellow-400 transition-colors"
          title="Check for anomalies"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDeleteGraph}
          className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-red-400 transition-colors"
          title="Delete graph"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Flow List (Flow lens) */}
      {isFlowLens && (
        <div className="border-b border-gray-800">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex-shrink-0">
                Flows ({contextualFlows.length})
              </span>
              {(() => {
                const scopeName = graph.nodes[currentScopeId]?.name;
                return scopeName ? (
                  <span
                    className="text-[10px] text-gray-600 truncate"
                    title={`Scope: ${scopeName}`}
                  >
                    — {scopeName}
                  </span>
                ) : null;
              })()}
            </div>
            {onRegenerateFlows && (
              <button
                onClick={() => onRegenerateFlows({ scopeNodeId: currentScopeId })}
                disabled={isGeneratingFlows}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-cyan-400 hover:bg-dark-700 transition-colors disabled:opacity-50 flex-shrink-0"
                title={`Regenerate flows for ${graph.nodes[currentScopeId]?.name ?? 'this scope'}`}
              >
                <RefreshCw className={`w-3 h-3 ${isGeneratingFlows ? 'animate-spin' : ''}`} />
                <span>{isGeneratingFlows ? 'Generating...' : 'Regenerate'}</span>
              </button>
            )}
          </div>

          {/* Custom prompt input */}
          {onRegenerateFlows && (
            <div className="px-3 pb-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customPromptText}
                  onChange={e => setCustomPromptText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customPromptText.trim() && !isGeneratingFlows) {
                      onRegenerateFlows({ scopeNodeId: currentScopeId, customPrompt: customPromptText.trim() });
                      setCustomPromptText('');
                    }
                  }}
                  placeholder="Describe a flow to generate..."
                  disabled={isGeneratingFlows}
                  className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] bg-dark-800 border border-gray-700 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-600 disabled:opacity-50"
                />
                <button
                  onClick={() => {
                    if (customPromptText.trim()) {
                      onRegenerateFlows({ scopeNodeId: currentScopeId, customPrompt: customPromptText.trim() });
                      setCustomPromptText('');
                    }
                  }}
                  disabled={isGeneratingFlows || !customPromptText.trim()}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50 transition-colors disabled:opacity-40 disabled:hover:bg-cyan-900/30 flex-shrink-0"
                  title="Generate flow from prompt"
                >
                  <Plus className="w-3 h-3" />
                  <span>Generate</span>
                </button>
              </div>
            </div>
          )}

          {contextualFlows.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {contextualFlows.map(flow => (
                <button
                  key={flow.id}
                  onClick={() => activeFlowId === flow.id ? onDeselectFlow() : onSelectFlow(flow.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-start gap-2 ${
                    activeFlowId === flow.id
                      ? 'bg-cyan-900/30 text-cyan-300 border-l-2 border-cyan-400'
                      : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200 border-l-2 border-transparent'
                  }`}
                >
                  <Play className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                    activeFlowId === flow.id ? 'text-cyan-400' : 'text-gray-600'
                  }`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate" title={flow.name}>{flow.name}</div>
                    <div className="text-[10px] text-gray-600 truncate mt-0.5" title={flow.description}>{flow.description}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-center">
              {isGeneratingFlows ? (
                <span className="text-xs text-gray-600">Generating flows...</span>
              ) : onRegenerateFlows ? (
                <button
                  onClick={() => onRegenerateFlows({ scopeNodeId: currentScopeId })}
                  className="px-3 py-1.5 rounded text-xs bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50 transition-colors"
                >
                  Generate Flows
                </button>
              ) : (
                <span className="text-xs text-gray-600">No flows at this level</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Node Info */}
      {selectedNode ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-1">
              {KIND_ICONS[selectedNode.kind] || <Code className="w-3.5 h-3.5 text-gray-400" />}
              <span className="text-sm font-medium text-gray-200">{selectedNode.name}</span>
            </div>
            {selectedNode.description && (
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">{selectedNode.description}</p>
            )}

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Kind</span>
                <span className="text-gray-300 capitalize">{selectedNode.kind}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Depth</span>
                <span className="text-gray-300">D{selectedNode.depth}</span>
              </div>

              {selectedNode.sourceRef && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">File</span>
                    <span className="text-gray-300 truncate ml-2 max-w-[140px]" title={selectedNode.sourceRef.filePath}>
                      {selectedNode.sourceRef.filePath.split('/').pop()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lines</span>
                    <span className="text-gray-300">{selectedNode.sourceRef.lineStart}-{selectedNode.sourceRef.lineEnd}</span>
                  </div>
                </>
              )}

              {syncEntry && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Sync</span>
                  <span className={SYNC_STATUS_COLORS[syncEntry.status]}>
                    {SYNC_STATUS_LABELS[syncEntry.status]}
                  </span>
                </div>
              )}

              {selectedNode.tags.length > 0 && (
                <div>
                  <span className="text-gray-500">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedNode.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 bg-dark-700 text-gray-400 rounded text-[10px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedNodeRelations && selectedNodeRelations.domains.length > 0 && (
                <div>
                  <span className="text-gray-500">Domains</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedNodeRelations.domains.map((d: any) => (
                      <span key={d.id} className="px-1.5 py-0.5 bg-brand-900/40 text-brand-300 rounded text-[10px]" title={d.description}>
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedNodeRelations && (selectedNodeRelations.outgoing.length > 0 || selectedNodeRelations.incoming.length > 0) && (
                <div>
                  <span className="text-gray-500">Relations</span>
                  <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                    {selectedNodeRelations.outgoing.map((r: any, i: number) => (
                      <div key={`out-${i}`} className="flex items-center gap-1 text-[10px]">
                        <span className="text-brand-400 shrink-0">→</span>
                        <span className="text-gray-500 shrink-0">{r.type}</span>
                        <span className="text-gray-300 truncate" title={r.node.name}>{r.node.name}</span>
                      </div>
                    ))}
                    {selectedNodeRelations.incoming.map((r: any, i: number) => (
                      <div key={`in-${i}`} className="flex items-center gap-1 text-[10px]">
                        <span className="text-gray-500 shrink-0">←</span>
                        <span className="text-gray-500 shrink-0">{r.type}</span>
                        <span className="text-gray-300 truncate" title={r.node.name}>{r.node.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.children.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Children</span>
                  <span className="text-gray-300">{selectedNode.children.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions for selected node */}
          <div className="px-3 py-2 space-y-1">
            {selectedNode.sourceRef && (
              <button
                onClick={() => onViewCode(selectedNode.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-dark-700 hover:text-green-400 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                View Code
              </button>
            )}
            {selectedNode.children.length > 0 && (
              <button
                onClick={() => onFocusNode(selectedNode.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-dark-700 hover:text-brand-400 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Drill Into
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-600 text-center px-4">
            Click a node in the graph to inspect it
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="px-3 py-1.5 border-t border-gray-800">
        <p className="text-[10px] text-gray-600">
          {nodeCount} nodes, {relationCount} relations
          {graph.domainNodes && Object.keys(graph.domainNodes).length > 0 && (
            <> | {Object.keys(graph.domainNodes).length} domains</>
          )}
        </p>
      </div>

      {/* Anomalies Panel */}
      {showAnomalies && (
        <div className="border-t border-gray-800 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-400 uppercase">Anomalies ({anomalies.length})</span>
            <button
              onClick={() => setShowAnomalies(false)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Hide
            </button>
          </div>
          {anomalies.length === 0 ? (
            <p className="px-3 py-2 text-xs text-green-400">No anomalies detected</p>
          ) : (
            anomalies.map((a, i) => (
              <div key={i} className="px-3 py-1.5 text-xs border-t border-gray-800/50">
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                  a.severity === 'error' ? 'bg-red-500' :
                  a.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <span className="text-gray-300">{a.message}</span>
              </div>
            ))
          )}
        </div>
      )}

      {showReparseConfirm && onReparseGraph && (
        <ConfirmModal
          message={`Re-parse will delete the current Code Graph for "${graph.name}" and rebuild it from scratch.\n\nAll nodes, relations, flows, and AI analysis will be regenerated. Diagrams created from this graph will keep their Mermaid code but lose their link to the graph.`}
          confirmLabel="Re-parse"
          danger={true}
          onConfirm={() => { setShowReparseConfirm(false); onReparseGraph(); }}
          onCancel={() => setShowReparseConfirm(false)}
        />
      )}
    </div>
  );
};
