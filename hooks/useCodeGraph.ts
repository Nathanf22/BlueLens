/**
 * Central hook for CodeGraph state: lens switching, depth navigation,
 * node selection, and domain analysis.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CodeGraph, GraphDepth, ViewLens, CodeGraphAnomaly, LLMSettings, GraphFlow } from '../types';
import { codeGraphStorageService } from '../services/codeGraphStorageService';
import { codeGraphModelService } from '../services/codeGraphModelService';
import { codeGraphSyncService } from '../services/codeGraphSyncService';
import { codebaseAnalyzerService } from '../services/codebaseAnalyzerService';
import { codeToGraphParserService } from '../services/codeToGraphParserService';
import { codeGraphDomainService } from '../services/codeGraphDomainService';
import { analyzeCodebaseWithAI, type LogEntryFn } from '../services/codeGraphAgentService';
import { groupByFunctionalHeuristics } from '../services/codeGraphHeuristicGrouper';
import { generateFlows, type FlowGenerationResult, type FlowGenerationOptions } from '../services/codeGraphFlowService';
import { generateDemoGraph } from '../services/demoGraphService';
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [isAnalyzingDomain, setIsAnalyzingDomain] = useState(false);
  const [isGeneratingFlows, setIsGeneratingFlows] = useState(false);
  const [graphCreationProgress, setGraphCreationProgress] = useState<{
    step: string; current: number; total: number;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    setSelectedNodeId(null);
  }, [activeWorkspaceId]);

  const activeGraph = useMemo(
    () => codeGraphs.find(g => g.id === activeGraphId) || null,
    [codeGraphs, activeGraphId]
  );

  const activeLens = useMemo(
    () => activeGraph?.lenses.find(l => l.id === activeGraph.activeLensId) || null,
    [activeGraph]
  );

  // Selected node data (for property inspector)
  const selectedNode = useMemo(() => {
    if (!activeGraph || !selectedNodeId) return null;
    return activeGraph.nodes[selectedNodeId] || null;
  }, [activeGraph, selectedNodeId]);

  // Flows scoped to the current focus level
  const contextualFlows = useMemo((): GraphFlow[] => {
    if (!activeGraph) return [];
    const flows = Object.values(activeGraph.flows);
    const scopeId = focusNodeId || activeGraph.rootNodeId;
    return flows.filter(f => f.scopeNodeId === scopeId);
  }, [activeGraph, focusNodeId]);

  const activeFlow = useMemo((): GraphFlow | null => {
    if (!activeGraph || !activeFlowId) return null;
    return activeGraph.flows[activeFlowId] || null;
  }, [activeGraph, activeFlowId]);

  // --- Graph lifecycle ---

  const updateGraph = useCallback((updated: CodeGraph) => {
    setCodeGraphs(prev => prev.map(g => g.id === updated.id ? updated : g));
    codeGraphStorageService.saveCodeGraph(updated);
  }, []);

  const cancelCreateGraph = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const createGraph = useCallback(async (
    repoId: string,
    llmSettings?: LLMSettings,
    onLogEntry?: LogEntryFn,
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const handle = fileSystemService.getHandle(repoId);
    if (!handle) return null;

    try {
      setGraphCreationProgress({ step: 'Scanning codebase', current: 0, total: 1 });
      onLogEntry?.('scan', 'Scanning codebase...');

      let analysis = await codebaseAnalyzerService.analyzeCodebase(handle);
      onLogEntry?.('scan', `Scan complete: ${analysis.totalFiles} files, ${analysis.totalSymbols} symbols`);

      // Try AI-powered grouping if LLM is configured
      if (llmSettings) {
        const config = llmSettings.providers[llmSettings.activeProvider];
        if (config?.apiKey) {
          onLogEntry?.('info', 'Starting AI analysis pipeline');
          try {
            analysis = await analyzeCodebaseWithAI(
              analysis,
              llmSettings,
              (step, current, total) => setGraphCreationProgress({ step, current, total }),
              onLogEntry,
              signal,
            );
          } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            onLogEntry?.('info', 'AI analysis failed, using heuristic grouping');
            analysis = groupByFunctionalHeuristics(analysis);
          }
        } else {
          onLogEntry?.('info', 'No API key configured, using heuristic grouping');
          analysis = groupByFunctionalHeuristics(analysis);
        }
      } else {
        onLogEntry?.('info', 'No AI configured, using heuristic grouping');
        analysis = groupByFunctionalHeuristics(analysis);
      }

      setGraphCreationProgress({ step: 'Building graph', current: 0, total: 1 });

      let graph = await codeToGraphParserService.parseCodebaseToGraph(
        analysis,
        repoId,
        handle.name,
        activeWorkspaceId,
        handle,
        undefined,
        (message, current, total) => setGraphCreationProgress({ step: message, current, total }),
        onLogEntry,
      );

      // Generate flows (AI only — skips if no LLM configured)
      setGraphCreationProgress({ step: 'Generating flows', current: 0, total: 1 });
      setIsGeneratingFlows(true);
      try {
        const flowResult = await generateFlows(
          graph,
          llmSettings,
          (step, current, total) => setGraphCreationProgress({ step, current, total }),
          undefined,
          onLogEntry,
          signal,
        );
        if (Object.keys(flowResult.flows).length > 0) {
          graph = { ...graph, flows: flowResult.flows, updatedAt: Date.now() };
        }
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        // Non-fatal: graph works without flows
        console.warn('[CodeGraph] Flow generation failed');
        onLogEntry?.('flow', 'Flow generation failed (non-fatal)');
      } finally {
        setIsGeneratingFlows(false);
      }

      const nodeCount = Object.keys(graph.nodes).length;
      onLogEntry?.('info', `Graph creation complete (${nodeCount} nodes)`);

      setCodeGraphs(prev => [...prev, graph]);
      codeGraphStorageService.saveCodeGraph(graph);
      setActiveGraphId(graph.id);
      setGraphCreationProgress(null);
      return graph;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        onLogEntry?.('info', 'Graph creation cancelled');
      } else {
        throw err;
      }
      return null;
    } finally {
      setGraphCreationProgress(null);
      setIsGeneratingFlows(false);
    }
  }, [activeWorkspaceId]);

  const deleteGraph = useCallback((graphId: string) => {
    codeGraphStorageService.deleteCodeGraph(graphId);
    setCodeGraphs(prev => prev.filter(g => g.id !== graphId));
    if (activeGraphId === graphId) {
      setActiveGraphId(null);
      setFocusNodeId(null);
      setBreadcrumbStack([]);
      setSelectedNodeId(null);
    }
  }, [activeGraphId]);

  const loadDemoGraph = useCallback(() => {
    const graph = generateDemoGraph(activeWorkspaceId);
    setCodeGraphs(prev => [...prev, graph]);
    codeGraphStorageService.saveCodeGraph(graph);
    setActiveGraphId(graph.id);
    return graph;
  }, [activeWorkspaceId]);

  const selectGraph = useCallback((graphId: string | null) => {
    setActiveGraphId(graphId);
    setFocusNodeId(null);
    setBreadcrumbStack([]);
    setDepthRange({});
    setSelectedNodeId(null);
  }, []);

  // --- Node selection ---

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const deselectNode = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // --- Flow regeneration ---

  const regenerateFlows = useCallback(async (
    llmSettings?: LLMSettings,
    options?: FlowGenerationOptions,
  ) => {
    if (!activeGraph) return;

    setIsGeneratingFlows(true);
    setActiveFlowId(null);
    try {
      const flowResult = await generateFlows(
        activeGraph,
        llmSettings,
        (step, current, total) => setGraphCreationProgress({ step, current, total }),
        options,
      );

      // If generation returned nothing, preserve existing flows
      if (Object.keys(flowResult.flows).length === 0) {
        console.warn('[CodeGraph] Flow generation returned 0 flows, keeping existing');
        return;
      }

      let mergedFlows: Record<string, import('../types').GraphFlow>;

      if (options?.customPrompt) {
        // Custom prompt: merge new flows into existing (additive)
        mergedFlows = { ...activeGraph.flows, ...flowResult.flows };
      } else if (options?.scopeNodeId) {
        // Scoped regenerate: replace flows at this scope, keep other scopes
        const scopeId = options.scopeNodeId;
        const kept: Record<string, import('../types').GraphFlow> = {};
        for (const [id, flow] of Object.entries(activeGraph.flows)) {
          if (flow.scopeNodeId !== scopeId) {
            kept[id] = flow;
          }
        }
        mergedFlows = { ...kept, ...flowResult.flows };
      } else {
        // Full regenerate: replace all
        mergedFlows = flowResult.flows;
      }

      const updated: CodeGraph = {
        ...activeGraph,
        flows: mergedFlows,
        updatedAt: Date.now(),
      };
      updateGraph(updated);
    } finally {
      setIsGeneratingFlows(false);
      setGraphCreationProgress(null);
    }
  }, [activeGraph, updateGraph]);

  // --- Flow selection ---

  const selectFlow = useCallback((flowId: string) => {
    setActiveFlowId(flowId);
  }, []);

  const deselectFlow = useCallback(() => {
    setActiveFlowId(null);
  }, []);

  // --- Lens switching ---

  const switchLens = useCallback((lensId: string) => {
    if (!activeGraph) return;
    updateGraph({ ...activeGraph, activeLensId: lensId, updatedAt: Date.now() });
    setSelectedNodeId(null);
    setActiveFlowId(null);
  }, [activeGraph, updateGraph]);

  // --- Depth navigation ---

  const focusNode = useCallback((nodeId: string) => {
    if (!activeGraph) return;
    const node = activeGraph.nodes[nodeId];
    if (!node) return;

    setBreadcrumbStack(prev => [...prev, { nodeId, name: node.name }]);
    setFocusNodeId(nodeId);
    setActiveFlowId(null);
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

  // --- Domain analysis ---

  const analyzeDomain = useCallback(async (llmSettings: LLMSettings) => {
    if (!activeGraph) return;

    setIsAnalyzingDomain(true);
    try {
      const { domainNodes, domainRelations } = await codeGraphDomainService.analyzeDomain(
        activeGraph,
        llmSettings
      );
      const updated: CodeGraph = {
        ...activeGraph,
        domainNodes,
        domainRelations,
        updatedAt: Date.now(),
      };
      updateGraph(updated);
    } finally {
      setIsAnalyzingDomain(false);
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
    isSyncing,
    selectedNodeId,
    selectedNode,
    isAnalyzingDomain,
    isGeneratingFlows,
    graphCreationProgress,
    contextualFlows,
    activeFlow,
    activeFlowId,

    createGraph,
    cancelCreateGraph,
    deleteGraph,
    loadDemoGraph,
    selectGraph,
    updateGraph,
    switchLens,
    selectNode,
    deselectNode,
    regenerateFlows,
    selectFlow,
    deselectFlow,
    focusNode,
    focusUp,
    focusRoot,
    navigateBreadcrumb,
    setDepthRange,
    syncGraph,
    analyzeDomain,
    getGraphAnomalies,
  };
};
