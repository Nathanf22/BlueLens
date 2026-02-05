import React, { useState, useRef } from 'react';
import { 
  Plus, Trash2, FileText, Layout, Download, Loader2, Upload, 
  Folder as FolderIcon, FolderPlus, ChevronDown, ChevronRight, MoreVertical,
  Edit2, Settings
} from 'lucide-react';
import { Diagram, Folder, Workspace } from '../types';
import JSZip from 'jszip';

interface SidebarProps {
  diagrams: Diagram[];
  folders: Folder[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (folderId?: string | null) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onImport: (diagrams: Diagram[]) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onMoveDiagram: (diagramId: string, folderId: string | null) => void;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const Sidebar: React.FC<SidebarProps> = ({ 
  diagrams, 
  folders,
  workspaces,
  activeWorkspaceId,
  activeId, 
  onSelect, 
  onCreate, 
  onDelete,
  onImport,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onMoveDiagram,
  onSwitchWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  onRenameWorkspace
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };
  
  // Existing handleDownloadAll, handleFileSelect, renderDiagram, renderFolder functions remain the same but I'll update the render part below.
  // Actually I need to include them in the replace block to avoid cutting them off.
  
  const handleDownloadAll = async () => {
    if (diagrams.length === 0) return;
    setIsProcessing(true);
    try {
      const zip = new JSZip();
      diagrams.forEach((diagram) => {
        let safeName = diagram.name.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '_');
        if (!safeName) safeName = `untitled_${diagram.id}`;
        let path = '';
        if (diagram.folderId) {
          const folder = folders.find(f => f.id === diagram.folderId);
          if (folder) path = `${folder.name}/`;
        }
        zip.file(`${path}${safeName}.mmd`, diagram.code);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${activeWorkspace.name.toLowerCase().replace(/\s+/g, '-')}-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to zip files", error);
      alert("Failed to create backup zip.");
    } finally { setIsProcessing(false); }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newDiagrams: Diagram[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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
                    workspaceId: activeWorkspaceId
                  });
                });
                promises.push(promise);
              }
            });
            await Promise.all(promises);
          } catch (e) {
            console.error("Error unzipping", e);
            alert(`Could not read zip file: ${file.name}`);
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
            workspaceId: activeWorkspaceId
          });
        }
      }
      if (newDiagrams.length > 0) onImport(newDiagrams);
    } catch (error) {
      console.error("Import error", error);
      alert("Failed to import files.");
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
        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate text-sm">{diagram.name}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const targetFolderId = prompt('Enter folder name to move to (or leave empty for root):');
            if (targetFolderId !== null) {
              const folder = folders.find(f => f.name === targetFolderId);
              onMoveDiagram(diagram.id, folder ? folder.id : null);
            }
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
            onDelete(diagram.id, e);
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
                const name = prompt('Subfolder name:');
                if (name) onCreateFolder(name, folder.id);
              }}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
              title="New subfolder"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const name = prompt('New folder name:', folder.name);
                if (name) onRenameFolder(folder.id, name);
              }}
              className="p-1 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
              title="Rename folder"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
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
    <div className="w-64 bg-dark-900 flex flex-col border-r border-gray-800 h-full flex-shrink-0">
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple
        accept=".mmd,.txt,.mermaid,.zip"
      />

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
                        const name = prompt('Rename workspace:', w.name);
                        if (name) onRenameWorkspace(w.id, name);
                      }}
                      className="p-1 hover:text-brand-400 text-gray-500"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {workspaces.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteWorkspace(w.id);
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
                  const name = prompt('Workspace name:');
                  if (name) {
                    onCreateWorkspace(name);
                    setIsWorkspaceDropdownOpen(false);
                  }
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
              const name = prompt('Folder name:');
              if (name) onCreateFolder(name, null);
            }}
            className="p-1.5 text-gray-500 hover:text-brand-400 transition-colors rounded hover:bg-dark-800"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
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
            onClick={handleDownloadAll}
            disabled={isProcessing || diagrams.length === 0}
            className="p-1.5 text-gray-500 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded hover:bg-dark-800"
            title="Download all as ZIP"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
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
    </div>
  );
};