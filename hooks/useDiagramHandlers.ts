import React from 'react';
import { useState } from 'react';
import { Diagram } from '../types';

export const useDiagramHandlers = (
  diagrams: Diagram[],
  setDiagrams: React.Dispatch<React.SetStateAction<Diagram[]>>,
  activeWorkspaceId: string,
  activeId: string,
  setActiveId: React.Dispatch<React.SetStateAction<string>>
) => {
  const generateId = () => Math.random().toString(36).substr(2, 9);
  
  const handleCreateDiagram = (folderId: string | null = null) => {
    const workspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
    const newDiagram: Diagram = {
      id: generateId(),
      name: `Untitled ${workspaceDiagrams.length + 1}`,
      code: `graph TD\n    A[Start] --> B[New Diagram]`,
      comments: [],
      lastModified: Date.now(),
      folderId: folderId,
      workspaceId: activeWorkspaceId,
      nodeLinks: []
    };
    setDiagrams([...diagrams, newDiagram]);
    setActiveId(newDiagram.id);
  };

  const handleImportDiagrams = (importedDiagrams: Diagram[]) => {
    const itemsWithWorkspace = importedDiagrams.map(d => ({ ...d, workspaceId: activeWorkspaceId }));
    setDiagrams(prev => [...prev, ...itemsWithWorkspace]);
    if (itemsWithWorkspace.length > 0) {
      setActiveId(itemsWithWorkspace[0].id);
    }
  };

  const handleDeleteDiagram = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const workspaceDiagrams = diagrams.filter(d => d.workspaceId === activeWorkspaceId);
    if (workspaceDiagrams.length <= 1) return;

    if (window.confirm('Are you sure you want to delete this diagram?')) {
      setDiagrams(diagrams.filter(d => d.id !== id));
      
      if (id === activeId) {
        const remaining = diagrams.filter(d => d.workspaceId === activeWorkspaceId && d.id !== id);
        if (remaining.length > 0) setActiveId(remaining[0].id);
      }
    }
  };

  const handleMoveDiagram = (diagramId: string, folderId: string | null) => {
    setDiagrams(prev => prev.map(d => d.id === diagramId ? { ...d, folderId } : d));
  };

  return {
    handleCreateDiagram,
    handleImportDiagrams,
    handleDeleteDiagram,
    handleMoveDiagram
  };
};
