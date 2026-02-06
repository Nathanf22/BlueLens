import React from 'react';
import { Folder } from '../types';

export const useFolderHandlers = (
  folders: Folder[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
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

  const handleDeleteFolder = (folderId: string) => {
    if (window.confirm('Delete this folder? Diagrams inside will be moved to root.')) {
      setFolders(prev => prev.filter(f => f.id !== folderId));
    }
  };

  const handleRenameFolder = (folderId: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name } : f));
  };

  return {
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder
  };
};
