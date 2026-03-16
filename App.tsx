import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { WorkspaceView } from './components/WorkspaceView';
import { ModalManager } from './components/ModalManager';
import { BlueprintImportResult } from './services/exportService';
import { llmService, LLMConfigError, LLMRateLimitError, setUsageListener } from './services/llmService';
import { aiChatService } from './services/aiChatService';
import { fileSystemService } from './services/fileSystemService';
import { DEMO_REPO_ID, DEMO_RAW_BASE, buildRawBase } from './services/githubDemoService';
import { diagramAnalyzerService } from './services/diagramAnalyzerService';
import { scaffoldService } from './services/scaffoldService';
import { ChatMessage, CodeFile, DiagramAnalysis, ScanConfig } from './types';

// Custom Hooks
import { useAppState } from './hooks/useAppState';
import { useWorkspaceHandlers } from './hooks/useWorkspaceHandlers';
import { useDiagramHandlers } from './hooks/useDiagramHandlers';
import { useFolderHandlers } from './hooks/useFolderHandlers';
import { useNavigationHandlers } from './hooks/useNavigationHandlers';
import { useCommentHandlers } from './hooks/useCommentHandlers';
import { useNodeLinkHandlers } from './hooks/useNodeLinkHandlers';
import { useRepoHandlers } from './hooks/useRepoHandlers';
import { useCodeLinkHandlers } from './hooks/useCodeLinkHandlers';
import { useSplitPane } from './hooks/useSplitPane';
import { useStoragePersistence } from './hooks/useStoragePersistence';
import { useLLMSettings, storageInsecure } from './hooks/useLLMSettings';
import { useChatHandlers } from './hooks/useChatHandlers';
import { useScanHandlers } from './hooks/useScanHandlers'; // TODO(DELETE): SCAN FEATURE
import { useTokenUsage } from './hooks/useTokenUsage';
import { useCodebaseImport } from './hooks/useCodebaseImport';
import { useCodeGraph } from './hooks/useCodeGraph';
import { useCodeGraphHandlers } from './hooks/useCodeGraphHandlers';
import { useSyncHandlers } from './hooks/useSyncHandlers';
import { useProgressLog } from './hooks/useProgressLog';
import { useToast } from './hooks/useToast';
import { useAgentMission } from './hooks/useAgentMission';
import { ToastContainer } from './components/ToastContainer';
import { AgentMissionPanel } from './components/AgentMissionPanel';
import { codeGraphStorageService } from './services/codeGraphStorageService';
import {
  buildExportPlan,
  detectExistingExport,
  materializePlan,
} from './services/codeGraphExportService';
import { FlowExportModal } from './components/FlowExportModal';
import { TokenDashboardModal } from './components/TokenDashboardModal';
import { SyncDiffModal } from './components/SyncDiffModal';
import { CodeGraph } from './types';

export default function App() {
  // --- Toast Notifications ---
  const { toasts, showToast, dismissToast } = useToast();

  // --- Token Usage ---
  const { records: tokenRecords, recordUsage, clearUsage } = useTokenUsage();
  const [isTokenDashboardOpen, setIsTokenDashboardOpen] = useState(false);

  // Register global listener — captures ALL llmService.sendMessage/runAgentLoop calls
  useEffect(() => {
    setUsageListener(recordUsage);
  }, [recordUsage]);

  // --- State Management ---
  const {
    workspaces,
    setWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    diagrams,
    setDiagrams,
    folders,
    setFolders,
    activeId,
    setActiveId,
    repos,
    setRepos,
    error,
    setError,
    isGlobalAIOpen,
    setIsGlobalAIOpen,
    isNodeLinkManagerOpen,
    setIsNodeLinkManagerOpen,
    isRepoManagerOpen,
    setIsRepoManagerOpen,
    isCodeLinkManagerOpen,
    setIsCodeLinkManagerOpen,
    isAISettingsOpen,
    setIsAISettingsOpen,
    isAIChatOpen,
    setIsAIChatOpen,
    isScanResultsOpen,
    setIsScanResultsOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isEditorCollapsed,
    setIsEditorCollapsed,
    saveStatus,
    setSaveStatus,
    navigationStack,
    setNavigationStack,
    isCodePanelOpen,
    setIsCodePanelOpen,
    activeCodeFile,
    setActiveCodeFile,
    isDiffViewOpen,
    setIsDiffViewOpen,
    isAnalysisPanelOpen,
    setIsAnalysisPanelOpen,
    diffViewData,
    setDiffViewData,
    isCodebaseImportOpen,
    setIsCodebaseImportOpen,
    activeGraphId,
    setActiveGraphId,
    isCodeGraphConfigOpen,
    setIsCodeGraphConfigOpen,
    workspaceDiagrams,
    workspaceFolders,
    workspaceRepos,
    activeDiagram,
    breadcrumbPath
  } = useAppState();

  // --- Handlers ---
  const { handleCreateWorkspace, handleDeleteWorkspace, handleRenameWorkspace } =
    useWorkspaceHandlers(workspaces, setWorkspaces, activeWorkspaceId, setActiveWorkspaceId, setDiagrams, setFolders);

  const {
    handleCreateDiagram,
    handleImportDiagrams,
    handleDeleteDiagram,
    handleMoveDiagram,
    updateActiveDiagram
  } = useDiagramHandlers(diagrams, setDiagrams, activeWorkspaceId, activeId, setActiveId);

  const { handleCreateFolder, createFolderProgrammatic, handleDeleteFolder, handleRenameFolder } =
    useFolderHandlers(folders, setFolders, diagrams, setDiagrams, activeWorkspaceId);

  const { handleZoomIn, handleZoomOut, handleGoToRoot, handleBreadcrumbNavigate } =
    useNavigationHandlers(activeId, setActiveId, navigationStack, setNavigationStack);

  const { handleAddComment, handleDeleteComment } =
    useCommentHandlers(activeDiagram, updateActiveDiagram);

  const { handleAddNodeLink, handleRemoveNodeLink } =
    useNodeLinkHandlers(activeDiagram, updateActiveDiagram);

  const { handleAddRepo, handleAddGithubRepo, handleRemoveRepo, handleReopenRepo, handleUpdateGithubBranch } =
    useRepoHandlers(repos, setRepos, activeWorkspaceId, showToast);

  const { handleAddCodeLink, handleRemoveCodeLink } =
    useCodeLinkHandlers(activeDiagram, updateActiveDiagram);

  const { leftWidthPercent, isDragging, containerRef, handleMouseDown } = useSplitPane();

  // --- LLM / AI ---
  const { llmSettings, updateProvider, setActiveProvider, hasConfiguredProvider } = useLLMSettings();

  const { chatSession, isAIChatLoading, sendChatMessage, applyCodeFromMessage, clearChat } =
    useChatHandlers(activeDiagram, updateActiveDiagram, llmSettings);

  // TODO(DELETE): SCAN FEATURE — remove this block and all scan props passed below
  const {
    scanResult, isScanning, scanError, runScan, addMissingToDiagram, clearScanResult,
    syncMode, setSyncMode, syncStatus, applySuggestion, applyAllSuggestions
  } = useScanHandlers(activeDiagram, updateActiveDiagram, llmSettings, workspaceRepos);

  // --- Codebase Import ---
  const {
    progress: codebaseImportProgress,
    isImporting: isCodebaseImporting,
    startImport: startCodebaseImport,
    resetProgress: resetCodebaseImport
  } = useCodebaseImport({
    diagrams,
    setDiagrams,
    repos: workspaceRepos,
    activeWorkspaceId,
    createFolderProgrammatic,
    setActiveId,
  });

  // --- Progress Log ---
  const progressLog = useProgressLog();

  // --- Agent Mission Control ---
  const agentMission = useAgentMission();

  // --- CodeGraph ---
  const codeGraph = useCodeGraph(activeWorkspaceId);
  const codeGraphHandlers = useCodeGraphHandlers(codeGraph.activeGraph, codeGraph.updateGraph);

  // --- Incremental Sync ---
  const {
    syncMode: graphSyncMode,
    pendingProposals,
    graphSyncStatuses,
    isCheckingSync,
    isSyncingGraph,
    lastSyncDiff,
    handleCheckSync,
    handleIncrementalSync,
    handleApplyProposal,
    handleDismissProposal,
    handleSetSyncMode: handleSetGraphSyncMode,
  } = useSyncHandlers();
  const [isSyncDiffModalOpen, setIsSyncDiffModalOpen] = useState(false);
  const SYNC_HIGHLIGHTS_KEY = `bluelens_sync_highlights_${codeGraph.activeGraph?.id ?? ''}`;
  const [syncHighlights, setSyncHighlights] = useState<Record<string, 'added' | 'modified' | 'removed'>>(() => {
    try { return JSON.parse(localStorage.getItem(SYNC_HIGHLIGHTS_KEY) ?? 'null') ?? {}; } catch { return {}; }
  });
  const [syncRemovedNames, setSyncRemovedNames] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SYNC_HIGHLIGHTS_KEY + '_removed') ?? 'null') ?? []; } catch { return []; }
  });

  // React to new sync diffs: build highlight map, show toast, auto-clear after 8s
  useEffect(() => {
    if (!lastSyncDiff) return;
    const highlights: Record<string, 'added' | 'modified' | 'removed'> = {};
    const graph = codeGraph.activeGraph;

    const propagateToAncestors = (nodeId: string) => {
      if (!graph) return;
      let current = graph.nodes[nodeId];
      while (current?.parentId) {
        highlights[current.parentId] = 'modified'; // ancestors always show orange
        current = graph.nodes[current.parentId];
      }
    };

    // First pass: propagate ancestors (orange) for all changed nodes
    for (const node of lastSyncDiff.addedNodes) propagateToAncestors(node.id);
    for (const { after } of lastSyncDiff.modifiedNodes) propagateToAncestors(after.id);
    for (const node of lastSyncDiff.removedNodes) propagateToAncestors(node.id);

    // Second pass: apply direct colors — overrides any ancestor propagation that may have
    // incorrectly colored a node that is itself directly added/modified/removed
    for (const node of lastSyncDiff.addedNodes) highlights[node.id] = 'added';
    for (const { after } of lastSyncDiff.modifiedNodes) highlights[after.id] = 'modified';
    for (const node of lastSyncDiff.removedNodes) highlights[node.id] = 'removed';

    setSyncHighlights(highlights);
    // Show removed D3 symbols + removed D2 files in the legend
    const removedD3 = lastSyncDiff.removedNodes.filter(n => n.depth === 3).map(n => n.name);
    const removedD2 = lastSyncDiff.removedNodes.filter(n => n.depth === 2).map(n => n.name);
    const removed = [...removedD2.map(name => `📄 ${name}`), ...removedD3];
    setSyncRemovedNames(removed);
    try {
      localStorage.setItem(SYNC_HIGHLIGHTS_KEY, JSON.stringify(highlights));
      localStorage.setItem(SYNC_HIGHLIGHTS_KEY + '_removed', JSON.stringify(removed));
    } catch { /* quota */ }

    const addedCount    = lastSyncDiff.addedNodes.length;
    const modifiedCount = lastSyncDiff.modifiedNodes.length;
    const removedCount  = lastSyncDiff.removedNodes.length;
    const parts: string[] = [];
    if (addedCount    > 0) parts.push(`+${addedCount} ${addedCount === 1 ? 'node' : 'nodes'}`);
    if (modifiedCount > 0) parts.push(`~${modifiedCount} modified`);
    if (removedCount  > 0) parts.push(`-${removedCount} removed`);
    const summary = parts.length > 0 ? `Sync: ${parts.join(' · ')}` : 'Sync complete — no changes';
    showToast(summary, 'info');
  }, [lastSyncDiff, showToast]);

  // --- Global AI Chat ---
  const [globalChatMessages, setGlobalChatMessages] = useState<ChatMessage[]>([]);
  const [isGlobalAILoading, setIsGlobalAILoading] = useState(false);
  const globalMsgCounterRef = useRef(0);
  const globalAbortRef = useRef<AbortController | null>(null);

  const handleGlobalSend = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `global-${Date.now()}-${++globalMsgCounterRef.current}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    // Add a pending assistant message immediately so the UI updates in real-time
    const pendingId = `global-${Date.now() + 1}-${++globalMsgCounterRef.current}`;
    const pendingMsg: ChatMessage = {
      id: pendingId,
      role: 'assistant',
      content: '', // empty = still thinking; UI shows spinner
      timestamp: Date.now(),
      toolSteps: [],
    };
    setGlobalChatMessages(prev => [...prev, userMsg, pendingMsg]);
    setIsGlobalAILoading(true);
    const abortController = new AbortController();
    globalAbortRef.current = abortController;

    try {
      const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

      const context: import('./services/aiChatService').GlobalAIContext = {
        workspaceName: activeWorkspace?.name,
        activeDiagramName: activeDiagram?.name,
        activeCodeGraph: codeGraph.activeGraph ? {
          name: codeGraph.activeGraph.name,
          nodeCount: Object.keys(codeGraph.activeGraph.nodes).length,
          lenses: codeGraph.activeGraph.lenses.map((l: import('./types').ViewLens) => l.name),
          modulesSummary: '',
          flowNames: [],
        } : undefined,
      };

      const systemPrompt = aiChatService.buildAgentSystemPrompt(context);
      const allMessages = [...globalChatMessages, userMsg];
      const llmMessages = aiChatService.chatMessagesToLLMMessages(allMessages);

      // Tool context: give the executor read access to workspace state + write callbacks
      const toolContext: import('./services/agentToolService').AgentToolContext = {
        diagrams,
        folders,
        codeGraphs: codeGraph.codeGraphs,
        repos: workspaceRepos,
        workspaceId: activeWorkspaceId,
        onCreateFolder: (name, parentId) => createFolderProgrammatic(name, parentId),
        onCreateDiagram: (name, code, folderId, description) => {
          const id = Math.random().toString(36).substr(2, 9);
          const newDiagram: import('./types').Diagram = {
            id, name, code, description, comments: [], lastModified: Date.now(),
            folderId: folderId ?? null, workspaceId: activeWorkspaceId, nodeLinks: [],
          };
          setDiagrams(prev => [...prev, newDiagram]);
          setActiveId(newDiagram.id);
          return id;
        },
        onUpdateDiagram: (id, code) => {
          setDiagrams(prev => prev.map(d => d.id === id ? { ...d, code, lastModified: Date.now() } : d));
        },
        onAddNodeLink: (diagramId, nodeId, targetDiagramId, label) => {
          setDiagrams(prev => prev.map(d => {
            if (d.id !== diagramId) return d;
            const links = (d.nodeLinks || []).filter(l => l.nodeId !== nodeId);
            return { ...d, nodeLinks: [...links, { nodeId, targetDiagramId, label }] };
          }));
        },
        onRemoveNodeLink: (diagramId, nodeId) => {
          setDiagrams(prev => prev.map(d =>
            d.id !== diagramId ? d : { ...d, nodeLinks: (d.nodeLinks || []).filter(l => l.nodeId !== nodeId) }
          ));
        },
        onAddCodeLink: (diagramId, nodeId, repoId, filePath, lineStart, lineEnd, label) => {
          setDiagrams(prev => prev.map(d => {
            if (d.id !== diagramId) return d;
            const links = (d.codeLinks || []).filter(l => l.nodeId !== nodeId);
            return { ...d, codeLinks: [...links, { nodeId, repoId, filePath, lineStart, lineEnd, label }] };
          }));
        },
        onRemoveCodeLink: (diagramId, nodeId) => {
          setDiagrams(prev => prev.map(d =>
            d.id !== diagramId ? d : { ...d, codeLinks: (d.codeLinks || []).filter(l => l.nodeId !== nodeId) }
          ));
        },
      };

      const { AGENT_TOOLS, executeTool } = await import('./services/agentToolService');

      // Wrap executor: after each tool call, append the step to the pending message
      const trackingExecutor = async (name: string, args: Record<string, unknown>) => {
        const step = await executeTool(name, args, toolContext);
        setGlobalChatMessages(prev => prev.map(m =>
          m.id === pendingId
            ? { ...m, toolSteps: [...(m.toolSteps ?? []), step] }
            : m
        ));
        return step;
      };

      const result = await llmService.runAgentLoop(
        llmMessages,
        systemPrompt,
        AGENT_TOOLS,
        trackingExecutor,
        llmSettings,
        { signal: abortController.signal, source: 'ai-chat' },
      );

      // Finalise the pending message with the response text (or mark interrupted)
      setGlobalChatMessages(prev => prev.map(m =>
        m.id === pendingId
          ? {
            ...m,
            content: result.content,
            diagramCodeSnapshot: aiChatService.extractMermaidFromResponse(result.content) || undefined,
            toolSteps: m.toolSteps && m.toolSteps.length > 0 ? m.toolSteps : undefined,
            interrupted: result.interrupted ?? false,
            continuationContext: result.continuationContext,
            usage: result.usage,
          }
          : m
      ));
    } catch (err: any) {
      const wasAborted = err?.name === 'AbortError';
      setGlobalChatMessages(prev => prev.map(m =>
        m.id === pendingId
          ? {
            ...m,
            content: wasAborted ? '' : `Error: ${err.message || 'Failed to get response'}`,
            stopped: wasAborted ? true : undefined,
          }
          : m
      ));
    } finally {
      globalAbortRef.current = null;
      setIsGlobalAILoading(false);
    }
  }, [globalChatMessages, llmSettings, workspaces, activeWorkspaceId, activeDiagram, diagrams, folders, codeGraph.codeGraphs, codeGraph.activeGraph, workspaceRepos, setDiagrams, setActiveId]);

  const handleContinueAgent = useCallback(async (msg: ChatMessage) => {
    if (!msg.continuationContext) return;

    // Restore the message to pending state (removes Continue button, shows spinner)
    setGlobalChatMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, interrupted: false, stopped: false, content: '' } : m
    ));
    setIsGlobalAILoading(true);
    const abortController = new AbortController();
    globalAbortRef.current = abortController;

    try {
      const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
      const context: import('./services/aiChatService').GlobalAIContext = {
        workspaceName: activeWorkspace?.name,
        activeDiagramName: activeDiagram?.name,
        activeCodeGraph: codeGraph.activeGraph ? {
          name: codeGraph.activeGraph.name,
          nodeCount: Object.keys(codeGraph.activeGraph.nodes).length,
          lenses: codeGraph.activeGraph.lenses.map((l: import('./types').ViewLens) => l.name),
          modulesSummary: '',
          flowNames: [],
        } : undefined,
      };
      const systemPrompt = aiChatService.buildAgentSystemPrompt(context);

      const toolContext: import('./services/agentToolService').AgentToolContext = {
        diagrams,
        folders,
        codeGraphs: codeGraph.codeGraphs,
        repos: workspaceRepos,
        workspaceId: activeWorkspaceId,
        onCreateFolder: (name, parentId) => createFolderProgrammatic(name, parentId),
        onCreateDiagram: (name, code, folderId, description) => {
          const id = Math.random().toString(36).substr(2, 9);
          const newDiagram: import('./types').Diagram = {
            id, name, code, description, comments: [], lastModified: Date.now(),
            folderId: folderId ?? null, workspaceId: activeWorkspaceId, nodeLinks: [],
          };
          setDiagrams(prev => [...prev, newDiagram]);
          setActiveId(newDiagram.id);
          return id;
        },
        onUpdateDiagram: (id, code) => {
          setDiagrams(prev => prev.map(d => d.id === id ? { ...d, code, lastModified: Date.now() } : d));
        },
        onAddNodeLink: (diagramId, nodeId, targetDiagramId, label) => {
          setDiagrams(prev => prev.map(d => {
            if (d.id !== diagramId) return d;
            const links = (d.nodeLinks || []).filter(l => l.nodeId !== nodeId);
            return { ...d, nodeLinks: [...links, { nodeId, targetDiagramId, label }] };
          }));
        },
        onRemoveNodeLink: (diagramId, nodeId) => {
          setDiagrams(prev => prev.map(d =>
            d.id !== diagramId ? d : { ...d, nodeLinks: (d.nodeLinks || []).filter(l => l.nodeId !== nodeId) }
          ));
        },
        onAddCodeLink: (diagramId, nodeId, repoId, filePath, lineStart, lineEnd, label) => {
          setDiagrams(prev => prev.map(d => {
            if (d.id !== diagramId) return d;
            const links = (d.codeLinks || []).filter(l => l.nodeId !== nodeId);
            return { ...d, codeLinks: [...links, { nodeId, repoId, filePath, lineStart, lineEnd, label }] };
          }));
        },
        onRemoveCodeLink: (diagramId, nodeId) => {
          setDiagrams(prev => prev.map(d =>
            d.id !== diagramId ? d : { ...d, codeLinks: (d.codeLinks || []).filter(l => l.nodeId !== nodeId) }
          ));
        },
      };

      const { AGENT_TOOLS, executeTool } = await import('./services/agentToolService');
      const msgId = msg.id;

      const trackingExecutor = async (name: string, args: Record<string, unknown>) => {
        const step = await executeTool(name, args, toolContext);
        setGlobalChatMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, toolSteps: [...(m.toolSteps ?? []), step] } : m
        ));
        return step;
      };

      const result = await llmService.runAgentLoop(
        [],
        systemPrompt,
        AGENT_TOOLS,
        trackingExecutor,
        llmSettings,
        { continuationContext: msg.continuationContext, signal: abortController.signal, source: 'ai-chat' },
      );

      setGlobalChatMessages(prev => prev.map(m =>
        m.id === msgId
          ? {
            ...m,
            content: result.content,
            diagramCodeSnapshot: aiChatService.extractMermaidFromResponse(result.content) || undefined,
            toolSteps: m.toolSteps && m.toolSteps.length > 0 ? m.toolSteps : undefined,
            interrupted: result.interrupted ?? false,
            continuationContext: result.continuationContext,
          }
          : m
      ));
    } catch (err: any) {
      const wasAborted = err?.name === 'AbortError';
      setGlobalChatMessages(prev => prev.map(m =>
        m.id === msg.id
          ? {
            ...m,
            content: wasAborted ? '' : `Error: ${err.message || 'Failed to continue'}`,
            interrupted: false,
            stopped: wasAborted ? true : undefined,
          }
          : m
      ));
    } finally {
      globalAbortRef.current = null;
      setIsGlobalAILoading(false);
    }
  }, [llmSettings, workspaces, activeWorkspaceId, activeDiagram, diagrams, folders, codeGraph.codeGraphs, codeGraph.activeGraph, workspaceRepos, setDiagrams, setActiveId]);

  const handleCancelAgent = useCallback(() => {
    globalAbortRef.current?.abort();
  }, []);

  const handleCreateDiagramFromGlobal = useCallback((code: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const count = diagrams.filter(d => d.workspaceId === activeWorkspaceId).length;
    const newDiagram: import('./types').Diagram = {
      id,
      name: `AI Generated ${count + 1}`,
      code,
      comments: [],
      lastModified: Date.now(),
      folderId: null,
      workspaceId: activeWorkspaceId,
      nodeLinks: [],
    };
    setDiagrams(prev => [...prev, newDiagram]);
    setActiveId(newDiagram.id);
    setIsGlobalAIOpen(false);
  }, [diagrams, activeWorkspaceId, setDiagrams, setActiveId, setIsGlobalAIOpen]);

  // --- Flow export state ---
  const [pendingFlowExport, setPendingFlowExport] = useState<{ graph: CodeGraph } | null>(null);
  const [isCreatingGraph, setIsCreatingGraph] = useState(false);
  const graphCreationCancelledRef = useRef(false);
  const isSyncingRef = useRef(false);

  /** Core export logic: builds plan and inserts folders + diagrams.
   *  scopeFilter: if set, only flows with that scopeNodeId are exported/updated. */
  const doExportFlows = useCallback((graph: CodeGraph, mode: 'overwrite' | 'new', scopeFilter?: string) => {
    const flows = Object.values(graph.flows).filter(f => !!f.sequenceDiagram && (scopeFilter === undefined || f.scopeNodeId === scopeFilter));
    if (flows.length === 0) return;

    const plan = buildExportPlan(graph, scopeFilter);
    const { existingFolder, existingDiagrams } = detectExistingExport(graph, folders, diagrams);

    if (mode === 'overwrite' && existingFolder) {
      // Remove old exported diagrams at the target scope only
      const oldIds = new Set(
        existingDiagrams
          .filter(d => scopeFilter === undefined || d.sourceScopeNodeId === scopeFilter)
          .map(d => d.id)
      );
      setDiagrams(prev => prev.filter(d => !oldIds.has(d.id)));
      // Remove old sub-folders only when doing a full export (no scope filter)
      if (scopeFilter === undefined) {
        const oldSubFolderIds = new Set(
          folders.filter(f => f.parentId === existingFolder.id).map(f => f.id)
        );
        setFolders(prev => prev.filter(f => !oldSubFolderIds.has(f.id)));
      }

      // Re-use the existing parent folder ID
      const resolvedIds = new Map([[plan.foldersToCreate[0].tempId, existingFolder.id]]);
      const { folders: newFolders, diagrams: newDiagrams } = materializePlan(
        plan, activeWorkspaceId, resolvedIds
      );
      // Skip the first folder (parent — already exists)
      setFolders(prev => [...prev, ...newFolders.slice(1)]);
      setDiagrams(prev => [...prev, ...newDiagrams]);
    } else {
      // New folder (possibly with version suffix)
      if (mode === 'new' && existingFolder) {
        // Rename parent folder in plan to avoid collision
        plan.foldersToCreate[0].name = `${plan.parentFolderName} (${Date.now()})`;
      }
      const { folders: newFolders, diagrams: newDiagrams } = materializePlan(plan, activeWorkspaceId);
      setFolders(prev => [...prev, ...newFolders]);
      setDiagrams(prev => [...prev, ...newDiagrams]);
    }
  }, [folders, diagrams, setFolders, setDiagrams, activeWorkspaceId]);

  /** Create diagram entries for flows that don't yet have a corresponding diagram.
   *  Used after sync-triggered flow regeneration to materialise new flows without
   *  touching existing flow diagrams (which are handled by the incremental diff panel). */
  const createNewFlowDiagrams = useCallback((graph: CodeGraph) => {
    const existingNames = new Set(
      diagrams.filter(d => d.sourceGraphId === graph.id).map(d => d.name)
    );
    const newFlows = Object.values(graph.flows).filter(
      f => f.sequenceDiagram && !existingNames.has(f.name)
    );
    if (newFlows.length === 0) return;

    const generateId = () => Math.random().toString(36).substr(2, 9);
    const { existingFolder } = detectExistingExport(graph, folders, diagrams);

    const newFolders: import('./types').Folder[] = [];
    const newDiagrams: import('./types').Diagram[] = [];

    let parentFolderId: string;
    if (existingFolder) {
      parentFolderId = existingFolder.id;
    } else {
      const pf: import('./types').Folder = { id: generateId(), name: `Flows: ${graph.name}`, parentId: null, workspaceId: graph.workspaceId };
      newFolders.push(pf);
      parentFolderId = pf.id;
    }

    // Map sub-folder names to IDs (existing or newly created in this batch)
    const subFolderIds = new Map<string, string>(
      folders.filter(f => f.parentId === parentFolderId).map(f => [f.name, f.id])
    );

    for (const flow of newFlows) {
      const isRoot = !flow.scopeNodeId || flow.scopeNodeId === graph.rootNodeId;
      const subName = isRoot ? 'End-to-End Flows' : (graph.nodes[flow.scopeNodeId]?.name ?? flow.scopeNodeId);

      if (!subFolderIds.has(subName)) {
        const sf: import('./types').Folder = { id: generateId(), name: subName, parentId: parentFolderId, workspaceId: graph.workspaceId };
        newFolders.push(sf);
        subFolderIds.set(subName, sf.id);
      }

      newDiagrams.push({
        id: generateId(),
        name: flow.name,
        description: flow.description,
        code: flow.sequenceDiagram,
        comments: [],
        lastModified: Date.now(),
        workspaceId: graph.workspaceId,
        nodeLinks: [],
        sourceGraphId: graph.id,
        sourceScopeNodeId: flow.scopeNodeId,
        folderId: subFolderIds.get(subName)!,
      });
    }

    if (newFolders.length > 0) setFolders(prev => [...prev, ...newFolders]);
    setDiagrams(prev => [...prev, ...newDiagrams]);
    console.log(`[Sync] Created ${newDiagrams.length} new flow diagram(s):`, newDiagrams.map(d => d.name));
  }, [diagrams, folders, setDiagrams, setFolders]);

  /** Trigger export after graph creation/regeneration.
   *  scopeFilter: if set, only ask/update for flows at that scope level. */
  const triggerFlowExport = useCallback((graph: CodeGraph, scopeFilter?: string) => {
    const flows = Object.values(graph.flows).filter(
      f => !!f.sequenceDiagram && (scopeFilter === undefined || f.scopeNodeId === scopeFilter)
    );
    if (flows.length === 0) return;

    const { existingFolder, existingDiagrams } = detectExistingExport(graph, folders, diagrams);
    const scopedExisting = scopeFilter !== undefined
      ? existingDiagrams.filter(d => d.sourceScopeNodeId === scopeFilter)
      : existingDiagrams;

    if (existingFolder && scopedExisting.length > 0) {
      setPendingFlowExport({ graph });
    } else {
      doExportFlows(graph, 'new', scopeFilter);
    }
  }, [folders, diagrams, doExportFlows]);

  const handleCreateGraph = useCallback(async (repoId: string, commitSha?: string) => {
    if (!commitSha) {
      const existing = codeGraph.codeGraphs.find(g => g.repoId === repoId);
      if (existing) {
        codeGraph.selectGraph(existing.id);
        showToast('A Code Graph already exists for this repo. Use Re-parse to regenerate it.', 'info');
        return null;
      }
    }

    const repo = workspaceRepos.find(r => r.id === repoId);
    graphCreationCancelledRef.current = false;
    setIsCreatingGraph(true);
    progressLog.startLog();
    agentMission.start();
    try {
      let result: CodeGraph | null;
      if (repo?.githubOwner) {
        result = await codeGraph.createGithubGraph(
          repoId,
          repo.githubOwner,
          repo.githubRepo!,
          repo.githubBranch || 'main',
          llmSettings,
          progressLog.addEntry,
          (resolvedBranch) => handleUpdateGithubBranch(repoId, resolvedBranch),
          agentMission.addEvent,
          agentMission.updateBlackboard,
        );
      } else {
        result = await codeGraph.createGraph(repoId, llmSettings, progressLog.addEntry, commitSha, agentMission.addEvent, agentMission.updateBlackboard);
      }
      if (result) triggerFlowExport(result);
      else if (graphCreationCancelledRef.current) showToast('Graph creation cancelled', 'info');
      return result;
    } catch (err: any) {
      if (err instanceof LLMRateLimitError) {
        showToast(err.message, 'error');
      } else if (err instanceof LLMConfigError) {
        showToast('An AI API key is required to create a Code Graph. Configure one in AI Settings.', 'error');
        setIsAISettingsOpen(true);
      } else {
        showToast(`Graph creation failed: ${err?.message ?? 'Unknown error'}`, 'error');
      }
      return null;
    } finally {
      progressLog.endLog();
      agentMission.stop();
      setIsCreatingGraph(false);
    }
  }, [codeGraph.codeGraphs, codeGraph.selectGraph, codeGraph.createGraph, codeGraph.createGithubGraph, workspaceRepos, llmSettings, progressLog.startLog, progressLog.addEntry, progressLog.endLog, agentMission.start, agentMission.stop, agentMission.addEvent, triggerFlowExport, showToast, setIsAISettingsOpen, handleUpdateGithubBranch]);

  const handleCancelCreateGraph = useCallback(() => {
    graphCreationCancelledRef.current = true;
    codeGraph.cancelCreateGraph();
  }, [codeGraph.cancelCreateGraph]);

  const handleReparseGraph = useCallback(async () => {
    if (!codeGraph.activeGraph) return;
    const repoId = codeGraph.activeGraph.repoId;
    codeGraph.deleteGraph(codeGraph.activeGraph.id);
    await handleCreateGraph(repoId);
  }, [codeGraph.activeGraph, codeGraph.deleteGraph, handleCreateGraph]);

  const handleRegenerateFlows = useCallback(
    async (options?: { scopeNodeId?: string; customPrompt?: string }) => {
      // Agentic pipeline (with Mission Control panel) only for root/D1 scopes
      const scopeNode = options?.scopeNodeId ? codeGraph.activeGraph?.nodes[options.scopeNodeId] : null;
      const isAgenticRun = !scopeNode || scopeNode.depth <= 1;
      if (isAgenticRun) agentMission.start();
      try {
        const updated = await codeGraph.regenerateFlows(
          llmSettings,
          options,
          isAgenticRun ? agentMission.addEvent : undefined,
          isAgenticRun ? agentMission.updateBlackboard : undefined,
        );
        // Use the returned graph directly — codeGraph.activeGraph is a stale closure here
        if (updated) triggerFlowExport(updated, options?.scopeNodeId);
      } catch (err: any) {
        if (err instanceof LLMRateLimitError) {
          showToast(err.message, 'error');
        } else if (err instanceof LLMConfigError) {
          showToast('An AI API key is required to generate sequence diagrams. Configure one in AI Settings.', 'error');
          setIsAISettingsOpen(true);
        } else {
          showToast(`Flow generation failed: ${err?.message ?? 'Unknown error'}`, 'error');
        }
      } finally {
        if (isAgenticRun) agentMission.stop();
      }
    },
    [codeGraph.regenerateFlows, llmSettings, triggerFlowExport, showToast, setIsAISettingsOpen, agentMission]
  );

  const handleSaveCodeGraphConfig = useCallback((config: import('./types').CodeGraphConfig) => {
    codeGraphStorageService.saveCodeGraphConfig(config);
  }, []);

  // --- Sync diagram update (from incremental sync proposals) ---
  const handleUpdateDiagramFromSync = useCallback((
    id: string,
    code: string,
    generatedFromGraphAt: number
  ) => {
    setDiagrams(prev => prev.map(d =>
      d.id === id ? { ...d, code, generatedFromGraphAt, lastModified: Date.now() } : d
    ));
  }, [setDiagrams]);

  const resolveHandle = useCallback(async (repoId: string): Promise<FileSystemDirectoryHandle | null> => {
    let handle = fileSystemService.getHandle(repoId) ?? null;
    if (!handle) {
      await fileSystemService.reconnectRepo(repoId);
      handle = fileSystemService.getHandle(repoId) ?? null;
    }
    return handle;
  }, []);

  const handleCodeGraphCheckSync = useCallback(async () => {
    if (!codeGraph.activeGraph) return;
    const handle = await resolveHandle(codeGraph.activeGraph.repoId);
    if (!handle) { showToast('Cannot access files — please reopen the repository folder.', 'error'); return; }
    handleCheckSync(codeGraph.activeGraph, handle, codeGraph.updateGraph);
  }, [codeGraph.activeGraph, codeGraph.updateGraph, handleCheckSync, resolveHandle, showToast]);

  // Auto-check on graph selection — runs silently when a graph becomes active
  useEffect(() => {
    if (!codeGraph.activeGraph) return;
    const graph = codeGraph.activeGraph;
    if (Object.keys(graph.syncLock).length === 0) return;
    const timer = setTimeout(async () => {
      const handle = await resolveHandle(graph.repoId);
      if (!handle) return;
      handleCheckSync(graph, handle, codeGraph.updateGraph);
    }, 500);
    return () => clearTimeout(timer);
  }, [codeGraph.activeGraph?.id]);

  // Auto-check on window focus — user comes back from their editor
  useEffect(() => {
    const onFocus = async () => {
      const graph = codeGraph.activeGraph;
      if (!graph || Object.keys(graph.syncLock).length === 0) return;
      const handle = await resolveHandle(graph.repoId);
      if (!handle) return;
      handleCheckSync(graph, handle, codeGraph.updateGraph);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [codeGraph.activeGraph, codeGraph.updateGraph, resolveHandle, handleCheckSync]);

  const handleCodeGraphIncrementalSync = useCallback(async () => {
    if (!codeGraph.activeGraph) return;
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const handle = await resolveHandle(codeGraph.activeGraph.repoId);
    if (!handle) { isSyncingRef.current = false; showToast('Cannot access files — please reopen the repository folder.', 'error'); return; }
    const repoName = codeGraph.activeGraph.name;
    agentMission.start();
    handleIncrementalSync(
      codeGraph.activeGraph,
      handle,
      repoName,
      diagrams,
      llmSettings,
      codeGraph.updateGraph,
      (id, code) => {
        setDiagrams(prev => prev.map(d =>
          d.id === id ? { ...d, code, lastModified: Date.now() } : d
        ));
      },
      (g) => codeGraph.regenerateFlows(llmSettings, undefined, agentMission.addEvent, agentMission.updateBlackboard, g),
    ).then(({ linkedDiagrams, proposalsGenerated, proposalsApplied, flowsGraph }) => {
      // Create diagrams for newly generated flows (not covered by incremental diff panel)
      if (flowsGraph) createNewFlowDiagrams(flowsGraph);

      if (linkedDiagrams === 0) {
        showToast('No diagrams linked to this code graph — link diagrams via the sidebar first.', 'warning');
      } else if (proposalsGenerated === 0 && proposalsApplied === 0) {
        showToast(`${linkedDiagrams} linked diagram${linkedDiagrams > 1 ? 's' : ''} checked — no updates needed.`, 'info');
      } else {
        const parts: string[] = [];
        if (proposalsApplied > 0) parts.push(`${proposalsApplied} updated automatically`);
        if (proposalsGenerated > 0) parts.push(`${proposalsGenerated} pending review — click the button in the top bar`);
        showToast(parts.join(' · '), proposalsGenerated > 0 ? 'success' : 'info');
      }
    }).finally(() => { agentMission.stop(); isSyncingRef.current = false; });
  }, [codeGraph.activeGraph, codeGraph.updateGraph, codeGraph.regenerateFlows, diagrams, handleIncrementalSync, llmSettings, setDiagrams, agentMission, createNewFlowDiagrams]);

  const handleCodeGraphViewCode = useCallback(async (nodeId: string) => {
    if (!codeGraph.activeGraph) return;
    const node = codeGraph.activeGraph.nodes[nodeId];
    if (!node?.sourceRef) return;

    // GitHub-backed graph (demo or user-added public repo) — fetch via proxy
    const activeRepo = workspaceRepos.find(r => r.id === codeGraph.activeGraph!.repoId);
    const isGithubGraph = codeGraph.activeGraph.repoId === DEMO_REPO_ID || !!activeRepo?.githubOwner;
    if (isGithubGraph) {
      const rawBase = activeRepo?.githubOwner
        ? buildRawBase(activeRepo.githubOwner, activeRepo.githubRepo!, activeRepo.githubBranch || 'main')
        : DEMO_RAW_BASE;
      try {
        const rawUrl = `${rawBase}/${node.sourceRef.filePath}`;
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(res.statusText);
        const content = await res.text();
        const language = fileSystemService.getLanguage(node.sourceRef.filePath);
        setActiveCodeFile({
          repoId: codeGraph.activeGraph!.repoId,
          filePath: node.sourceRef.filePath,
          content,
          language,
          lineStart: node.sourceRef.lineStart,
          lineEnd: node.sourceRef.lineEnd,
        });
        setIsCodePanelOpen(true);
      } catch (e) {
        console.error('Failed to fetch demo file:', e);
        showToast('Failed to fetch file from GitHub.', 'error');
      }
      return;
    }

    let handle = fileSystemService.getHandle(codeGraph.activeGraph.repoId);
    if (!handle) {
      // Handle lost (page refresh) — try to reconnect silently from IndexedDB.
      // The user's click counts as a user gesture, so requestPermission() will work.
      await fileSystemService.reconnectRepo(codeGraph.activeGraph.repoId);
      handle = fileSystemService.getHandle(codeGraph.activeGraph.repoId);
    }
    if (!handle) {
      // TODO(known-issue): repoId mismatch — graph.repoId references a repo that was
      // removed+re-added (new UUID). Fallback picks the FIRST connected repo, which is
      // wrong when multiple repos are connected. Proper fix: store repo *name* on the
      // CodeGraph and resolve by name, or prompt the user to re-link the graph to a repo.
      // Tracked: KNOWN_ISSUES.md
      const fallbackRepo = workspaceRepos.find(r => fileSystemService.hasHandle(r.id));
      if (fallbackRepo) handle = fileSystemService.getHandle(fallbackRepo.id);
    }
    if (!handle) {
      showToast('Repository is disconnected. Please reopen it from the Repo Manager.', 'warning');
      setIsRepoManagerOpen(true);
      return;
    }

    try {
      const content = await fileSystemService.readFile(handle, node.sourceRef.filePath);
      const language = fileSystemService.getLanguage(node.sourceRef.filePath);
      const codeFile: CodeFile = {
        repoId: codeGraph.activeGraph.repoId,
        filePath: node.sourceRef.filePath,
        content,
        language,
        lineStart: node.sourceRef.lineStart,
        lineEnd: node.sourceRef.lineEnd,
      };
      setActiveCodeFile(codeFile);
      setIsCodePanelOpen(true);
    } catch (e) {
      console.error('Failed to read file:', e);
      showToast('Failed to read file. The repository may need to be reopened.', 'error');
    }
  }, [codeGraph.activeGraph, setActiveCodeFile, setIsCodePanelOpen, setIsRepoManagerOpen, showToast]);

  const handleCodeGraphAnalyzeDomain = useCallback(() => {
    codeGraph.analyzeDomain(llmSettings);
  }, [codeGraph.analyzeDomain, llmSettings]);

  const handleOpenFlowInEditor = useCallback((flow: import('./types').GraphFlow) => {
    const existing = diagrams.find(
      d => d.sourceGraphId === codeGraph.activeGraphId && d.name === flow.name
    );
    if (existing) {
      setActiveId(existing.id);
      codeGraph.selectGraph(null);
    } else if (codeGraph.activeGraph && flow.sequenceDiagram) {
      // Create the diagram on-the-fly so the user can open it immediately
      const generateId = () => Math.random().toString(36).substr(2, 9);
      const newDiagram: import('./types').Diagram = {
        id: generateId(),
        name: flow.name,
        description: flow.description,
        code: flow.sequenceDiagram,
        lastModified: Date.now(),
        folderId: null,
        workspaceId: activeWorkspaceId,
        nodeLinks: [],
        sourceGraphId: codeGraph.activeGraphId!,
        sourceScopeNodeId: flow.scopeNodeId,
      };
      setDiagrams(prev => [...prev, newDiagram]);
      setActiveId(newDiagram.id);
      codeGraph.selectGraph(null);
    }
  }, [diagrams, codeGraph.activeGraph, codeGraph.activeGraphId, codeGraph.selectGraph, setActiveId, setDiagrams, activeWorkspaceId]);

  // --- Diagram Analysis ---
  const [diagramAnalysis, setDiagramAnalysis] = useState<DiagramAnalysis | null>(null);

  const handleAnalyzeDiagram = useCallback(() => {
    if (!activeDiagram) return;
    const analysis = diagramAnalyzerService.analyze(activeDiagram.code);
    setDiagramAnalysis(analysis);
    setIsAnalysisPanelOpen(true);
  }, [activeDiagram, setIsAnalysisPanelOpen]);

  // --- Scaffold Generation ---
  const handleGenerateScaffold = useCallback(async (language: string) => {
    if (!activeDiagram) return;
    try {
      const scaffold = await scaffoldService.generateScaffold(
        activeDiagram.code,
        language,
        llmSettings
      );
      // Show scaffold in chat as an AI message
      sendChatMessage(`Generate ${language} code scaffolding from this diagram`);
    } catch (err: any) {
      setError(err.message || 'Scaffold generation failed');
    }
  }, [activeDiagram, llmSettings, sendChatMessage, setError]);

  // TODO(DELETE): SCAN FEATURE — handleUpdateScanConfig + ScanConfig import
  const handleUpdateScanConfig = useCallback((repoId: string, config: ScanConfig) => {
    setRepos(prev => prev.map(r =>
      r.id === repoId ? { ...r, scanConfig: config } : r
    ));
  }, [setRepos]);

  // --- Persistence ---
  useStoragePersistence(
    diagrams,
    folders,
    workspaces,
    repos,
    activeWorkspaceId,
    activeId,
    setSaveStatus
  );

  // --- Helper Functions ---
  const handleCodeChange = (code: string) => {
    updateActiveDiagram({ code });
    if (error) setError(null);
  };

  const handleImportBlueprint = (data: BlueprintImportResult) => {
    setWorkspaces(prev => [...prev, ...data.workspaces]);
    setFolders(prev => [...prev, ...data.folders]);
    setDiagrams(prev => [...prev, ...data.diagrams]);
    if (data.workspaces.length > 0) {
      setActiveWorkspaceId(data.workspaces[0].id);
    }
    if (data.diagrams.length > 0) {
      setActiveId(data.diagrams[0].id);
    }
  };

  const handleViewCode = async (nodeId: string) => {
    if (!activeDiagram) return;
    const codeLink = (activeDiagram.codeLinks || []).find(cl => cl.nodeId === nodeId);
    if (!codeLink) return;

    let handle = fileSystemService.getHandle(codeLink.repoId);
    if (!handle) {
      // Handle lost (page refresh) — try to reconnect silently from IndexedDB.
      await fileSystemService.reconnectRepo(codeLink.repoId);
      handle = fileSystemService.getHandle(codeLink.repoId);
    }
    if (!handle) {
      // TODO(known-issue): same repoId mismatch as handleCodeGraphViewCode.
      // Tracked: KNOWN_ISSUES.md
      const fallbackRepo = workspaceRepos.find(r => fileSystemService.hasHandle(r.id));
      if (fallbackRepo) handle = fileSystemService.getHandle(fallbackRepo.id);
    }
    if (!handle) {
      showToast('Repository is disconnected. Please reopen it from the Repo Manager.', 'warning');
      setIsRepoManagerOpen(true);
      return;
    }

    try {
      const content = await fileSystemService.readFile(handle, codeLink.filePath);
      const language = fileSystemService.getLanguage(codeLink.filePath);
      const codeFile: CodeFile = {
        repoId: codeLink.repoId,
        filePath: codeLink.filePath,
        content,
        language,
        lineStart: codeLink.lineStart,
        lineEnd: codeLink.lineEnd,
      };
      setActiveCodeFile(codeFile);
      setIsCodePanelOpen(true);
      setIsAIChatOpen(false); // Mutually exclusive with chat panel
    } catch (e) {
      console.error('Failed to read file:', e);
      showToast('Failed to read file. The repository may need to be reopened.', 'error');
    }
  };

  const handleCloseCodePanel = () => {
    setIsCodePanelOpen(false);
    setActiveCodeFile(null);
  };

  const handleApplyDiff = (code: string) => {
    updateActiveDiagram({ code });
  };

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-gray-200">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <AppHeader
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenGlobalAI={() => setIsGlobalAIOpen(true)}
        onOpenAISettings={() => setIsAISettingsOpen(true)}
        onOpenRepoManager={() => setIsRepoManagerOpen(true)}
        onOpenTokenDashboard={() => setIsTokenDashboardOpen(true)}
        isSidebarOpen={isSidebarOpen}
        repoCount={workspaceRepos.length}
        pendingProposalCount={pendingProposals.reduce((n, p) => n + p.diagramDiffs.length, 0)}
        onReviewProposals={() => setIsSyncDiffModalOpen(true)}
        isSyncingDiagrams={isCheckingSync || isSyncingGraph}
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'block' : 'hidden'} lg:block h-full`}>
          <Sidebar
            diagrams={workspaceDiagrams}
            folders={workspaceFolders}
            allDiagrams={diagrams}
            allFolders={folders}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              if (codeGraph.activeGraphId) codeGraph.selectGraph(null);
            }}
            onCreate={handleCreateDiagram}
            onDelete={handleDeleteDiagram}
            onImport={handleImportDiagrams}
            onImportBlueprint={handleImportBlueprint}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onMoveDiagram={handleMoveDiagram}
            onSwitchWorkspace={setActiveWorkspaceId}
            onCreateWorkspace={handleCreateWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRenameWorkspace={handleRenameWorkspace}
            onOpenRepoManager={() => setIsRepoManagerOpen(true)}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onLinkDiagramToGraph={(diagramId, graphId) => {
              setDiagrams(prev => prev.map(d =>
                d.id === diagramId ? { ...d, sourceGraphId: graphId ?? undefined } : d
              ));
            }}
            repos={workspaceRepos}
            codeGraphs={codeGraph.codeGraphs}
            activeGraphId={codeGraph.activeGraphId}
            onSelectGraph={codeGraph.selectGraph}
            onCreateGraph={handleCreateGraph}
            onDeleteGraph={codeGraph.deleteGraph}
            hasConfiguredAI={hasConfiguredProvider}
            onLoadDemoGraph={() => {
              progressLog.startLog();
              agentMission.start();
              codeGraph.loadDemoGraph(llmSettings, progressLog.addEntry, agentMission.addEvent, agentMission.updateBlackboard)
                .then(graph => { if (graph) triggerFlowExport(graph); })
                .catch((err: any) => {
                  if (err instanceof LLMRateLimitError) {
                    showToast(err.message, 'error');
                  } else if (err instanceof LLMConfigError) {
                    showToast('An AI API key is required to load the demo graph. Configure one in AI Settings.', 'error');
                    setIsAISettingsOpen(true);
                  }
                })
                .finally(() => { progressLog.endLog(); agentMission.stop(); });
            }}
            isDemoLoading={codeGraph.isDemoLoading}
            demoError={codeGraph.demoError}
            isCreatingGraph={isCreatingGraph}
            onCancelCreateGraph={handleCancelCreateGraph}
            graphCreationProgress={codeGraph.graphCreationProgress}
            showToast={showToast}
          />
        </div>

        {/* Workspace */}
        <WorkspaceView
          activeDiagram={activeDiagram}
          error={error}
          isEditorCollapsed={isEditorCollapsed}
          onToggleEditorCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
          onCodeChange={handleCodeChange}
          onNameChange={(name) => updateActiveDiagram({ name })}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onError={setError}
          onSuccess={() => setError(null)}
          breadcrumbPath={breadcrumbPath}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onGoToRoot={handleGoToRoot}
          onBreadcrumbNavigate={handleBreadcrumbNavigate}
          onManageLinks={() => setIsNodeLinkManagerOpen(true)}
          onManageCodeLinks={() => setIsCodeLinkManagerOpen(true)}
          onViewCode={handleViewCode}
          isCodePanelOpen={isCodePanelOpen}
          activeCodeFile={activeCodeFile}
          onCloseCodePanel={handleCloseCodePanel}
          isAIChatOpen={isAIChatOpen}
          onToggleAIChat={() => {
            const opening = !isAIChatOpen;
            setIsAIChatOpen(opening);
            if (opening) { setIsCodePanelOpen(false); setActiveCodeFile(null); }
          }}
          onCloseAIChat={() => setIsAIChatOpen(false)}
          chatSession={chatSession}
          isAIChatLoading={isAIChatLoading}
          onSendChatMessage={sendChatMessage}
          onApplyCode={applyCodeFromMessage}
          onClearChat={clearChat}
          activeProvider={llmSettings.activeProvider}
          onScanCode={() => setIsScanResultsOpen(true)}
          syncStatus={syncStatus}
          onAnalyze={handleAnalyzeDiagram}
          onGenerateScaffold={handleGenerateScaffold}
          leftWidthPercent={leftWidthPercent}
          isDragging={isDragging}
          containerRef={containerRef}
          onMouseDown={handleMouseDown}
          codeGraph={codeGraph.activeGraph}
          codeGraphLens={codeGraph.activeLens}
          codeGraphFocusNodeId={codeGraph.focusNodeId}
          codeGraphSelectedNodeId={codeGraph.selectedNodeId}
          codeGraphSelectedNode={codeGraph.selectedNode}
          codeGraphBreadcrumbStack={codeGraph.breadcrumbStack}
          codeGraphIsSyncing={codeGraph.isSyncing}
          codeGraphIsAnalyzingDomain={codeGraph.isAnalyzingDomain}
          onCodeGraphSwitchLens={codeGraph.switchLens}
          onCodeGraphFocusNode={codeGraph.focusNode}
          onCodeGraphFocusUp={codeGraph.focusUp}
          onCodeGraphFocusRoot={codeGraph.focusRoot}
          onCodeGraphNavigateBreadcrumb={codeGraph.navigateBreadcrumb}
          onCodeGraphSync={handleCodeGraphIncrementalSync}
          onCodeGraphGetAnomalies={codeGraph.getGraphAnomalies}
          onCodeGraphDelete={() => codeGraph.activeGraphId && codeGraph.deleteGraph(codeGraph.activeGraphId)}
          onCodeGraphRename={codeGraphHandlers.handleRenameCodeGraph}
          onCodeGraphSelectNode={codeGraph.selectNode}
          onCodeGraphDeselectNode={codeGraph.deselectNode}
          onCodeGraphAnalyzeDomain={handleCodeGraphAnalyzeDomain}
          onCodeGraphOpenConfig={() => setIsCodeGraphConfigOpen(true)}
          onCodeGraphViewCode={handleCodeGraphViewCode}
          codeGraphContextualFlows={codeGraph.contextualFlows}
          codeGraphActiveFlow={codeGraph.activeFlow}
          codeGraphActiveFlowId={codeGraph.activeFlowId}
          onCodeGraphSelectFlow={codeGraph.selectFlow}
          onCodeGraphDeselectFlow={codeGraph.deselectFlow}
          onCodeGraphOpenFlowInEditor={handleOpenFlowInEditor}
          codeGraphIsGeneratingFlows={codeGraph.isGeneratingFlows}
          onCodeGraphRegenerateFlows={handleRegenerateFlows}
          codeGraphIsReparsing={isCreatingGraph}
          onCodeGraphReparse={handleReparseGraph}
          codeGraphSyncStatus={graphSyncStatuses[codeGraph.activeGraph?.id ?? ''] ?? 'unknown'}
          codeGraphIsCheckingSync={isCheckingSync}
          onCodeGraphCheckSync={handleCodeGraphCheckSync}
          codeGraphPendingProposalCount={pendingProposals.reduce((n, p) => n + p.diagramDiffs.length, 0)}
          onCodeGraphReviewProposals={() => setIsSyncDiffModalOpen(true)}
          progressLogEntries={progressLog.entries}
          isProgressLogActive={progressLog.isActive}
          isProgressLogExpanded={progressLog.isExpanded}
          onToggleProgressLog={progressLog.toggleExpanded}
          onDismissProgressLog={progressLog.dismiss}
          sourceGraph={activeDiagram?.sourceGraphId
            ? codeGraph.codeGraphs.find(g => g.id === activeDiagram.sourceGraphId) ?? null
            : null}
          onGoToSourceGraph={(graphId) => {
            codeGraph.selectGraph(graphId);
            setActiveGraphId(graphId);
          }}
          codeGraphHighlightedNodes={syncHighlights}
          codeGraphRemovedNodeNames={syncRemovedNames}
          onDismissSyncHighlights={() => {
            setSyncHighlights({});
            setSyncRemovedNames([]);
            try { localStorage.removeItem(SYNC_HIGHLIGHTS_KEY); localStorage.removeItem(SYNC_HIGHLIGHTS_KEY + '_removed'); } catch { /* quota */ }
          }}
        />
      </div>

      {/* Footer */}
      <AppFooter
        diagramCount={diagrams.length}
        saveStatus={saveStatus}
      />

      {/* Modals */}
      <ModalManager
        isGlobalAIOpen={isGlobalAIOpen}
        onCloseGlobalAI={() => setIsGlobalAIOpen(false)}
        globalChatMessages={globalChatMessages}
        isGlobalAILoading={isGlobalAILoading}
        onGlobalSend={handleGlobalSend}
        onClearGlobalMessages={() => setGlobalChatMessages([])}
        onApplyGlobalToDiagram={(code) => updateActiveDiagram({ code })}
        onCreateGlobalDiagram={handleCreateDiagramFromGlobal}
        onContinueAgent={handleContinueAgent}
        onCancelAgent={handleCancelAgent}
        hasActiveDiagram={!!activeDiagram}
        llmSettings={llmSettings}
        isNodeLinkManagerOpen={isNodeLinkManagerOpen}
        onCloseNodeLinkManager={() => setIsNodeLinkManagerOpen(false)}
        currentDiagram={activeDiagram}
        allDiagrams={diagrams}
        onAddLink={handleAddNodeLink}
        onRemoveLink={handleRemoveNodeLink}
        isRepoManagerOpen={isRepoManagerOpen}
        onCloseRepoManager={() => setIsRepoManagerOpen(false)}
        repos={workspaceRepos}
        onAddRepo={handleAddRepo}
        onAddGithubRepo={handleAddGithubRepo}
        hasConfiguredAI={hasConfiguredProvider}
        onRemoveRepo={handleRemoveRepo}
        onReopenRepo={handleReopenRepo}
        isCodeLinkManagerOpen={isCodeLinkManagerOpen}
        onCloseCodeLinkManager={() => setIsCodeLinkManagerOpen(false)}
        onAddCodeLink={handleAddCodeLink}
        onRemoveCodeLink={handleRemoveCodeLink}
        isAISettingsOpen={isAISettingsOpen}
        onCloseAISettings={() => setIsAISettingsOpen(false)}
        onUpdateProvider={updateProvider}
        onSetActiveProvider={setActiveProvider}
        storageInsecure={storageInsecure}
        graphSyncMode={graphSyncMode}
        onSetGraphSyncMode={handleSetGraphSyncMode}
        // TODO(DELETE): SCAN FEATURE — remove these 11 props
        isScanResultsOpen={isScanResultsOpen}
        onCloseScanResults={() => { setIsScanResultsOpen(false); clearScanResult(); }}
        scanResult={scanResult}
        isScanning={isScanning}
        scanError={scanError}
        onRunScan={runScan}
        onAddMissing={addMissingToDiagram}
        syncMode={syncMode}
        onSetSyncMode={setSyncMode}
        onApplySuggestion={applySuggestion}
        onApplyAllSuggestions={applyAllSuggestions}
        onUpdateScanConfig={handleUpdateScanConfig}
        isDiffViewOpen={isDiffViewOpen}
        onCloseDiffView={() => { setIsDiffViewOpen(false); setDiffViewData(null); }}
        diffViewOriginal={diffViewData?.original || ''}
        diffViewModified={diffViewData?.modified || ''}
        onApplyDiff={handleApplyDiff}
        isAnalysisPanelOpen={isAnalysisPanelOpen}
        onCloseAnalysisPanel={() => setIsAnalysisPanelOpen(false)}
        diagramAnalysis={diagramAnalysis}
        isCodebaseImportOpen={!!codebaseImportProgress}
        onCloseCodebaseImport={resetCodebaseImport}
        onStartCodebaseImport={startCodebaseImport}
        codebaseImportProgress={codebaseImportProgress}
        isCodebaseImporting={isCodebaseImporting}
        onResetCodebaseImport={resetCodebaseImport}
        onCreateGraph={handleCreateGraph}
        isCodeGraphConfigOpen={isCodeGraphConfigOpen}
        onCloseCodeGraphConfig={() => setIsCodeGraphConfigOpen(false)}
        codeGraphConfig={codeGraph.activeGraph ? codeGraphStorageService.loadCodeGraphConfig(codeGraph.activeGraph.id) : null}
        onSaveCodeGraphConfig={handleSaveCodeGraphConfig}
        codeGraphRepoId={codeGraph.activeGraph?.repoId || ''}
        codeGraphId={codeGraph.activeGraph?.id || ''}
      />

      {/* Flow export confirmation modal */}
      {pendingFlowExport && (
        <FlowExportModal
          graph={pendingFlowExport.graph}
          flowCount={Object.values(pendingFlowExport.graph.flows as Record<string, import('./types').GraphFlow>).filter(f => !!f.sequenceDiagram).length}
          onOverwrite={() => { doExportFlows(pendingFlowExport.graph, 'overwrite'); setPendingFlowExport(null); }}
          onCreateNew={() => { doExportFlows(pendingFlowExport.graph, 'new'); setPendingFlowExport(null); }}
          onClose={() => setPendingFlowExport(null)}
        />
      )}

      <TokenDashboardModal
        isOpen={isTokenDashboardOpen}
        onClose={() => setIsTokenDashboardOpen(false)}
        records={tokenRecords}
        onClear={clearUsage}
      />

      {/* Agent Mission Control — fixed panel at bottom during CodeGraph generation */}
      <AgentMissionPanel
        events={agentMission.events}
        isOpen={agentMission.isOpen}
        activeAgents={agentMission.activeAgents}
        progressEntries={progressLog.entries}
        blackboard={agentMission.blackboard}
        onClose={() => agentMission.setIsOpen(false)}
        onDownload={agentMission.downloadLog}
      />


      {/* Sync Diff Modal */}
      {isSyncDiffModalOpen && pendingProposals.length > 0 && (
        <SyncDiffModal
          proposals={pendingProposals}
          diagrams={diagrams}
          onApply={(proposalId, selectedIds) =>
            handleApplyProposal(proposalId, selectedIds, handleUpdateDiagramFromSync)
          }
          onDismiss={handleDismissProposal}
          onClose={() => setIsSyncDiffModalOpen(false)}
        />
      )}
    </div>
  );
}
