import React from 'react';
import { Workspace } from '../types';

export const useWorkspaceHandlers = (
  workspaces: Workspace[],
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>,
  activeWorkspaceId: string,
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string>>,
  setDiagrams: React.Dispatch<React.SetStateAction<any[]>>,
  setFolders: React.Dispatch<React.SetStateAction<any[]>>
) => {
  const generateId = () => Math.random().toString(36).substr(2, 9);

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
    if (workspaces.length <= 1) return;
    setDiagrams(prev => prev.filter(d => d.workspaceId !== id));
    setFolders(prev => prev.filter(f => f.workspaceId !== id));
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(workspaces.find(w => w.id !== id)!.id);
    }
  };

  const handleRenameWorkspace = (id: string, name: string) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  };

  return {
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleRenameWorkspace
  };
};
