import React, { useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { WorkspaceView } from './components/WorkspaceView';
import { ModalManager } from './components/ModalManager';
import { BlueprintImportResult } from './services/exportService';
import { fileSystemService } from './services/fileSystemService';
import { diagramAnalyzerService } from './services/diagramAnalyzerService';
import { scaffoldService } from './services/scaffoldService';
import { CodeFile, DiagramAnalysis, ScanConfig } from './types';

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
import { useLLMSettings } from './hooks/useLLMSettings';
import { useChatHandlers } from './hooks/useChatHandlers';
import { useScanHandlers } from './hooks/useScanHandlers'; // TODO(DELETE): SCAN FEATURE
import { useCodebaseImport } from './hooks/useCodebaseImport';
import { useCodeGraph } from './hooks/useCodeGraph';
import { useCodeGraphHandlers } from './hooks/useCodeGraphHandlers';
import { useProgressLog } from './hooks/useProgressLog';
import { useToast } from './hooks/useToast';
import { ToastContainer } from './components/ToastContainer';
import { codeGraphStorageService } from './services/codeGraphStorageService';
import {
  buildExportPlan,
  detectExistingExport,
  materializePlan,
} from './services/codeGraphExportService';
import { FlowExportModal } from './components/FlowExportModal';
import { CodeGraph } from './types';

export default function App() {
  // --- Toast Notifications ---
  const { toasts, showToast, dismissToast } = useToast();

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
    isAIModalOpen,
    setIsAIModalOpen,
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

  const { handleAddRepo, handleRemoveRepo, handleReopenRepo } =
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
  const { progress: codebaseImportProgress, isImporting: isCodebaseImporting, startImport: startCodebaseImport, resetProgress: resetCodebaseImport } =
    useCodebaseImport({
      diagrams,
      setDiagrams,
      repos: workspaceRepos,
      activeWorkspaceId,
      createFolderProgrammatic,
      setActiveId,
    });

  // --- Progress Log ---
  const progressLog = useProgressLog();

  // --- CodeGraph ---
  const codeGraph = useCodeGraph(activeWorkspaceId);
  const codeGraphHandlers = useCodeGraphHandlers(codeGraph.activeGraph, codeGraph.updateGraph);

  // --- Flow export state ---
  const [pendingFlowExport, setPendingFlowExport] = useState<{ graph: CodeGraph } | null>(null);
  const [isCreatingGraph, setIsCreatingGraph] = useState(false);
  const graphCreationCancelledRef = useRef(false);

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

  const handleCreateGraph = useCallback(async (repoId: string) => {
    graphCreationCancelledRef.current = false;
    setIsCreatingGraph(true);
    progressLog.startLog();
    try {
      const result = await codeGraph.createGraph(repoId, llmSettings, progressLog.addEntry);
      if (result) triggerFlowExport(result);
      else if (graphCreationCancelledRef.current) showToast('Graph creation cancelled', 'info');
      return result;
    } finally {
      progressLog.endLog();
      setIsCreatingGraph(false);
    }
  }, [codeGraph.createGraph, llmSettings, progressLog.startLog, progressLog.addEntry, progressLog.endLog, triggerFlowExport, showToast]);

  const handleCancelCreateGraph = useCallback(() => {
    graphCreationCancelledRef.current = true;
    codeGraph.cancelCreateGraph();
  }, [codeGraph.cancelCreateGraph]);

  const handleRegenerateFlows = useCallback(
    async (options?: { scopeNodeId?: string; customPrompt?: string }) => {
      await codeGraph.regenerateFlows(llmSettings, options);
      // Export only flows at the scope that was regenerated
      if (codeGraph.activeGraph) triggerFlowExport(codeGraph.activeGraph, options?.scopeNodeId);
    },
    [codeGraph.regenerateFlows, codeGraph.activeGraph, llmSettings, triggerFlowExport]
  );

  const handleSaveCodeGraphConfig = useCallback((config: import('./types').CodeGraphConfig) => {
    codeGraphStorageService.saveCodeGraphConfig(config);
  }, []);

  const handleCodeGraphViewCode = useCallback(async (nodeId: string) => {
    if (!codeGraph.activeGraph) return;
    const node = codeGraph.activeGraph.nodes[nodeId];
    if (!node?.sourceRef) return;

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

  const handleAIGenerate = (newCode: string) => {
    updateActiveDiagram({ code: newCode });
    setIsAIModalOpen(false);
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
        onOpenAIModal={() => setIsAIModalOpen(true)}
        onOpenAISettings={() => setIsAISettingsOpen(true)}
        onOpenRepoManager={() => setIsRepoManagerOpen(true)}
        isSidebarOpen={isSidebarOpen}
        repoCount={workspaceRepos.length}
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
            onSelect={setActiveId}
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
            repos={workspaceRepos}
            codeGraphs={codeGraph.codeGraphs}
            activeGraphId={codeGraph.activeGraphId}
            onSelectGraph={codeGraph.selectGraph}
            onCreateGraph={handleCreateGraph}
            onDeleteGraph={codeGraph.deleteGraph}
            onLoadDemoGraph={codeGraph.loadDemoGraph}
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
          onCodeGraphSync={codeGraph.syncGraph}
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
          codeGraphIsGeneratingFlows={codeGraph.isGeneratingFlows}
          onCodeGraphRegenerateFlows={handleRegenerateFlows}
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
        />
      </div>

      {/* Footer */}
      <AppFooter
        diagramCount={diagrams.length}
        saveStatus={saveStatus}
      />

      {/* Modals */}
      <ModalManager
        isAIModalOpen={isAIModalOpen}
        onCloseAIModal={() => setIsAIModalOpen(false)}
        onGenerate={handleAIGenerate}
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
        isCodebaseImportOpen={isCodebaseImportOpen}
        onCloseCodebaseImport={() => setIsCodebaseImportOpen(false)}
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
    </div>
  );
}
