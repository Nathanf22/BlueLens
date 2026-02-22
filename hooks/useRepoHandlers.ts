import React from 'react';
import { RepoConfig } from '../types';
import { fileSystemService } from '../services/fileSystemService';
import { ToastType } from './useToast';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useRepoHandlers = (
  repos: RepoConfig[],
  setRepos: React.Dispatch<React.SetStateAction<RepoConfig[]>>,
  activeWorkspaceId: string,
  showToast?: (message: string, type?: ToastType) => void
) => {
  const handleAddRepo = async () => {
    if (!fileSystemService.isSupported()) {
      showToast?.('File System Access API is not supported in this browser. Please use Chrome or Edge.', 'error');
      return;
    }

    const result = await fileSystemService.openDirectory();
    if (!result) return; // User cancelled

    // Check if this directory was previously registered (even after removal).
    // Re-using the original ID preserves all CodeGraph and codeLink references.
    const existingId = await fileSystemService.findPersistedIdForDirectory(result.handle);
    if (existingId) {
      fileSystemService.storeHandle(existingId, result.handle);
      await fileSystemService.persistHandle(existingId, result.handle);
      setRepos(prev => {
        const alreadyPresent = prev.some(r => r.id === existingId);
        if (alreadyPresent) {
          return prev.map(r => r.id === existingId ? { ...r, name: result.name } : r);
        }
        return [...prev, { id: existingId, name: result.name, workspaceId: activeWorkspaceId, addedAt: Date.now() }];
      });
      showToast?.(`Reconnected to ${result.name}`, 'success');
      return;
    }

    const id = generateId();
    fileSystemService.storeHandle(id, result.handle);
    await fileSystemService.persistHandle(id, result.handle);

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

    // Try to reconnect using the persisted handle (shows a small permission
    // prompt instead of the full directory picker).
    const reconnected = await fileSystemService.reconnectRepo(repoId);
    if (reconnected) {
      setRepos(prev =>
        prev.map(r => (r.id === repoId ? { ...r, name: reconnected.name } : r))
      );
      return;
    }

    // Persisted handle not available or permission denied — fall back to picker.
    const result = await fileSystemService.openDirectory();
    if (!result) return;

    fileSystemService.storeHandle(repoId, result.handle);
    await fileSystemService.persistHandle(repoId, result.handle);
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
