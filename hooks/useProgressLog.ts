/**
 * Manages an accumulative progress log for CodeGraph creation.
 * Tracks timestamped entries with categories, and UI expand/collapse state.
 */

import { useState, useCallback, useRef } from 'react';
import { ProgressLogEntry, ProgressLogCategory } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useProgressLog = () => {
  const [entries, setEntries] = useState<ProgressLogEntry[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const startTimeRef = useRef<number>(0);

  const startLog = useCallback(() => {
    setEntries([]);
    setIsActive(true);
    setIsExpanded(true);
    startTimeRef.current = Date.now();
  }, []);

  const addEntry = useCallback((category: ProgressLogCategory, message: string, detail?: string) => {
    const entry: ProgressLogEntry = {
      id: generateId(),
      timestamp: Date.now() - startTimeRef.current,
      category,
      message,
      detail,
    };
    setEntries(prev => [...prev, entry]);
  }, []);

  const endLog = useCallback(() => {
    setIsActive(false);
  }, []);

  const dismiss = useCallback(() => {
    setIsExpanded(false);
    setEntries([]);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return {
    entries,
    isActive,
    isExpanded,
    startLog,
    addEntry,
    endLog,
    dismiss,
    toggleExpanded,
  };
};
