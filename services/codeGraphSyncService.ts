/**
 * Hash-based change detection for CodeGraph sync.
 * Compares current file hashes against syncLock entries.
 */

import { CodeGraph, SyncLockEntry, SyncLockStatus, GraphNode, GraphRelation, GraphDiff, SyncStatus, GraphNodeKind, GraphDepth } from '../types';
import { fileSystemService } from './fileSystemService';
import { codeParserService } from './codeParserService';
import { codebaseAnalyzerService } from './codebaseAnalyzerService';
import { codeToGraphParserService } from './codeToGraphParserService';
import { LocalFileSystemProvider } from './LocalFileSystemProvider';

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
  const analysis = await codebaseAnalyzerService.analyzeCodebase(new LocalFileSystemProvider(handle));

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
    flows: graph.flows || {},
  };
}

function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.cxx')) return 'cpp';
  if (filePath.endsWith('.c')) return 'c';
  return 'unknown';
}

function computeGraphStatus(graph: CodeGraph): SyncStatus {
  const entries = Object.values(graph.syncLock);
  if (entries.length === 0) return 'unknown';
  const hasMissing = entries.some(e => e.status === 'missing');
  if (hasMissing) return 'conflicts';
  const hasModified = entries.some(e => e.status === 'modified');
  if (hasModified) return 'suggestions';
  const allLocked = entries.every(e => e.status === 'locked');
  if (allLocked) return 'synced';
  return 'unknown';
}

function diffGraphs(before: CodeGraph, after: CodeGraph): GraphDiff {
  const beforeNodes = before.nodes;
  const afterNodes = after.nodes;
  const beforeRelations = before.relations;
  const afterRelations = after.relations;

  const addedNodes: GraphNode[] = [];
  const removedNodes: GraphNode[] = [];
  const modifiedNodes: Array<{ before: GraphNode; after: GraphNode }> = [];

  // Added: in after but not before
  for (const id of Object.keys(afterNodes)) {
    if (!beforeNodes[id]) {
      addedNodes.push(afterNodes[id]);
    }
  }

  // Removed: in before but not after
  for (const id of Object.keys(beforeNodes)) {
    if (!afterNodes[id]) {
      removedNodes.push(beforeNodes[id]);
    }
  }

  // Modified: same ID but different name, kind, or contentHash
  // Ignore hash changes where prevHash was '' — that's initialization, not a real modification
  for (const id of Object.keys(afterNodes)) {
    if (beforeNodes[id]) {
      const b = beforeNodes[id];
      const a = afterNodes[id];
      const prevHash = b.sourceRef?.contentHash ?? '';
      const newHash = a.sourceRef?.contentHash ?? '';
      const hashChanged = prevHash !== '' && prevHash !== newHash;
      if (b.name !== a.name || b.kind !== a.kind || hashChanged) {
        modifiedNodes.push({ before: b, after: a });
      }
    }
  }

  const addedRelations: GraphRelation[] = [];
  const removedRelations: GraphRelation[] = [];

  for (const id of Object.keys(afterRelations)) {
    if (!beforeRelations[id]) {
      addedRelations.push(afterRelations[id]);
    }
  }

  for (const id of Object.keys(beforeRelations)) {
    if (!afterRelations[id]) {
      removedRelations.push(beforeRelations[id]);
    }
  }

  return { addedNodes, removedNodes, modifiedNodes, addedRelations, removedRelations };
}

async function incrementalResync(
  graph: CodeGraph,
  handle: FileSystemDirectoryHandle,
  _repoName: string
): Promise<{ graph: CodeGraph; diff: GraphDiff }> {
  const report = await detectChanges(graph, handle);

  const emptyDiff: GraphDiff = {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedRelations: [],
    removedRelations: [],
  };

  if (report.modified.length === 0 && report.missing.length === 0) {
    return { graph, diff: emptyDiff };
  }

  let updatedNodes = { ...graph.nodes };
  const updatedSyncLock = { ...graph.syncLock };

  // Process modified files
  for (const entry of report.modified) {
    const filePath = entry.sourceRef.filePath;

    // Find D2 node for this file
    const d2Node = Object.values(graph.nodes).find(
      n => n.depth === 2 && n.sourceRef?.filePath === filePath
    );
    if (!d2Node) continue;

    try {
      const content = await fileSystemService.readFile(handle, filePath);
      const language = detectLanguage(filePath);
      const newHash = await codeParserService.computeContentHash(content);
      const newSymbols = codeParserService.extractSymbols(content, language);

      // Update D2 node sourceRef with new hash
      const updatedD2: GraphNode = {
        ...d2Node,
        sourceRef: d2Node.sourceRef
          ? { ...d2Node.sourceRef, contentHash: newHash }
          : null,
      };
      updatedNodes[d2Node.id] = updatedD2;

      // Get current D3 children (depth 3, parentId === d2Node.id)
      const currentD3Children = Object.values(graph.nodes).filter(
        n => n.depth === 3 && n.parentId === d2Node.id
      );

      // Compute new D3 nodes from symbols
      const newSymbolKeys = new Set(newSymbols.map(s => `${s.name}::${s.kind}`));
      const existingD3Map = new Map<string, GraphNode>(
        currentD3Children.map(n => [`${n.name}::${n.kind}`, n])
      );

      // Update existing D3 nodes with per-symbol content hash
      for (const sym of newSymbols) {
        const key = `${sym.name}::${sym.kind}`;
        const existing = existingD3Map.get(key);
        if (existing) {
          const lines = content.split('\n');
          const symBody = lines.slice(Math.max(0, sym.lineStart - 1), sym.lineEnd).join('\n');
          const symHash = await codeParserService.computeContentHash(symBody);
          updatedNodes[existing.id] = {
            ...existing,
            sourceRef: existing.sourceRef
              ? { ...existing.sourceRef, lineStart: sym.lineStart, lineEnd: sym.lineEnd, contentHash: symHash }
              : null,
          };
        }
      }

      // Add new symbols not in existing D3 children
      for (const sym of newSymbols) {
        const key = `${sym.name}::${sym.kind}`;
        if (!existingD3Map.has(key)) {
          const newId = Math.random().toString(36).substr(2, 9);
          const kindMap: Record<string, GraphNodeKind> = {
            class: 'class',
            function: 'function',
            interface: 'interface',
            variable: 'variable',
          };
          const lines = content.split('\n');
          const symBody = lines.slice(Math.max(0, sym.lineStart - 1), sym.lineEnd).join('\n');
          const symHash = await codeParserService.computeContentHash(symBody);
          const newNode: GraphNode = {
            id: newId,
            name: sym.name,
            kind: (kindMap[sym.kind] ?? 'function') as GraphNodeKind,
            depth: 3 as GraphDepth,
            parentId: d2Node.id,
            children: [],
            sourceRef: {
              filePath,
              lineStart: sym.lineStart,
              lineEnd: sym.lineEnd,
              contentHash: symHash,
            },
            tags: [],
            lensConfig: {},
            domainProjections: [],
          };
          updatedNodes[newId] = newNode;
          // Add to D2 node's children
          const prevD2 = updatedNodes[d2Node.id];
          updatedNodes[d2Node.id] = {
            ...prevD2,
            children: [...prevD2.children, newId],
          };
        }
      }

      // Remove obsolete D3 nodes (exist in current D3 but not in new symbols)
      for (const child of currentD3Children) {
        const key = `${child.name}::${child.kind}`;
        if (!newSymbolKeys.has(key)) {
          delete updatedNodes[child.id];
          // Remove from D2 children list
          const prevD2 = updatedNodes[d2Node.id];
          updatedNodes[d2Node.id] = {
            ...prevD2,
            children: prevD2.children.filter(cid => cid !== child.id),
          };
        }
      }

      // Update syncLock entry to locked with new hash
      updatedSyncLock[entry.nodeId] = {
        ...entry,
        sourceRef: { ...entry.sourceRef, contentHash: newHash },
        status: 'locked',
        lastChecked: Date.now(),
      };
    } catch {
      // If re-read fails, mark as missing
      updatedSyncLock[entry.nodeId] = {
        ...entry,
        status: 'missing',
        lastChecked: Date.now(),
      };
    }
  }

  // Process missing files: update syncLock but don't remove nodes
  for (const entry of report.missing) {
    updatedSyncLock[entry.nodeId] = {
      ...entry,
      status: 'missing',
      lastChecked: Date.now(),
    };
  }

  const updatedGraph: CodeGraph = {
    ...graph,
    nodes: updatedNodes,
    syncLock: updatedSyncLock,
    updatedAt: Date.now(),
  };

  const diff = diffGraphs(graph, updatedGraph);
  return { graph: updatedGraph, diff };
}

export const codeGraphSyncService = {
  detectChanges,
  applySyncReport,
  fullResync,
  computeGraphStatus,
  diffGraphs,
  incrementalResync,
};
