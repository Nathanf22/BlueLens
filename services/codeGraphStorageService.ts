/**
 * localStorage persistence for CodeGraph entities.
 * Stored separately from diagram data to avoid bloating existing storage.
 */

import { CodeGraph, CodeGraphConfig } from '../types';

const KEYS = {
  INDEX: 'mermaidviz_codegraphs',
  GRAPH_PREFIX: 'mermaidviz_codegraph_',
  CONFIG_PREFIX: 'mermaidviz_codegraph_config_',
};

interface CodeGraphIndex {
  id: string;
  name: string;
  workspaceId: string;
  repoId: string;
  updatedAt: number;
}

export const codeGraphStorageService = {
  listCodeGraphs(workspaceId?: string): CodeGraphIndex[] {
    try {
      const saved = localStorage.getItem(KEYS.INDEX);
      if (saved) {
        const parsed: CodeGraphIndex[] = JSON.parse(saved);
        if (workspaceId) return parsed.filter(g => g.workspaceId === workspaceId);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load CodeGraph index:', e);
    }
    return [];
  },

  saveCodeGraph(graph: CodeGraph): void {
    try {
      // Save the full graph
      localStorage.setItem(KEYS.GRAPH_PREFIX + graph.id, JSON.stringify(graph));

      // Update the index
      const index = this.listCodeGraphs();
      const existing = index.findIndex(g => g.id === graph.id);
      const entry: CodeGraphIndex = {
        id: graph.id,
        name: graph.name,
        workspaceId: graph.workspaceId,
        repoId: graph.repoId,
        updatedAt: graph.updatedAt,
      };

      if (existing >= 0) {
        index[existing] = entry;
      } else {
        index.push(entry);
      }

      localStorage.setItem(KEYS.INDEX, JSON.stringify(index));
    } catch (e) {
      console.error('Failed to save CodeGraph:', e);
    }
  },

  loadCodeGraph(id: string): CodeGraph | null {
    try {
      const saved = localStorage.getItem(KEYS.GRAPH_PREFIX + id);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load CodeGraph:', e);
    }
    return null;
  },

  deleteCodeGraph(id: string): void {
    try {
      localStorage.removeItem(KEYS.GRAPH_PREFIX + id);
      localStorage.removeItem(KEYS.CONFIG_PREFIX + id);

      const index = this.listCodeGraphs().filter(g => g.id !== id);
      localStorage.setItem(KEYS.INDEX, JSON.stringify(index));
    } catch (e) {
      console.error('Failed to delete CodeGraph:', e);
    }
  },

  saveCodeGraphConfig(config: CodeGraphConfig): void {
    try {
      localStorage.setItem(KEYS.CONFIG_PREFIX + config.id, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save CodeGraph config:', e);
    }
  },

  loadCodeGraphConfig(id: string): CodeGraphConfig | null {
    try {
      const saved = localStorage.getItem(KEYS.CONFIG_PREFIX + id);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load CodeGraph config:', e);
    }
    return null;
  },
};
