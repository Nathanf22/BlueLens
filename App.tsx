import React, { useState, useCallback } from 'react';
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
import { useScanHandlers } from './hooks/useScanHandlers';
import { useCodebaseImport } from './hooks/useCodebaseImport';

export default function App() {
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
    useRepoHandlers(repos, setRepos, activeWorkspaceId);

  const { handleAddCodeLink, handleRemoveCodeLink } =
    useCodeLinkHandlers(activeDiagram, updateActiveDiagram);

  const { leftWidthPercent, isDragging, containerRef, handleMouseDown } = useSplitPane();

  // --- LLM / AI ---
  const { llmSettings, updateProvider, setActiveProvider, hasConfiguredProvider } = useLLMSettings();

  const { chatSession, isAIChatLoading, sendChatMessage, applyCodeFromMessage, clearChat } =
    useChatHandlers(activeDiagram, updateActiveDiagram, llmSettings);

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

  // --- Scan Config Update ---
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

    const handle = fileSystemService.getHandle(codeLink.repoId);
    if (!handle) {
      alert('Repository is disconnected. Please reopen it from the Repo Manager.');
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
      alert('Failed to read file. The repository may need to be reopened.');
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

      {/* Header */}
      <AppHeader
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        onOpenAISettings={() => setIsAISettingsOpen(true)}
        isSidebarOpen={isSidebarOpen}
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
        onOpenCodebaseImport={() => setIsCodebaseImportOpen(true)}
      />
    </div>
  );
}
