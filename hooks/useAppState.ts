import { useState, useEffect, useRef } from 'react';
import { Diagram, Folder, Workspace, RepoConfig } from '../types';
import { storageService } from '../services/storageService';

export const useAppState = () => {
  // --- State: Workspaces ---
  const [initialData] = useState(() => storageService.getInitialState());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialData.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialData.activeWorkspaceId);

  // --- State: Diagrams & Folders (Global) ---
  const [diagrams, setDiagrams] = useState<Diagram[]>(() => storageService.loadAllDiagrams());
  const [folders, setFolders] = useState<Folder[]>(() => storageService.loadAllFolders());

  const [activeId, setActiveId] = useState<string>(() => 
    storageService.loadActiveId(diagrams.filter(d => d.workspaceId === activeWorkspaceId))
  );

  // --- State: Repos ---
  const [repos, setRepos] = useState<RepoConfig[]>(() => storageService.loadAllRepos());

  // --- State: UI ---
  const [error, setError] = useState<string | null>(null);
  const [isGlobalAIOpen, setIsGlobalAIOpen] = useState(false);
  const [isNodeLinkManagerOpen, setIsNodeLinkManagerOpen] = useState(false);
  const [isRepoManagerOpen, setIsRepoManagerOpen] = useState(false);
  const [isCodeLinkManagerOpen, setIsCodeLinkManagerOpen] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isScanResultsOpen, setIsScanResultsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  
  // --- State: Multi-Level Navigation ---
  const [navigationStack, setNavigationStack] = useState<{ diagramId: string; nodeId?: string; nodeName?: string }[]>([]);

  // --- State: Code Panel ---
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [activeCodeFile, setActiveCodeFile] = useState<import('../types').CodeFile | null>(null);

  // --- State: Diff View & Analysis ---
  const [isDiffViewOpen, setIsDiffViewOpen] = useState(false);
  const [isAnalysisPanelOpen, setIsAnalysisPanelOpen] = useState(false);
  const [diffViewData, setDiffViewData] = useState<{ original: string; modified: string } | null>(null);

  // --- State: Codebase Import ---
  const [isCodebaseImportOpen, setIsCodebaseImportOpen] = useState(false);

  // --- State: CodeGraph ---
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [isCodeGraphConfigOpen, setIsCodeGraphConfigOpen] = useState(false);

  // Derived state
  const workspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
  const workspaceFolders = folders.filter(f => f.workspaceId === activeWorkspaceId);
  const workspaceRepos = repos.filter(r => r.workspaceId === activeWorkspaceId);
  const activeDiagram = diagrams.find(d => d.id === activeId) || workspaceDiagrams[0];

  // Build breadcrumb path from navigation stack
  const breadcrumbPath = navigationStack.map(step => {
    const diagram = diagrams.find(d => d.id === step.diagramId);
    return { 
      id: step.diagramId, 
      name: step.nodeId && step.nodeName 
        ? `${diagram?.name || 'Unknown'} [${step.nodeName}]`
        : diagram?.name || 'Unknown'
    };
  });

  // Ensure activeId is valid when switching workspaces
  useEffect(() => {
    const currentWorkspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
    if (!currentWorkspaceDiagrams.find(d => d.id === activeId) && currentWorkspaceDiagrams.length > 0) {
      setActiveId(currentWorkspaceDiagrams[0].id);
    }
  }, [activeWorkspaceId, diagrams, activeId]);

  // Reset navigation stack when switching workspaces
  useEffect(() => {
    setNavigationStack([]);
  }, [activeWorkspaceId]);

  return {
    // Workspaces
    workspaces,
    setWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    
    // Diagrams & Folders
    diagrams,
    setDiagrams,
    folders,
    setFolders,
    activeId,
    setActiveId,

    // Repos
    repos,
    setRepos,
    
    // UI State
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
    
    // Navigation
    navigationStack,
    setNavigationStack,
    
    // Code Panel
    isCodePanelOpen,
    setIsCodePanelOpen,
    activeCodeFile,
    setActiveCodeFile,

    // Diff View & Analysis
    isDiffViewOpen,
    setIsDiffViewOpen,
    isAnalysisPanelOpen,
    setIsAnalysisPanelOpen,
    diffViewData,
    setDiffViewData,

    // Codebase Import
    isCodebaseImportOpen,
    setIsCodebaseImportOpen,

    // CodeGraph
    activeGraphId,
    setActiveGraphId,
    isCodeGraphConfigOpen,
    setIsCodeGraphConfigOpen,

    // Derived state
    workspaceDiagrams,
    workspaceFolders,
    workspaceRepos,
    activeDiagram,
    breadcrumbPath
  };
};
