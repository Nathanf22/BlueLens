/**
 * Sync handlers for CodeGraph <-> Code <-> Diagram synchronization.
 * Manages sync mode, status per graph, and pending proposals.
 */

import { useState, useCallback } from 'react';
import { CodeGraph, Diagram, SyncMode, SyncStatus, SyncProposal, LLMSettings } from '../types';
import { codeGraphSyncService } from '../services/codeGraphSyncService';
import { diagramSyncService } from '../services/diagramSyncService';

const SYNC_MODE_STORAGE_KEY = 'bluelens_sync_mode';

function loadSyncMode(): SyncMode {
  try {
    const stored = localStorage.getItem(SYNC_MODE_STORAGE_KEY);
    if (stored === 'manual' || stored === 'semi-auto' || stored === 'auto') {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return 'semi-auto';
}

function saveSyncMode(mode: SyncMode): void {
  try {
    localStorage.setItem(SYNC_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable
  }
}

export const useSyncHandlers = () => {
  const [syncMode, setSyncModeState] = useState<SyncMode>(loadSyncMode);
  const [pendingProposals, setPendingProposals] = useState<SyncProposal[]>([]);
  const [graphSyncStatuses, setGraphSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [isCheckingSync, setIsCheckingSync] = useState(false);
  const [isSyncingGraph, setIsSyncingGraph] = useState(false);

  const handleCheckSync = useCallback(async (
    graph: CodeGraph,
    handle: FileSystemDirectoryHandle | null,
    updateGraph: (g: CodeGraph) => void
  ) => {
    if (!handle) return;
    setIsCheckingSync(true);
    try {
      const report = await codeGraphSyncService.detectChanges(graph, handle);
      const updatedGraph = await codeGraphSyncService.applySyncReport(graph, report);
      updateGraph(updatedGraph);
      const status = codeGraphSyncService.computeGraphStatus(updatedGraph);
      setGraphSyncStatuses(prev => ({ ...prev, [graph.id]: status }));
    } catch (err) {
      console.error('[useSyncHandlers] handleCheckSync error:', err);
    } finally {
      setIsCheckingSync(false);
    }
  }, []);

  const handleIncrementalSync = useCallback(async (
    graph: CodeGraph,
    handle: FileSystemDirectoryHandle | null,
    repoName: string,
    diagrams: Diagram[],
    llmSettings: LLMSettings,
    updateGraph: (g: CodeGraph) => void,
    updateDiagram: (id: string, code: string) => void
  ) => {
    if (!handle) return;
    setIsSyncingGraph(true);
    try {
      const { graph: updatedGraph, diff } = await codeGraphSyncService.incrementalResync(
        graph,
        handle,
        repoName
      );
      updateGraph(updatedGraph);
      setGraphSyncStatuses(prev => ({ ...prev, [graph.id]: 'synced' }));

      const proposal = await diagramSyncService.buildSyncProposal(graph, diff, diagrams, updatedGraph, llmSettings);

      if (proposal.diagramDiffs.length === 0) {
        return;
      }

      if (syncMode === 'auto') {
        for (const d of proposal.diagramDiffs) {
          updateDiagram(d.diagramId, d.proposedCode);
        }
      } else if (syncMode === 'semi-auto') {
        // Auto-apply additions-only diffs; store the rest as pending
        const pending: typeof proposal.diagramDiffs = [];
        for (const d of proposal.diagramDiffs) {
          const additionsOnly = d.removedNodes.length === 0 && d.removedEdges.length === 0;
          if (additionsOnly) {
            updateDiagram(d.diagramId, d.proposedCode);
          } else {
            pending.push(d);
          }
        }
        if (pending.length > 0) {
          setPendingProposals(prev => [...prev, { ...proposal, diagramDiffs: pending }]);
        }
      } else {
        // manual: store all as pending
        setPendingProposals(prev => [...prev, proposal]);
      }
    } catch (err) {
      console.error('[useSyncHandlers] handleIncrementalSync error:', err);
    } finally {
      setIsSyncingGraph(false);
    }
  }, [syncMode]);

  const handleApplyProposal = useCallback((
    proposalId: string,
    selectedDiagramIds: string[],
    updateDiagram: (id: string, code: string, generatedFromGraphAt: number) => void
  ) => {
    setPendingProposals(prev => {
      const proposal = prev.find(p => p.id === proposalId);
      if (!proposal) return prev;

      const selectedSet = new Set(selectedDiagramIds);
      for (const d of proposal.diagramDiffs) {
        if (selectedSet.has(d.diagramId)) {
          updateDiagram(d.diagramId, d.proposedCode, proposal.createdAt);
        }
      }

      return prev.filter(p => p.id !== proposalId);
    });
  }, []);

  const handleDismissProposal = useCallback((proposalId: string) => {
    setPendingProposals(prev => prev.filter(p => p.id !== proposalId));
  }, []);

  const handleSetSyncMode = useCallback((mode: SyncMode) => {
    setSyncModeState(mode);
    saveSyncMode(mode);
  }, []);

  return {
    syncMode,
    pendingProposals,
    graphSyncStatuses,
    isCheckingSync,
    isSyncingGraph,
    handleCheckSync,
    handleIncrementalSync,
    handleApplyProposal,
    handleDismissProposal,
    handleSetSyncMode,
  };
};
