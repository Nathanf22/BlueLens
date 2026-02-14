/**
 * Hash-based change detection for CodeGraph sync.
 * Compares current file hashes against syncLock entries.
 */

import { CodeGraph, SyncLockEntry, SyncLockStatus } from '../types';
import { fileSystemService } from './fileSystemService';
import { codeParserService } from './codeParserService';
import { codebaseAnalyzerService } from './codebaseAnalyzerService';
import { codeToGraphParserService } from './codeToGraphParserService';

interface ChangeReport {
  modified: SyncLockEntry[];
  missing: SyncLockEntry[];
  unchanged: SyncLockEntry[];
}

async function detectChanges(
  graph: CodeGraph,
  handle: FileSystemDirectoryHandle
): Promise<ChangeReport> {
  const report: ChangeReport = {
    modified: [],
    missing: [],
    unchanged: [],
  };

  for (const entry of Object.values(graph.syncLock)) {
    try {
      const content = await fileSystemService.readFile(handle, entry.sourceRef.filePath);
      const currentHash = await codeParserService.computeContentHash(content);

      if (currentHash !== entry.sourceRef.contentHash) {
        report.modified.push({ ...entry, status: 'modified' });
      } else {
        report.unchanged.push(entry);
      }
    } catch {
      report.missing.push({ ...entry, status: 'missing' });
    }
  }

  return report;
}

async function applySyncReport(graph: CodeGraph, report: ChangeReport): Promise<CodeGraph> {
  const syncLock = { ...graph.syncLock };

  for (const entry of report.modified) {
    syncLock[entry.nodeId] = { ...entry, status: 'modified', lastChecked: Date.now() };
  }

  for (const entry of report.missing) {
    syncLock[entry.nodeId] = { ...entry, status: 'missing', lastChecked: Date.now() };
  }

  for (const entry of report.unchanged) {
    syncLock[entry.nodeId] = { ...entry, status: 'locked', lastChecked: Date.now() };
  }

  return { ...graph, syncLock, updatedAt: Date.now() };
}

async function fullResync(
  graph: CodeGraph,
  handle: FileSystemDirectoryHandle,
  repoName: string
): Promise<CodeGraph> {
  // Re-parse the entire codebase
  const analysis = await codebaseAnalyzerService.analyzeCodebase(handle);

  // Build a fresh graph from the analysis
  const freshGraph = await codeToGraphParserService.parseCodebaseToGraph(
    analysis,
    graph.repoId,
    repoName,
    graph.workspaceId,
    handle
  );

  // Preserve: ID, name, lenses, domain model, manual additions
  return {
    ...freshGraph,
    id: graph.id,
    name: graph.name,
    createdAt: graph.createdAt,
    lenses: graph.lenses,
    activeLensId: graph.activeLensId,
    domainNodes: graph.domainNodes,
    domainRelations: graph.domainRelations,
  };
}

export const codeGraphSyncService = {
  detectChanges,
  applySyncReport,
  fullResync,
};
