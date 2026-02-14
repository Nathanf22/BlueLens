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
    if (window.confirm('Delete this folder? Diagrams inside will be moved to root.')) {
      // Move diagrams to root
      setDiagrams(prev => prev.map(d => 
        (d.folderId === folderId && d.workspaceId === activeWorkspaceId) ? { ...d, folderId: null } : d
      ));
      // Delete folder and move child folders to root
      setFolders(prev => prev
        .filter(f => f.id !== folderId)
        .map(f => (f.parentId === folderId && f.workspaceId === activeWorkspaceId) ? { ...f, parentId: null } : f)
      );
    }
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
