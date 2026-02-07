import { useEffect } from 'react';
import { Diagram, Folder, Workspace, RepoConfig } from '../types';
import { storageService } from '../services/storageService';

export const useStoragePersistence = (
  diagrams: Diagram[],
  folders: Folder[],
  workspaces: Workspace[],
  repos: RepoConfig[],
  activeWorkspaceId: string,
  activeId: string,
  setSaveStatus: (status: 'saved' | 'saving') => void
) => {
  // Persist everything to localStorage
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      storageService.saveDiagrams(diagrams);
      storageService.saveFolders(folders);
      storageService.saveWorkspaces(workspaces);
      storageService.saveRepos(repos);
      storageService.saveActiveWorkspaceId(activeWorkspaceId);
      setSaveStatus('saved');
    }, 500);

    return () => clearTimeout(timer);
  }, [diagrams, folders, workspaces, repos, activeWorkspaceId, setSaveStatus]);

  // Persist active ID
  useEffect(() => {
    storageService.saveActiveId(activeId);
  }, [activeId]);
};
