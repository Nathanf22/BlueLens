/**
 * Central hook for CodeGraph state: lens switching, depth navigation,
 * and rendered Mermaid output.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { CodeGraph, GraphDepth, ViewLens, CodeGraphAnomaly } from '../types';
import { codeGraphStorageService } from '../services/codeGraphStorageService';
import { codeGraphModelService } from '../services/codeGraphModelService';
import { codeGraphRendererService } from '../services/codeGraphRendererService';
import { codeGraphSyncService } from '../services/codeGraphSyncService';
import { codebaseAnalyzerService } from '../services/codebaseAnalyzerService';
import { codeToGraphParserService } from '../services/codeToGraphParserService';
import { fileSystemService } from '../services/fileSystemService';

interface BreadcrumbEntry {
  nodeId: string;
  name: string;
}

export const useCodeGraph = (activeWorkspaceId: string) => {
  const [codeGraphs, setCodeGraphs] = useState<CodeGraph[]>([]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [depthRange, setDepthRange] = useState<{ min?: GraphDepth; max?: GraphDepth }>({});
  const [breadcrumbStack, setBreadcrumbStack] = useState<BreadcrumbEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load graphs for current workspace on mount / workspace switch
  useEffect(() => {
    const index = codeGraphStorageService.listCodeGraphs(activeWorkspaceId);
    const graphs: CodeGraph[] = [];
    for (const entry of index) {
      const graph = codeGraphStorageService.loadCodeGraph(entry.id);
      if (graph) graphs.push(graph);
    }
    setCodeGraphs(graphs);
    setActiveGraphId(null);
    setFocusNodeId(null);
    setBreadcrumbStack([]);
  }, [activeWorkspaceId]);

  const activeGraph = useMemo(
    () => codeGraphs.find(g => g.id === activeGraphId) || null,
    [codeGraphs, activeGraphId]
  );

  const activeLens = useMemo(
    () => activeGraph?.lenses.find(l => l.id === activeGraph.activeLensId) || null,
    [activeGraph]
  );

  // Rendered Mermaid code — recomputed whenever graph/lens/focus changes
  const renderedMermaidCode = useMemo(() => {
    if (!activeGraph || !activeLens) return null;
    return codeGraphRendererService.renderGraphToMermaid(
      activeGraph,
      activeLens,
      focusNodeId || undefined,
      depthRange
    );
  }, [activeGraph, activeLens, focusNodeId, depthRange]);

  // --- Graph lifecycle ---

  const updateGraph = useCallback((updated: CodeGraph) => {
    setCodeGraphs(prev => prev.map(g => g.id === updated.id ? updated : g));
    codeGraphStorageService.saveCodeGraph(updated);
  }, []);

  const createGraph = useCallback(async (repoId: string) => {
    const handle = fileSystemService.getHandle(repoId);
    if (!handle) return null;

    const analysis = await codebaseAnalyzerService.analyzeCodebase(handle);
    const graph = await codeToGraphParserService.parseCodebaseToGraph(
      analysis,
      repoId,
      handle.name,
      activeWorkspaceId,
      handle
    );

    setCodeGraphs(prev => [...prev, graph]);
    codeGraphStorageService.saveCodeGraph(graph);
    setActiveGraphId(graph.id);
    return graph;
  }, [activeWorkspaceId]);

  const deleteGraph = useCallback((graphId: string) => {
    codeGraphStorageService.deleteCodeGraph(graphId);
    setCodeGraphs(prev => prev.filter(g => g.id !== graphId));
    if (activeGraphId === graphId) {
      setActiveGraphId(null);
      setFocusNodeId(null);
      setBreadcrumbStack([]);
    }
  }, [activeGraphId]);

  const selectGraph = useCallback((graphId: string | null) => {
    setActiveGraphId(graphId);
    setFocusNodeId(null);
    setBreadcrumbStack([]);
    setDepthRange({});
  }, []);

  // --- Lens switching ---

  const switchLens = useCallback((lensId: string) => {
    if (!activeGraph) return;
    updateGraph({ ...activeGraph, activeLensId: lensId, updatedAt: Date.now() });
  }, [activeGraph, updateGraph]);

  // --- Depth navigation ---

  const focusNode = useCallback((nodeId: string) => {
    if (!activeGraph) return;
    const node = activeGraph.nodes[nodeId];
    if (!node) return;

    setBreadcrumbStack(prev => [...prev, { nodeId, name: node.name }]);
    setFocusNodeId(nodeId);
  }, [activeGraph]);

  const focusUp = useCallback(() => {
    setBreadcrumbStack(prev => {
      const next = prev.slice(0, -1);
      const lastEntry = next[next.length - 1];
      setFocusNodeId(lastEntry?.nodeId || null);
      return next;
    });
  }, []);

  const focusRoot = useCallback(() => {
    setBreadcrumbStack([]);
    setFocusNodeId(null);
  }, []);

  const navigateBreadcrumb = useCallback((index: number) => {
    setBreadcrumbStack(prev => {
      const next = prev.slice(0, index + 1);
      const entry = next[next.length - 1];
      setFocusNodeId(entry?.nodeId || null);
      return next;
    });
  }, []);

  // --- Sync ---

  const syncGraph = useCallback(async () => {
    if (!activeGraph) return;
    const handle = fileSystemService.getHandle(activeGraph.repoId);
    if (!handle) return;

    setIsSyncing(true);
    try {
      const report = await codeGraphSyncService.detectChanges(activeGraph, handle);
      const updated = await codeGraphSyncService.applySyncReport(activeGraph, report);
      updateGraph(updated);
    } finally {
      setIsSyncing(false);
    }
  }, [activeGraph, updateGraph]);

  // --- Validation ---

  const getGraphAnomalies = useCallback((): CodeGraphAnomaly[] => {
    if (!activeGraph) return [];
    return codeGraphModelService.validateGraph(activeGraph);
  }, [activeGraph]);

  return {
    codeGraphs,
    activeGraph,
    activeGraphId,
    activeLens,
    focusNodeId,
    depthRange,
    breadcrumbStack,
    renderedMermaidCode,
    isSyncing,

    createGraph,
    deleteGraph,
    selectGraph,
    updateGraph,
    switchLens,
    focusNode,
    focusUp,
    focusRoot,
    navigateBreadcrumb,
    setDepthRange,
    syncGraph,
    getGraphAnomalies,
  };
};
