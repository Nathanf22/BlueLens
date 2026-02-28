import React from 'react';
import { Folder, Diagram } from '../types';

export const useFolderHandlers = (
  folders: Folder[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  diagrams: Diagram[],
  setDiagrams: React.Dispatch<React.SetStateAction<Diagram[]>>,
  activeWorkspaceId: string
) => {
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleCreateFolder = (name: string, parentId: string | null) => {
    const newFolder: Folder = {
      id: generateId(),
      name,
      parentId,
      workspaceId: activeWorkspaceId
    };
    setFolders([...folders, newFolder]);
  };

  /** Programmatic variant that returns the new folder ID */
  const createFolderProgrammatic = (name: string, parentId: string | null = null): string => {
    const id = generateId();
    const newFolder: Folder = { id, name, parentId, workspaceId: activeWorkspaceId };
    setFolders(prev => [...prev, newFolder]);
    return id;
  };

  const handleDeleteFolder = (folderId: string) => {
    // Collect all descendant folder IDs recursively
    const toDelete = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (!toDelete.has(f.id) && f.parentId !== null && toDelete.has(f.parentId)) {
          toDelete.add(f.id);
          changed = true;
        }
      }
    }
    // Delete all diagrams inside any of those folders
    setDiagrams(prev => prev.filter(d =>
      !(d.workspaceId === activeWorkspaceId && d.folderId !== null && toDelete.has(d.folderId))
    ));
    // Delete all those folders
    setFolders(prev => prev.filter(f => !toDelete.has(f.id)));
  };

  const handleRenameFolder = (folderId: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name } : f));
  };

  return {
    handleCreateFolder,
    createFolderProgrammatic,
    handleDeleteFolder,
    handleRenameFolder
  };
};
