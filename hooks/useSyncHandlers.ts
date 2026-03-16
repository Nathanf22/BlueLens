/**
 * Sync handlers for CodeGraph <-> Code <-> Diagram synchronization.
 * Manages sync mode, status per graph, and pending proposals.
 */

import { useState, useCallback } from 'react';
import { CodeGraph, Diagram, GraphDiff, SyncMode, SyncStatus, SyncProposal, LLMSettings } from '../types';
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
  return 'manual';
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
  const [lastSyncDiff, setLastSyncDiff] = useState<GraphDiff | null>(null);

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
    updateDiagram: (id: string, code: string) => void,
    regenerateFlows?: (g: CodeGraph) => Promise<CodeGraph | undefined>,
  ): Promise<{ linkedDiagrams: number; proposalsGenerated: number; proposalsApplied: number; flowsGraph?: CodeGraph }> => {
    if (!handle) return { linkedDiagrams: 0, proposalsGenerated: 0, proposalsApplied: 0 };
    setIsSyncingGraph(true);
    try {
      const { graph: updatedGraph, diff } = await codeGraphSyncService.incrementalResync(
        graph,
        handle,
        repoName
      );

      // Regenerate flows if there were structural changes and a generator is provided
      const hasDiff = diff.addedNodes.length > 0 || diff.removedNodes.length > 0 || diff.modifiedNodes.length > 0;
      let finalGraph = updatedGraph;
      let flowsGraph: CodeGraph | undefined;
      if (hasDiff && regenerateFlows) {
        const withFlows = await regenerateFlows(updatedGraph).catch(() => null);
        if (withFlows) { finalGraph = withFlows; flowsGraph = withFlows; }
      }

      updateGraph(finalGraph);
      setGraphSyncStatuses(prev => ({ ...prev, [graph.id]: 'synced' }));
      setLastSyncDiff(diff);

      const proposal = await diagramSyncService.buildSyncProposal(graph, diff, diagrams, updatedGraph, llmSettings);
      const linkedDiagrams = diagrams.filter(d => d.sourceGraphId === graph.id).length;

      if (proposal.diagramDiffs.length === 0) {
        return { linkedDiagrams, proposalsGenerated: 0, proposalsApplied: 0, flowsGraph };
      }

      let proposalsApplied = 0;

      if (syncMode === 'auto') {
        for (const d of proposal.diagramDiffs) {
          updateDiagram(d.diagramId, d.proposedCode);
        }
        proposalsApplied = proposal.diagramDiffs.length;
      } else if (syncMode === 'semi-auto') {
        const pending: typeof proposal.diagramDiffs = [];
        for (const d of proposal.diagramDiffs) {
          const additionsOnly = d.addedNodes.length > 0 && d.removedNodes.length === 0 && d.removedEdges.length === 0;
          if (additionsOnly) {
            updateDiagram(d.diagramId, d.proposedCode);
            proposalsApplied++;
          } else {
            pending.push(d);
          }
        }
        if (pending.length > 0) {
          setPendingProposals(prev => [...prev, { ...proposal, diagramDiffs: pending }]);
        }
      } else {
        setPendingProposals(prev => [...prev, proposal]);
      }

      return { linkedDiagrams, proposalsGenerated: proposal.diagramDiffs.length - proposalsApplied, proposalsApplied, flowsGraph };
    } catch (err) {
      console.error('[useSyncHandlers] handleIncrementalSync error:', err);
      return { linkedDiagrams: 0, proposalsGenerated: 0, proposalsApplied: 0 };
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
    lastSyncDiff,
    handleCheckSync,
    handleIncrementalSync,
    handleApplyProposal,
    handleDismissProposal,
    handleSetSyncMode,
  };
};
