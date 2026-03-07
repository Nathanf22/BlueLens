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
    // Re-using the original ID preserves all CodeGraph and codeLink references,
    // but only when the existing entry belongs to the current workspace.
    const existingId = await fileSystemService.findPersistedIdForDirectory(result.handle);
    if (existingId) {
      const existingRepo = repos.find(r => r.id === existingId);

      if (existingRepo && existingRepo.workspaceId === activeWorkspaceId) {
        // Case 1: already in this workspace — reconnect and update name.
        fileSystemService.storeHandle(existingId, result.handle);
        await fileSystemService.persistHandle(existingId, result.handle);
        setRepos(prev => prev.map(r => r.id === existingId ? { ...r, name: result.name } : r));
        showToast?.(`Reconnected to ${result.name}`, 'success');
        return;
      }

      if (!existingRepo) {
        // Case 2: previously removed from this workspace — reuse ID to preserve
        // any existing CodeGraph / codeLink references.
        fileSystemService.storeHandle(existingId, result.handle);
        await fileSystemService.persistHandle(existingId, result.handle);
        setRepos(prev => [...prev, { id: existingId, name: result.name, workspaceId: activeWorkspaceId, addedAt: Date.now() }]);
        showToast?.(`Reconnected to ${result.name}`, 'success');
        return;
      }

      // Case 3: repo belongs to a different workspace — fall through to create
      // a new independent entry so workspaces stay fully isolated.
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

  const handleAddGithubRepo = (url: string): boolean => {
    // Accept: https://github.com/owner/repo, https://github.com/owner/repo/tree/branch, etc.
    const match = url.trim().match(/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?(?:[/?#].*)?$/);
    if (!match) {
      showToast?.('Invalid GitHub URL. Use: https://github.com/owner/repo', 'error');
      return false;
    }
    const [, owner, repo, branch = 'main'] = match;

    const id = generateId();
    const newRepo: import('../types').RepoConfig = {
      id,
      name: `${owner}/${repo}`,
      workspaceId: activeWorkspaceId,
      addedAt: Date.now(),
      githubOwner: owner,
      githubRepo: repo,
      githubBranch: branch,
    };

    setRepos(prev => {
      const exists = prev.some(r => r.githubOwner === owner && r.githubRepo === repo && r.workspaceId === activeWorkspaceId);
      if (exists) {
        showToast?.(`${owner}/${repo} is already connected.`, 'info');
        return prev;
      }
      return [...prev, newRepo];
    });
    return true;
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

  const handleUpdateGithubBranch = (repoId: string, branch: string) => {
    setRepos(prev => prev.map(r => r.id === repoId ? { ...r, githubBranch: branch } : r));
  };

  return {
    handleAddRepo,
    handleAddGithubRepo,
    handleRemoveRepo,
    handleReopenRepo,
    handleUpdateGithubBranch,
  };
};
