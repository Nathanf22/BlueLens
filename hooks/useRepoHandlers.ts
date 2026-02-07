import React from 'react';
import { RepoConfig } from '../types';
import { fileSystemService } from '../services/fileSystemService';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useRepoHandlers = (
  repos: RepoConfig[],
  setRepos: React.Dispatch<React.SetStateAction<RepoConfig[]>>,
  activeWorkspaceId: string
) => {
  const handleAddRepo = async () => {
    if (!fileSystemService.isSupported()) {
      alert('File System Access API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const result = await fileSystemService.openDirectory();
    if (!result) return; // User cancelled

    const id = generateId();
    fileSystemService.storeHandle(id, result.handle);

    const newRepo: RepoConfig = {
      id,
      name: result.name,
      workspaceId: activeWorkspaceId,
      addedAt: Date.now(),
    };

    setRepos(prev => [...prev, newRepo]);
  };

  const handleRemoveRepo = (repoId: string) => {
    fileSystemService.removeHandle(repoId);
    setRepos(prev => prev.filter(r => r.id !== repoId));
  };

  const handleReopenRepo = async (repoId: string) => {
    if (!fileSystemService.isSupported()) return;

    const result = await fileSystemService.openDirectory();
    if (!result) return;

    fileSystemService.storeHandle(repoId, result.handle);
    // Update the name in case the user picked a different directory
    setRepos(prev =>
      prev.map(r => (r.id === repoId ? { ...r, name: result.name } : r))
    );
  };

  return {
    handleAddRepo,
    handleRemoveRepo,
    handleReopenRepo,
  };
};
