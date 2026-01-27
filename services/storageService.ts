import { Diagram } from '../types';
import { DEFAULT_DIAGRAM } from '../constants';

const KEYS = {
  DIAGRAMS: 'mermaidviz_diagrams',
  ACTIVE_ID: 'mermaidviz_active_id'
};

const generateId = () => Math.random().toString(36).substr(2, 9);

export const storageService = {
  /**
   * Loads diagrams from local storage with schema validation/migration
   */
  loadDiagrams: (): Diagram[] => {
    try {
      const saved = localStorage.getItem(KEYS.DIAGRAMS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migration: Ensure all diagrams have required fields
          return parsed.map((d: any) => ({
            id: d.id || generateId(),
            name: d.name || 'Untitled',
            code: d.code || '',
            comments: Array.isArray(d.comments) ? d.comments : [],
            lastModified: d.lastModified || Date.now()
          }));
        }
      }
    } catch (e) {
      console.error("Failed to load diagrams from storage:", e);
    }

    // Default state if nothing saved
    return [{
      id: generateId(),
      name: 'Untitled Diagram',
      code: DEFAULT_DIAGRAM,
      comments: [],
      lastModified: Date.now()
    }];
  },

  /**
   * Saves diagrams to local storage
   */
  saveDiagrams: (diagrams: Diagram[]) => {
    try {
      localStorage.setItem(KEYS.DIAGRAMS, JSON.stringify(diagrams));
    } catch (e) {
      console.error("Failed to save diagrams:", e);
      // Could emit an event or toast here if needed
    }
  },

  /**
   * Loads the ID of the last active diagram
   */
  loadActiveId: (availableDiagrams: Diagram[]): string => {
    try {
      const savedId = localStorage.getItem(KEYS.ACTIVE_ID);
      // Verify the saved ID actually exists in our diagrams
      if (savedId && availableDiagrams.some(d => d.id === savedId)) {
        return savedId;
      }
    } catch (e) {
      console.error("Failed to load active ID:", e);
    }
    // Fallback to the first diagram
    return availableDiagrams[0]?.id || '';
  },

  /**
   * Saves the active diagram ID
   */
  saveActiveId: (id: string) => {
    localStorage.setItem(KEYS.ACTIVE_ID, id);
  }
};