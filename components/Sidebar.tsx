import React, { useState, useRef } from 'react';
import {
  Plus, Trash2, FileText, Layout, Download, Loader2, Upload,
  Folder as FolderIcon, FolderPlus, ChevronDown, ChevronRight, MoreVertical,
  Edit2, Settings, Link2, Unlink, Layers, ChevronLeft, X, Globe, FileDown, FolderOpen,
  GitBranch
} from 'lucide-react';
import { Diagram, Folder, Workspace, CodeGraph, RepoConfig } from '../types';
import { ToastType } from '../hooks/useToast';
import { ConfirmModal } from './ConfirmModal';
import { InputModal } from './InputModal';
import { BlueprintImportResult, exportDiagram, exportWorkspace, exportAll, importBlueprint, downloadJson } from '../services/exportService';
import { fileSystemService } from '../services/fileSystemService';
import JSZip from 'jszip';

interface SidebarProps {
  diagrams: Diagram[];
  folders: Folder[];
  allDiagrams: Diagram[];
  allFolders: Folder[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (folderId?: string | null) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onImport: (diagrams: Diagram[]) => void;
  onImportBlueprint: (data: BlueprintImportResult) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onMoveDiagram: (diagramId: string, folderId: string | null) => void;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onOpenRepoManager: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  // CodeGraph
  repos?: RepoConfig[];
  codeGraphs?: CodeGraph[];
  activeGraphId?: string | null;
  onSelectGraph?: (graphId: string | null) => void;
  onCreateGraph?: (repoId: string) => Promise<CodeGraph | null>;
  onDeleteGraph?: (graphId: string) => void;
  onLoadDemoGraph?: () => void;
  isCreatingGraph?: boolean;
  onCancelCreateGraph?: () => void;
  graphCreationProgress?: { step: string; current: number; total: number } | null;
  showToast?: (message: string, type?: ToastType) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const Sidebar: React.FC<SidebarProps> = ({ 
  diagrams,
  folders,
  allDiagrams,
  allFolders,
  workspaces,
  activeWorkspaceId,
  activeId, 
  onSelect, 
  onCreate, 
  onDelete,
  onImport,
  onImportBlueprint,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onMoveDiagram,
  onSwitchWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  onRenameWorkspace,
  onOpenRepoManager,
  isCollapsed,
  onToggleCollapse,
  repos = [],
  codeGraphs = [],
  activeGraphId,
  onSelectGraph,
  onCreateGraph,
  onDeleteGraph,
  onLoadDemoGraph,
  isCreatingGraph: isCreatingGraphProp = false,
  onCancelCreateGraph,
  graphCreationProgress,
  showToast,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  type ConfirmDialog = { message: string; confirmLabel?: string; onConfirm: () => void } | null;
  type InputDialog = {
    title: string; placeholder?: string; defaultValue?: string;
    options?: { value: string; label: string }[]; confirmLabel?: string;
    onSubmit: (value: string) => void;
  } | null;
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [inputDialog, setInputDialog] = useState<InputDialog>(null);
  const isCreatingGraph = isCreatingGraphProp;
  const [isRepoPickerOpen, setIsRepoPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectedRepos = repos.filter(r => fileSystemService.hasHandle(r.id));

  const handleCreateGraph = async (repoId: string) => {
    if (!onCreateGraph || isCreatingGraph) return;
    setIsRepoPickerOpen(false);
    await onCreateGraph(repoId);
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const handleDownloadDiagram = (diagram: Diagram) => {
    const json = exportDiagram(diagram, activeWorkspace);
    const safeName = diagram.name.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '-') || 'diagram';
    downloadJson(json, `${safeName}.bluelens`);
    setIsDownloadModalOpen(false);
  };

  const handleDownloadWorkspace = () => {
    const json = exportWorkspace(activeWorkspace, diagrams, folders);
    const safeName = activeWorkspace.name.toLowerCase().replace(/\s+/g, '-');
    downloadJson(json, `${safeName}.bluelens`);
    setIsDownloadModalOpen(false);
  };

  const handleDownloadAllWorkspaces = () => {
    const json = exportAll(workspaces, allDiagrams, allFolders);
    downloadJson(json, `blueprint-backup-${new Date().toISOString().split('T')[0]}.bluelens`);
    setIsDownloadModalOpen(false);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newDiagrams: Diagram[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.bluelens')) {
          const text = await file.text();
          try {
            const result = importBlueprint(text);
            onImportBlueprint(result);
          } catch (e) {
            console.error("Error importing blueprint", e);
            showToast?.(`Could not import blueprint file: ${file.name}`, 'error');
          }
          continue;
        }
        if (file.name.endsWith('.zip')) {
          try {
            const zip = await JSZip.loadAsync(file);
            const promises: Promise<void>[] = [];
            zip.forEach((relativePath, zipEntry) => {
              if (!zipEntry.dir && (zipEntry.name.endsWith('.mmd') || zipEntry.name.endsWith('.txt') || zipEntry.name.endsWith('.mermaid'))) {
                const promise = zipEntry.async('string').then((content) => {
                  const fileName = zipEntry.name.split('/').pop() || zipEntry.name;
                  const name = fileName.replace(/\.(mmd|txt|mermaid)$/, '');
                  newDiagrams.push({
                    id: generateId(),
                    name: name,
                    code: content,
                    comments: [],
                    lastModified: Date.now(),
                    folderId: null,
                    workspaceId: activeWorkspaceId,
                    nodeLinks: []
                  });
                });
                promises.push(promise);
              }
            });
            await Promise.all(promises);
          } catch (e) {
            console.error("Error unzipping", e);
            showToast?.(`Could not read zip file: ${file.name}`, 'error');
          }
        } else {
          const text = await file.text();
          newDiagrams.push({
            id: generateId(),
            name: file.name.replace(/\.(mmd|txt|mermaid)$/, ''),
            code: text,
            comments: [],
            lastModified: Date.now(),
            folderId: null,
            workspaceId: activeWorkspaceId,
            nodeLinks: []
          });
        }
      }
      if (newDiagrams.length > 0) onImport(newDiagrams);
    } catch (error) {
      console.error("Import error", error);
      showToast?.('Failed to import files.', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderDiagram = (diagram: Diagram, depth: number = 0) => (
    <div
      key={diagram.id}
      onClick={() => onSelect(diagram.id)}
      className={`
        group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors
        ${activeId === diagram.id 
          ? 'bg-brand-900/30 text-brand-400' 
          : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'}
      `}
      style={{ paddingLeft: `${(depth + 1) * 12}px` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 self-start" />
        <div className="min-w-0">
          <span className="truncate text-sm block">{diagram.name}</span>
          {diagram.description && (
            <span className="truncate text-xs text-gray-600 block leading-tight">{diagram.description}</span>
          )}
        </div>
        {diagram.nodeLinks && diagram.nodeLinks.length > 0 && (
          <span 
            className="text-[10px] bg-brand-600 text-white px-1.5 py-0.5 rounded-full font-medium" 
            title={`${diagram.nodeLinks.length} node link${diagram.nodeLinks.length > 1 ? 's' : ''}`}
          >
            {diagram.nodeLinks.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownloadDiagram(diagram);
          }}
          className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Download diagram"
        >
          <Download className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setInputDialog({
              title: 'Move to folder',
              confirmLabel: 'Move',
              options: folders
                .filter(f => f.workspaceId === activeWorkspaceId)
                .map(f => ({ value: f.id, label: f.name })),
              onSubmit: (folderId) => onMoveDiagram(diagram.id, folderId || null),
            });
          }}
          className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Move to folder..."
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={diagrams.length <= 1 && workspaces.length === 1}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDialog({
              message: `Delete "${diagram.name}"? This cannot be undone.`,
              confirmLabel: 'Delete',
              onConfirm: () => onDelete(diagram.id, e),
            });
          }}
          className={`p-1 rounded transition-colors hover:bg-red-900/50 hover:text-red-400 text-gray-500`}
          title="Delete diagram"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  const renderFolder = (folder: Folder, depth: number = 0) => {
    const isExpanded = expandedFolders[folder.id];
    const subfolders = folders.filter(f => f.parentId === folder.id);
    const folderDiagrams = diagrams.filter(d => d.folderId === folder.id);
    return (
      <div key={folder.id} className="space-y-0.5">
        <div
          onClick={() => toggleFolder(folder.id)}
          className="group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer text-gray-400 hover:bg-dark-800 hover:text-gray-200"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <FolderIcon className="w-3.5 h-3.5 text-brand-500/70" />
            <span className="truncate text-sm font-medium">{folder.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onCreate(folder.id); }}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
              title="New diagram"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setInputDialog({
                  title: 'New subfolder',
                  placeholder: 'Subfolder name',
                  onSubmit: (name) => onCreateFolder(name, folder.id),
                });
              }}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
              title="New subfolder"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setInputDialog({
                  title: 'Rename folder',
                  placeholder: 'Folder name',
                  defaultValue: folder.name,
                  confirmLabel: 'Rename',
                  onSubmit: (name) => onRenameFolder(folder.id, name),
                });
              }}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
              title="Rename folder"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDialog({
                  message: `Delete folder "${folder.name}"? Diagrams inside will be moved to root.`,
                  confirmLabel: 'Delete',
                  onConfirm: () => onDeleteFolder(folder.id),
                });
              }}
              className="p-1 rounded hover:bg-red-900/50 hover:text-red-400 text-gray-500"
              title="Delete folder"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="space-y-0.5">
            {subfolders.map(sf => renderFolder(sf, depth + 1))}
            {folderDiagrams.map(d => renderDiagram(d, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = folders.filter(f => !f.parentId);
  const rootDiagrams = diagrams.filter(d => !d.folderId);

  return (
    <div className={`relative bg-dark-900 flex flex-col border-r border-gray-800 h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple
        accept=".mmd,.txt,.mermaid,.zip,.bluelens"
      />

      {/* Collapse Toggle Button */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-b border-gray-800 flex justify-end">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-brand-400 bg-dark-800 hover:bg-dark-700 border border-gray-700 hover:border-brand-500/50 rounded transition-all"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Collapse</span>
          </button>
        </div>
      )}

      {isCollapsed ? (
        // Collapsed view - just icons
        <div className="flex flex-col items-center py-4 gap-4">
          <button
            onClick={onToggleCollapse}
            className="p-2 text-gray-500 hover:text-brand-400 transition-colors rounded hover:bg-dark-800"
            title="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center border border-brand-500/30">
            <Layout className="w-4 h-4 text-brand-400" />
          </div>
          <button 
            onClick={() => onCreate(null)}
            className="p-2 text-gray-500 hover:text-brand-400 transition-colors rounded hover:bg-dark-800"
            title="New Diagram"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      ) : (
        // Expanded view - full sidebar
        <>
      {/* Workspace Selector */}
      <div className="relative">
        <div 
          onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
          className="p-4 border-b border-gray-800 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center border border-brand-500/30 flex-shrink-0">
              <Layout className="w-4 h-4 text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-500 uppercase tracking-wider">Workspace</p>
              <p className="text-sm font-bold text-gray-200 truncate">{activeWorkspace.name}</p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isWorkspaceDropdownOpen ? 'rotate-180' : ''}`} />
        </div>

        {isWorkspaceDropdownOpen && (
          <div className="absolute top-full left-0 right-0 bg-dark-800 border-b border-gray-700 z-30 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-64 overflow-y-auto py-2">
              {workspaces.map(w => (
                <div 
                  key={w.id}
                  className="group flex items-center justify-between px-4 py-2 hover:bg-dark-700 cursor-pointer"
                  onClick={() => {
                    onSwitchWorkspace(w.id);
                    setIsWorkspaceDropdownOpen(false);
                  }}
                >
                  <span className={`text-sm ${w.id === activeWorkspaceId ? 'text-brand-400 font-bold' : 'text-gray-400'}`}>
                    {w.name}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInputDialog({
                          title: 'Rename workspace',
                          placeholder: 'Workspace name',
                          defaultValue: w.name,
                          confirmLabel: 'Rename',
                          onSubmit: (name) => onRenameWorkspace(w.id, name),
                        });
                      }}
                      className="p-1 hover:text-brand-400 text-gray-500"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {workspaces.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            message: `Delete workspace "${w.name}" and all its diagrams? This cannot be undone.`,
                            confirmLabel: 'Delete',
                            onConfirm: () => onDeleteWorkspace(w.id),
                          });
                        }}
                        className="p-1 hover:text-red-400 text-gray-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-gray-700">
              <button
                onClick={() => {
                  setInputDialog({
                    title: 'New workspace',
                    placeholder: 'Workspace name',
                    confirmLabel: 'Create',
                    onSubmit: (name) => {
                      onCreateWorkspace(name);
                      setIsWorkspaceDropdownOpen(false);
                    },
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-gray-300 hover:text-brand-400 hover:bg-dark-700 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Workspace
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing Explorer Toolbar */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Explorer</span>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              setInputDialog({
                title: 'New folder',
                placeholder: 'Folder name',
                confirmLabel: 'Create',
                onSubmit: (name) => onCreateFolder(name, null),
              });
            }}
            className="p-1.5 text-gray-500 hover:text-brand-400 transition-colors rounded hover:bg-dark-800"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenRepoManager}
            className="p-1.5 text-gray-500 hover:text-green-400 transition-colors rounded hover:bg-dark-800"
            title="Repositories"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-1.5 text-gray-500 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded hover:bg-dark-800"
            title="Import diagrams"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsDownloadModalOpen(true)}
            disabled={isProcessing || diagrams.length === 0}
            className="p-1.5 text-gray-500 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded hover:bg-dark-800"
            title="Download..."
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Code Graphs Section */}
        <div className="mb-3">
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
            <span>Code Graphs</span>
            <div className="flex items-center gap-1">
              {codeGraphs.length > 0 && (
                <span className="bg-dark-800 px-1.5 py-0.5 rounded text-[10px]">{codeGraphs.length}</span>
              )}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCreatingGraph) return;
                    if (connectedRepos.length === 0) return;
                    if (connectedRepos.length === 1) {
                      handleCreateGraph(connectedRepos[0].id);
                    } else {
                      setIsRepoPickerOpen(!isRepoPickerOpen);
                    }
                  }}
                  disabled={connectedRepos.length === 0 || isCreatingGraph}
                  className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={connectedRepos.length === 0 ? 'Connect a repository first' : 'New Code Graph'}
                >
                  {isCreatingGraph
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-green-400" />
                    : <Plus className="w-3.5 h-3.5" />}
                </button>
                {/* Repo Picker Dropdown */}
                {isRepoPickerOpen && connectedRepos.length > 1 && (
                  <div className="absolute right-0 top-full mt-1 bg-dark-800 border border-gray-700 rounded-lg shadow-xl z-40 min-w-[180px] py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    <p className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Select repository</p>
                    {connectedRepos.map(repo => (
                      <button
                        key={repo.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateGraph(repo.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-dark-700 hover:text-green-400 transition-colors text-left"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        <span className="truncate">{repo.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {isCreatingGraph && graphCreationProgress && (
            <div className="px-3 mb-2">
              <div className="flex items-center gap-2 text-xs text-green-400">
                <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                <span className="truncate flex-1">{graphCreationProgress.step}</span>
                {graphCreationProgress.total > 1 && (
                  <span className="text-gray-500">{graphCreationProgress.current}/{graphCreationProgress.total}</span>
                )}
                {onCancelCreateGraph && (
                  <button
                    onClick={onCancelCreateGraph}
                    className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                    title="Cancel graph creation"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
          {codeGraphs.length > 0 && (
            <div className="space-y-0.5 px-2">
              {codeGraphs.map(graph => (
                <div
                  key={graph.id}
                  onClick={() => onSelectGraph?.(activeGraphId === graph.id ? null : graph.id)}
                  className={`
                    group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors
                    ${activeGraphId === graph.id
                      ? 'bg-green-900/30 text-green-400'
                      : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'}
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate text-sm">{graph.name}</span>
                    <span className="text-[10px] bg-green-800/50 text-green-300 px-1.5 py-0.5 rounded-full font-medium">
                      {Object.keys(graph.nodes).length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGraph?.(graph.id);
                      }}
                      className="p-1 rounded hover:bg-red-900/50 hover:text-red-400 text-gray-500 transition-colors"
                      title="Delete graph"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {codeGraphs.length === 0 && (
            <div className="px-3">
              <p className="text-xs text-gray-600 italic mb-2">
                {connectedRepos.length === 0
                  ? 'Connect a repository to create a graph'
                  : 'Click + to create a Code Graph'}
              </p>
              {onLoadDemoGraph && (
                <button
                  onClick={onLoadDemoGraph}
                  className="text-xs text-green-500 hover:text-green-400 underline underline-offset-2 transition-colors"
                >
                  Load demo graph (RealWorld)
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
          <span>Diagrams</span>
          <span className="bg-dark-800 px-1.5 py-0.5 rounded text-[10px]">{diagrams.length}</span>
        </div>
        <div className="space-y-0.5 px-2">
          {rootFolders.map(folder => renderFolder(folder))}
          {rootDiagrams.map(diagram => renderDiagram(diagram))}
        </div>
      </div>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={() => onCreate(null)}
          className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-brand-900/30 text-gray-300 hover:text-brand-400 py-2 px-4 rounded-lg border border-gray-700 hover:border-brand-500/50 transition-all text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Diagram
        </button>
      </div>
        </>
      )}

      {/* Download Modal */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsDownloadModalOpen(false)}>
          <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-brand-400" />
                <h2 className="text-lg font-semibold text-gray-100">Download</h2>
              </div>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Options */}
            <div className="p-6 space-y-3">
              {/* Current Diagram */}
              {diagrams.find(d => d.id === activeId) && (
                <button
                  onClick={() => {
                    const diagram = diagrams.find(d => d.id === activeId);
                    if (diagram) handleDownloadDiagram(diagram);
                  }}
                  className="w-full flex items-start gap-4 p-4 bg-dark-800 hover:bg-dark-700 border border-gray-700 hover:border-brand-500/50 rounded-lg transition-all text-left group"
                >
                  <div className="p-2 bg-brand-600/20 rounded-lg border border-brand-500/30 group-hover:bg-brand-600/30 transition-colors">
                    <FileDown className="w-5 h-5 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-200 group-hover:text-brand-400 transition-colors">Current Diagram</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {diagrams.find(d => d.id === activeId)?.name}
                    </p>
                  </div>
                </button>
              )}

              {/* Current Workspace */}
              <button
                onClick={handleDownloadWorkspace}
                className="w-full flex items-start gap-4 p-4 bg-dark-800 hover:bg-dark-700 border border-gray-700 hover:border-brand-500/50 rounded-lg transition-all text-left group"
              >
                <div className="p-2 bg-brand-600/20 rounded-lg border border-brand-500/30 group-hover:bg-brand-600/30 transition-colors">
                  <Layout className="w-5 h-5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 group-hover:text-brand-400 transition-colors">Current Workspace</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {activeWorkspace.name} &mdash; {diagrams.length} diagram{diagrams.length !== 1 ? 's' : ''}, {folders.length} folder{folders.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>

              {/* All Workspaces */}
              <button
                onClick={handleDownloadAllWorkspaces}
                className="w-full flex items-start gap-4 p-4 bg-dark-800 hover:bg-dark-700 border border-gray-700 hover:border-brand-500/50 rounded-lg transition-all text-left group"
              >
                <div className="p-2 bg-brand-600/20 rounded-lg border border-brand-500/30 group-hover:bg-brand-600/30 transition-colors">
                  <Globe className="w-5 h-5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 group-hover:text-brand-400 transition-colors">All Workspaces</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}, {allDiagrams.length} diagram{allDiagrams.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-700">
              <p className="text-xs text-gray-600 text-center">
                Exports as <span className="text-gray-500 font-medium">.bluelens</span> with all metadata preserved
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <ConfirmModal
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Input dialog */}
      {inputDialog && (
        <InputModal
          title={inputDialog.title}
          placeholder={inputDialog.placeholder}
          defaultValue={inputDialog.defaultValue}
          options={inputDialog.options}
          confirmLabel={inputDialog.confirmLabel}
          onSubmit={(val) => { inputDialog.onSubmit(val); setInputDialog(null); }}
          onCancel={() => setInputDialog(null)}
        />
      )}
    </div>
  );
};