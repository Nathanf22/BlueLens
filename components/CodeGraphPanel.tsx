/**
 * CodeGraphPanel — main panel for CodeGraph interaction.
 *
 * Contains:
 * - LensSwitcher: tab bar for Component/Flow/Domain
 * - DepthNavigator: breadcrumb chips for depth navigation
 * - GraphNodeList: tree view of nodes at current focus level
 */

import React, { useState, useMemo } from 'react';
import {
  Eye, ChevronRight, ChevronDown, Layers, Box, File, Code,
  GitBranch, RefreshCw, AlertTriangle, Trash2, Home, Search,
} from 'lucide-react';
import {
  CodeGraph, ViewLens, GraphNode, GraphDepth,
  CodeGraphAnomaly, SyncLockStatus,
} from '../types';

interface CodeGraphPanelProps {
  graph: CodeGraph;
  activeLens: ViewLens | null;
  focusNodeId: string | null;
  breadcrumbStack: Array<{ nodeId: string; name: string }>;
  isSyncing: boolean;
  onSwitchLens: (lensId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onFocusUp: () => void;
  onFocusRoot: () => void;
  onNavigateBreadcrumb: (index: number) => void;
  onSyncGraph: () => void;
  onGetAnomalies: () => CodeGraphAnomaly[];
  onDeleteGraph: () => void;
  onRenameGraph: (name: string) => void;
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

const SYNC_STATUS_COLORS: Record<SyncLockStatus, string> = {
  locked: 'bg-green-500',
  modified: 'bg-yellow-500',
  missing: 'bg-red-500',
};

export const CodeGraphPanel: React.FC<CodeGraphPanelProps> = ({
  graph,
  activeLens,
  focusNodeId,
  breadcrumbStack,
  isSyncing,
  onSwitchLens,
  onFocusNode,
  onFocusUp,
  onFocusRoot,
  onNavigateBreadcrumb,
  onSyncGraph,
  onGetAnomalies,
  onDeleteGraph,
  onRenameGraph,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [anomalies, setAnomalies] = useState<CodeGraphAnomaly[]>([]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleAnalyze = () => {
    const results = onGetAnomalies();
    setAnomalies(results);
    setShowAnomalies(true);
  };

  // Build tree from focus point
  const visibleTree = useMemo(() => {
    const rootId = focusNodeId || graph.rootNodeId;
    const root = graph.nodes[rootId];
    if (!root) return [];

    function getChildNodes(parentId: string): GraphNode[] {
      return (graph.nodes[parentId]?.children || [])
        .map(id => graph.nodes[id])
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return getChildNodes(rootId);
  }, [graph, focusNodeId]);

  const nodeCount = Object.keys(graph.nodes).length;
  const relationCount = Object.keys(graph.relations).length;

  const renderNodeTree = (node: GraphNode, depth: number = 0): React.ReactNode => {
    const children = (node.children || [])
      .map(id => graph.nodes[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes[node.id];
    const syncEntry = graph.syncLock[node.id];

    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-dark-700 transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => hasChildren ? toggleExpand(node.id) : undefined}
          onDoubleClick={() => onFocusNode(node.id)}
          title={`${node.kind} — double-click to focus`}
        >
          {/* Expand toggle */}
          {hasChildren ? (
            isExpanded ?
              <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" /> :
              <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}

          {/* Kind icon */}
          {KIND_ICONS[node.kind] || <Code className="w-3.5 h-3.5 text-gray-400" />}

          {/* Name */}
          <span className="text-sm text-gray-300 truncate flex-1">{node.name}</span>

          {/* Sync status dot */}
          {syncEntry && (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${SYNC_STATUS_COLORS[syncEntry.status]}`}
              title={syncEntry.status}
            />
          )}

          {/* Focus button */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onFocusNode(node.id); }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-dark-600 text-gray-500 hover:text-brand-400 transition-all"
              title="Focus on this node"
            >
              <Search className="w-3 h-3" />
            </button>
          )}
        </div>

        {isExpanded && children.map(child => renderNodeTree(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-dark-900 border-r border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Code Graph</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={onSyncGraph}
              disabled={isSyncing}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-green-400 transition-colors disabled:opacity-50"
              title="Sync with codebase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleAnalyze}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-yellow-400 transition-colors"
              title="Analyze for anomalies"
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
        </div>
        <p className="text-xs text-gray-500">{nodeCount} nodes, {relationCount} relations</p>
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

      {/* Node Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {visibleTree.length > 0 ? (
          visibleTree.map(node => renderNodeTree(node))
        ) : (
          <div className="px-3 py-4 text-xs text-gray-600 text-center">No child nodes at this level</div>
        )}
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
    </div>
  );
};
