import { Diagram, Folder, Workspace, RepoConfig } from '../types';
import { DEFAULT_DIAGRAM } from '../constants';

const KEYS = {
  DIAGRAMS: 'mermaidviz_diagrams',
  FOLDERS: 'mermaidviz_folders',
  WORKSPACES: 'mermaidviz_workspaces',
  ACTIVE_WORKSPACE_ID: 'mermaidviz_active_workspace_id',
  ACTIVE_ID: 'mermaidviz_active_id',
  REPOS: 'mermaidviz_repos'
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_WORKSPACE_ID = 'default-workspace';

export const storageService = {
  /**
   * Performs migration if workspaces don't exist yet
   */
  getInitialState: () => {
    let workspaces = storageService.loadWorkspaces();
    let isMigrationNeeded = false;
    
    if (workspaces.length === 0) {
      const defaultWorkspace: Workspace = {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Personal Workspace',
        createdAt: Date.now()
      };
      workspaces = [defaultWorkspace];
      storageService.saveWorkspaces(workspaces);
      storageService.saveActiveWorkspaceId(DEFAULT_WORKSPACE_ID);
      isMigrationNeeded = true;
    }

    const activeWorkspaceId = storageService.loadActiveWorkspaceId() || workspaces[0].id;
    
    return { workspaces, activeWorkspaceId, isMigrationNeeded };
  },

  /**
   * Loads ALL diagrams and ensures they have workspaceId
   */
  loadAllDiagrams: (): Diagram[] => {
    try {
      const saved = localStorage.getItem(KEYS.DIAGRAMS);
      if (saved) {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((d: any) => {
            // Migration: Convert old format to new format
            let nodeLinks = d.nodeLinks || [];
            
            // Check if this is old format (has hasSubDiagram field)
            if ('hasSubDiagram' in d && d.hasSubDiagram && d.subDiagramId) {
              nodeLinks = [{
                nodeId: '_diagram_root_', // Special ID for diagram-level link
                targetDiagramId: d.subDiagramId,
                label: 'Migrated from diagram-level link'
              }];
            }
            
            return {
              id: d.id || generateId(),
              name: d.name || 'Untitled',
              code: d.code || '',
              comments: Array.isArray(d.comments) ? d.comments : [],
              lastModified: d.lastModified || Date.now(),
              folderId: d.folderId || null,
              workspaceId: d.workspaceId || DEFAULT_WORKSPACE_ID,
              nodeLinks: nodeLinks,
              codeLinks: Array.isArray(d.codeLinks) ? d.codeLinks : []
            };
          });
        }
      }
    } catch (e) {
      console.error("Failed to load diagrams from storage:", e);
    }

    return [{
      id: generateId(),
      name: 'Untitled Diagram',
      code: DEFAULT_DIAGRAM,
      comments: [],
      lastModified: Date.now(),
      folderId: null,
      workspaceId: DEFAULT_WORKSPACE_ID,
      nodeLinks: [],
      codeLinks: []
    }];
  },

  saveDiagrams: (diagrams: Diagram[]) => {
    try {
      localStorage.setItem(KEYS.DIAGRAMS, JSON.stringify(diagrams));
    } catch (e) {
      console.error("Failed to save diagrams:", e);
    }
  },

  loadAllFolders: (): Folder[] => {
    try {
      const saved = localStorage.getItem(KEYS.FOLDERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((f: any) => ({
            ...f,
            workspaceId: f.workspaceId || DEFAULT_WORKSPACE_ID
          }));
        }
      }
    } catch (e) {
      console.error("Failed to load folders from storage:", e);
    }
    return [];
  },

  saveFolders: (folders: Folder[]) => {
    try {
      localStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
    } catch (e) {
      console.error("Failed to save folders:", e);
    }
  },

  loadWorkspaces: (): Workspace[] => {
    try {
      const saved = localStorage.getItem(KEYS.WORKSPACES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load workspaces:", e);
    }
    return [];
  },

  saveWorkspaces: (workspaces: Workspace[]) => {
    localStorage.setItem(KEYS.WORKSPACES, JSON.stringify(workspaces));
  },

  loadActiveWorkspaceId: (): string | null => {
    return localStorage.getItem(KEYS.ACTIVE_WORKSPACE_ID);
  },

  saveActiveWorkspaceId: (id: string) => {
    localStorage.setItem(KEYS.ACTIVE_WORKSPACE_ID, id);
  },

  /**
   * Loads the ID of the last active diagram
   */
  loadActiveId: (diagrams: Diagram[]): string => {
    try {
      const savedId = localStorage.getItem(KEYS.ACTIVE_ID);
      if (savedId && diagrams.some(d => d.id === savedId)) {
        return savedId;
      }
    } catch (e) {
      console.error("Failed to load active ID:", e);
    }
    return diagrams[0]?.id || '';
  },

  saveActiveId: (id: string) => {
    localStorage.setItem(KEYS.ACTIVE_ID, id);
  },

  loadAllRepos: (): RepoConfig[] => {
    try {
      const saved = localStorage.getItem(KEYS.REPOS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load repos from storage:", e);
    }
    return [];
  },

  saveRepos: (repos: RepoConfig[]) => {
    try {
      localStorage.setItem(KEYS.REPOS, JSON.stringify(repos));
    } catch (e) {
      console.error("Failed to save repos:", e);
    }
  }
};