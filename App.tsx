import React from 'react';
import { Sidebar } from './components/Sidebar';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { WorkspaceView } from './components/WorkspaceView';
import { ModalManager } from './components/ModalManager';


// Custom Hooks
import { useAppState } from './hooks/useAppState';
import { useWorkspaceHandlers } from './hooks/useWorkspaceHandlers';
import { useDiagramHandlers } from './hooks/useDiagramHandlers';
import { useFolderHandlers } from './hooks/useFolderHandlers';
import { useNavigationHandlers } from './hooks/useNavigationHandlers';
import { useCommentHandlers } from './hooks/useCommentHandlers';
import { useNodeLinkHandlers } from './hooks/useNodeLinkHandlers';
import { useSplitPane } from './hooks/useSplitPane';
import { useStoragePersistence } from './hooks/useStoragePersistence';

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
    error,
    setError,
    isAIModalOpen,
    setIsAIModalOpen,
    isNodeLinkManagerOpen,
    setIsNodeLinkManagerOpen,
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
    workspaceDiagrams,
    workspaceFolders,
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

  const { handleCreateFolder, handleDeleteFolder, handleRenameFolder } = 
    useFolderHandlers(folders, setFolders, diagrams, setDiagrams, activeWorkspaceId);

  const { handleZoomIn, handleZoomOut, handleGoToRoot, handleBreadcrumbNavigate } = 
    useNavigationHandlers(activeId, setActiveId, navigationStack, setNavigationStack);

  const { handleAddComment, handleDeleteComment } = 
    useCommentHandlers(activeDiagram, updateActiveDiagram);

  const { handleAddNodeLink, handleRemoveNodeLink } = 
    useNodeLinkHandlers(activeDiagram, updateActiveDiagram);

  const { leftWidthPercent, isDragging, containerRef, handleMouseDown } = useSplitPane();

  // --- Persistence ---
  useStoragePersistence(
    diagrams,
    folders,
    workspaces,
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

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-gray-200">
      
      {/* Header */}
      <AppHeader 
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'block' : 'hidden'} lg:block h-full`}>
          <Sidebar 
            diagrams={workspaceDiagrams}
            folders={workspaceFolders}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            activeId={activeId}
            onSelect={setActiveId}
            onCreate={handleCreateDiagram}
            onDelete={handleDeleteDiagram}
            onImport={handleImportDiagrams}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onMoveDiagram={handleMoveDiagram}
            onSwitchWorkspace={setActiveWorkspaceId}
            onCreateWorkspace={handleCreateWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onRenameWorkspace={handleRenameWorkspace}
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
        isNodeLinkManagerOpen={isNodeLinkManagerOpen}
        onCloseNodeLinkManager={() => setIsNodeLinkManagerOpen(false)}
        currentDiagram={activeDiagram}
        allDiagrams={diagrams}
        onAddLink={handleAddNodeLink}
        onRemoveLink={handleRemoveNodeLink}
      />
    </div>
  );
}
