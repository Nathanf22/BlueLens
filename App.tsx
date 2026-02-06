import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, GripVertical, Menu, Layout, Save } from 'lucide-react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { AIGeneratorModal } from './components/AIGeneratorModal';
import { NodeLinkManager } from './components/NodeLinkManager';
import { Button } from './components/Button';
import { Diagram, Comment, Folder, Workspace } from './types';
import { storageService } from './services/storageService';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function App() {
  // --- State: Workspaces ---
  const [initialData] = useState(() => storageService.getInitialState());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialData.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialData.activeWorkspaceId);

  // --- State: Diagrams & Folders (Global) ---
  const [diagrams, setDiagrams] = useState<Diagram[]>(() => storageService.loadAllDiagrams());
  const [folders, setFolders] = useState<Folder[]>(() => storageService.loadAllFolders());

  const [activeId, setActiveId] = useState<string>(() => storageService.loadActiveId(diagrams.filter(d => d.workspaceId === activeWorkspaceId)));

  // --- State: UI ---
  const [error, setError] = useState<string | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isNodeLinkManagerOpen, setIsNodeLinkManagerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  
  // --- State: Multi-Level Navigation ---
  const [navigationStack, setNavigationStack] = useState<{ diagramId: string; nodeId?: string; nodeName?: string }[]>([]);
  
  // Split pane state
  const [leftWidthPercent, setLeftWidthPercent] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived state
  const workspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
  const workspaceFolders = folders.filter(f => f.workspaceId === activeWorkspaceId);
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

  // --- Effects ---
  
  // Persist everything to localStorage
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      storageService.saveDiagrams(diagrams);
      storageService.saveFolders(folders);
      storageService.saveWorkspaces(workspaces);
      storageService.saveActiveWorkspaceId(activeWorkspaceId);
      setSaveStatus('saved');
    }, 500);

    return () => clearTimeout(timer);
  }, [diagrams, folders, workspaces, activeWorkspaceId]);

  // Persist active ID
  useEffect(() => {
    storageService.saveActiveId(activeId);
  }, [activeId]);

  // Ensure activeId is valid when switching workspaces
  useEffect(() => {
    const currentWorkspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
    if (!currentWorkspaceDiagrams.find(d => d.id === activeId) && currentWorkspaceDiagrams.length > 0) {
      setActiveId(currentWorkspaceDiagrams[0].id);
    }
  }, [activeWorkspaceId, diagrams]);

  // Reset navigation stack when switching workspaces or active diagram changes externally
  useEffect(() => {
    setNavigationStack([]);
  }, [activeWorkspaceId]);


  // --- Handlers: Workspace Management ---

  const handleCreateWorkspace = (name: string) => {
    const newWorkspace: Workspace = {
      id: generateId(),
      name,
      createdAt: Date.now()
    };
    setWorkspaces([...workspaces, newWorkspace]);
    setActiveWorkspaceId(newWorkspace.id);
  };

  const handleDeleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) {
      alert("Cannot delete the last workspace.");
      return;
    }
    if (window.confirm("Delete this workspace and all its diagrams/folders?")) {
      setDiagrams(prev => prev.filter(d => d.workspaceId !== id));
      setFolders(prev => prev.filter(f => f.workspaceId !== id));
      setWorkspaces(prev => prev.filter(w => w.id !== id));
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(workspaces.find(w => w.id !== id)!.id);
      }
    }
  };

  const handleRenameWorkspace = (id: string, name: string) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  };

  // --- Handlers: Diagram Management ---

  const handleCreateDiagram = (folderId: string | null = null) => {
    const newDiagram: Diagram = {
      id: generateId(),
      name: `Untitled ${workspaceDiagrams.length + 1}`,
      code: `graph TD\n    A[Start] --> B[New Diagram]`,
      comments: [],
      lastModified: Date.now(),
      folderId: folderId,
      workspaceId: activeWorkspaceId,
      nodeLinks: []
    };
    setDiagrams([...diagrams, newDiagram]);
    setActiveId(newDiagram.id);
  };

  const handleImportDiagrams = (importedDiagrams: Diagram[]) => {
    const itemsWithWorkspace = importedDiagrams.map(d => ({ ...d, workspaceId: activeWorkspaceId }));
    setDiagrams(prev => [...prev, ...itemsWithWorkspace]);
    if (itemsWithWorkspace.length > 0) {
      setActiveId(itemsWithWorkspace[0].id);
    }
  };

  const handleDeleteDiagram = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaceDiagrams.length <= 1) return;

    if (window.confirm('Are you sure you want to delete this diagram?')) {
      setDiagrams(diagrams.filter(d => d.id !== id));
      
      if (id === activeId) {
        const remaining = diagrams.filter(d => d.workspaceId === activeWorkspaceId && d.id !== id);
        if (remaining.length > 0) setActiveId(remaining[0].id);
      }
      
      // Clear navigation stack if deleted diagram was in it
      setNavigationStack(prev => prev.filter(step => step.diagramId !== id));
    }
  };

  const updateActiveDiagram = (updates: Partial<Diagram>) => {
    setDiagrams(prev => prev.map(d => 
      d.id === activeId ? { ...d, ...updates, lastModified: Date.now() } : d
    ));
    // Clear error when modifying code
    if (updates.code && error) setError(null);
  };

  // --- Handlers: Folder Management ---

  const handleCreateFolder = (name: string, parentId: string | null = null) => {
    const newFolder: Folder = {
      id: generateId(),
      name,
      parentId,
      workspaceId: activeWorkspaceId
    };
    setFolders([...folders, newFolder]);
  };

  const handleDeleteFolder = (folderId: string) => {
    if (window.confirm('Delete this folder? Diagrams inside will be moved to root.')) {
      setDiagrams(prev => prev.map(d => 
        (d.folderId === folderId && d.workspaceId === activeWorkspaceId) ? { ...d, folderId: null } : d
      ));
      setFolders(prev => prev
        .filter(f => f.id !== folderId)
        .map(f => (f.parentId === folderId && f.workspaceId === activeWorkspaceId) ? { ...f, parentId: null } : f)
      );
    }
  };

  const handleRenameFolder = (folderId: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name } : f));
  };

  const handleMoveDiagram = (diagramId: string, folderId: string | null) => {
    setDiagrams(prev => prev.map(d => d.id === diagramId ? { ...d, folderId } : d));
  };

  // --- Handlers: Multi-Level Navigation ---

  const handleZoomIn = (targetDiagramId: string, sourceNodeId?: string, sourceNodeName?: string) => {
    setNavigationStack([
      ...navigationStack, 
      {
        diagramId: activeId,
        nodeId: sourceNodeId,
        nodeName: sourceNodeName
      }
    ]);
    setActiveId(targetDiagramId);
  };

  const handleZoomOut = () => {
    if (navigationStack.length > 0) {
      const previousStep = navigationStack[navigationStack.length - 1];
      setNavigationStack(navigationStack.slice(0, -1));
      setActiveId(previousStep.diagramId);
    }
  };

  const handleGoToRoot = () => {
    if (navigationStack.length > 0) {
      setActiveId(navigationStack[0].diagramId);
      setNavigationStack([]);
    }
  };

  const handleBreadcrumbNavigate = (index: number) => {
    if (index === 0 && navigationStack.length > 0) {
      setActiveId(navigationStack[0].diagramId);
      setNavigationStack([]);
    } else if (index < navigationStack.length) {
      const targetStep = navigationStack[index];
      setActiveId(targetStep.diagramId);
      setNavigationStack(navigationStack.slice(0, index));
    }
  };


  // --- Handlers: Comments ---

  const handleAddComment = (commentData: { x: number; y: number; content: string }) => {
    const newComment: Comment = {
      id: generateId(),
      ...commentData,
      createdAt: Date.now()
    };
    
    const currentComments = activeDiagram.comments || [];
    updateActiveDiagram({ 
      comments: [...currentComments, newComment] 
    });
  };

  const handleDeleteComment = (commentId: string) => {
    const currentComments = activeDiagram.comments || [];
    updateActiveDiagram({ 
      comments: currentComments.filter(c => c.id !== commentId) 
    });
  };

  // --- Handlers: Node Links ---

  const handleAddNodeLink = (nodeId: string, targetDiagramId: string, label?: string) => {
    const currentLinks = activeDiagram.nodeLinks || [];
    
    // Remove existing link for this node if any
    const filteredLinks = currentLinks.filter(link => link.nodeId !== nodeId);
    
    // Add new link
    updateActiveDiagram({
      nodeLinks: [...filteredLinks, { nodeId, targetDiagramId, label }]
    });
  };

  const handleRemoveNodeLink = (nodeId: string) => {
    const currentLinks = activeDiagram.nodeLinks || [];
    updateActiveDiagram({
      nodeLinks: currentLinks.filter(link => link.nodeId !== nodeId)
    });
  };

  // --- Handlers: Split Pane ---

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftWidthPercent(Math.max(20, Math.min(80, newLeftWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-gray-200">
      
      {/* Navbar */}
      <header className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-gray-700 shadow-md z-20 shrink-0 h-14">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Layout className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400 hidden sm:block">
            Blueprint
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={() => setIsAIModalOpen(true)}
            icon={<Sparkles className="w-4 h-4" />}
            className="bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 border-none h-9"
          >
            Ask AI
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar (Responsive) */}
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

        {/* Workspace - Split View */}
        <main 
          ref={containerRef}
          className="flex-1 overflow-hidden flex flex-col lg:flex-row relative bg-[#0d0d0d]"
        >
          {activeDiagram ? (
            <>
              {/* Editor Pane */}
              <div 
                className={`min-w-0 h-1/2 lg:h-full ${isEditorCollapsed ? '' : 'flex-1 lg:flex-none'}`}
                style={isEditorCollapsed ? {} : { width: `${leftWidthPercent}%` }}
              >
                <Editor 
                  code={activeDiagram.code} 
                  name={activeDiagram.name}
                  onCodeChange={(code) => updateActiveDiagram({ code })}
                  onNameChange={(name) => updateActiveDiagram({ name })}
                  error={error}
                  isCollapsed={isEditorCollapsed}
                  onToggleCollapse={() => setIsEditorCollapsed(!isEditorCollapsed)}
                />
              </div>

              {/* Resizer Handle */}
              {!isEditorCollapsed && (
              <div
                className="hidden lg:flex w-2 bg-dark-900 border-l border-r border-gray-800 hover:bg-brand-600 cursor-col-resize items-center justify-center transition-colors z-10"
                onMouseDown={handleMouseDown}
              >
                <GripVertical className="w-3 h-3 text-gray-600 pointer-events-none" />
              </div>
              )}

              {/* Preview Pane */}
              <div className="flex-1 min-w-0 h-1/2 lg:h-full p-4 bg-[#0d0d0d]">
                <Preview 
                  code={activeDiagram.code}
                  comments={activeDiagram.comments || []}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                  onError={setError}
                  onSuccess={() => setError(null)}
                  currentDiagram={activeDiagram}
                  breadcrumbPath={breadcrumbPath}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onGoToRoot={handleGoToRoot}
                  onBreadcrumbNavigate={handleBreadcrumbNavigate}
                  onManageLinks={() => setIsNodeLinkManagerOpen(true)}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select or create a diagram
            </div>
          )}
          
          {/* Overlay while dragging */}
          {isDragging && (
            <div className="absolute inset-0 z-50 cursor-col-resize" />
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-dark-900 border-t border-gray-800 px-4 py-1 text-xs text-gray-600 flex justify-between items-center shrink-0">
        <span>{diagrams.length} Diagram{diagrams.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 transition-colors ${saveStatus === 'saving' ? 'text-brand-400' : 'text-green-500'}`}>
            <Save className="w-3 h-3" />
            {saveStatus === 'saving' ? 'Saving to browser...' : 'Saved to browser'}
          </span>
          <span className="opacity-50">|</span>
          <span>Mermaid.js v11 • Gemini 2.0 Flash</span>
        </div>
      </footer>

      {/* Modals */}
      <AIGeneratorModal 
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onGenerate={(newCode) => {
          updateActiveDiagram({ code: newCode });
          setIsAIModalOpen(false);
        }}
      />

      {/* Node Link Manager Modal */}
      {isNodeLinkManagerOpen && activeDiagram && (
        <NodeLinkManager
          currentDiagram={activeDiagram}
          allDiagrams={diagrams}
          onAddLink={handleAddNodeLink}
          onRemoveLink={handleRemoveNodeLink}
          onClose={() => setIsNodeLinkManagerOpen(false)}
        />
      )}
    </div>
  );
}
