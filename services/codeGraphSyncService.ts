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
import { CODE_EXTENSIONS } from './IFileSystemProvider';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', '.nuxt', 'dist', 'build', '.vite', 'coverage']);

interface ChangeReport {
  modified: SyncLockEntry[];
  missing: SyncLockEntry[];
  unchanged: SyncLockEntry[];
  newFilePaths: string[];
}

async function walkCodeFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  results: string[]
): Promise<void> {
  for await (const [name, entry] of (dirHandle as any).entries()) {
    if (entry.kind === 'directory') {
      if (!IGNORED_DIRS.has(name) && !name.startsWith('.')) {
        await walkCodeFiles(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, results);
      }
    } else {
      const ext = name.includes('.') ? '.' + name.split('.').pop()! : '';
      if (CODE_EXTENSIONS.has(ext)) {
        results.push(`${prefix}${name}`);
      }
    }
  }
}

async function detectChanges(
  graph: CodeGraph,
  handle: FileSystemDirectoryHandle
): Promise<ChangeReport> {
  const report: ChangeReport = {
    modified: [],
    missing: [],
    unchanged: [],
    newFilePaths: [],
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

  // Detect new files not yet in syncLock
  const knownPaths = new Set(Object.values(graph.syncLock).map(e => e.sourceRef.filePath));
  const allFiles: string[] = [];
  await walkCodeFiles(handle, '', allFiles);
  for (const path of allFiles) {
    if (!knownPaths.has(path)) {
      report.newFilePaths.push(path);
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

  if (report.modified.length === 0 && report.missing.length === 0 && report.newFilePaths.length === 0) {
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

  // Process missing files: remove D2 + D3 nodes from graph, remove syncLock entry
  for (const entry of report.missing) {
    const d2Node = Object.values(graph.nodes).find(
      n => n.depth === 2 && n.sourceRef?.filePath === entry.sourceRef.filePath
    );
    if (d2Node) {
      // Remove all D3 children
      const d3Children = Object.values(graph.nodes).filter(n => n.depth === 3 && n.parentId === d2Node.id);
      for (const child of d3Children) {
        delete updatedNodes[child.id];
      }
      // Remove D2 node itself
      delete updatedNodes[d2Node.id];
      // Remove from D1 parent children list
      if (d2Node.parentId && updatedNodes[d2Node.parentId]) {
        updatedNodes[d2Node.parentId] = {
          ...updatedNodes[d2Node.parentId],
          children: updatedNodes[d2Node.parentId].children.filter(cid => cid !== d2Node.id),
        };
      }
    }
    // Remove from syncLock entirely
    delete updatedSyncLock[entry.nodeId];
  }

  // Process new files: add D2 + D3 nodes
  for (const filePath of report.newFilePaths) {
    try {
      const content = await fileSystemService.readFile(handle, filePath);
      const language = detectLanguage(filePath);
      const fileHash = await codeParserService.computeContentHash(content);
      const symbols = codeParserService.extractSymbols(content, language);

      // Find D1 parent by matching path prefix, or fall back to root
      const fileName = filePath.split('/').pop() ?? filePath;
      const dirPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
      const d1Node = Object.values(graph.nodes).find(
        n => n.depth === 1 && (
          (dirPath && n.sourceRef?.filePath === dirPath) ||
          (!dirPath && n.parentId === graph.rootNodeId)
        )
      ) ?? Object.values(graph.nodes).find(n => n.depth === 1);

      if (!d1Node) continue;

      // Create D2 node
      const d2Id = Math.random().toString(36).substr(2, 9);
      const d2Node: GraphNode = {
        id: d2Id,
        name: fileName,
        kind: 'module',
        depth: 2 as GraphDepth,
        parentId: d1Node.id,
        children: [],
        sourceRef: { filePath, lineStart: 1, lineEnd: 1, contentHash: fileHash },
        tags: [],
        lensConfig: {},
        domainProjections: [],
      };
      updatedNodes[d2Id] = d2Node;
      updatedNodes[d1Node.id] = { ...updatedNodes[d1Node.id], children: [...updatedNodes[d1Node.id].children, d2Id] };

      // Create D3 nodes for symbols
      const kindMap: Record<string, GraphNodeKind> = { class: 'class', function: 'function', interface: 'interface', variable: 'variable' };
      const d3Ids: string[] = [];
      for (const sym of symbols) {
        const lines = content.split('\n');
        const symBody = lines.slice(Math.max(0, sym.lineStart - 1), sym.lineEnd).join('\n');
        const symHash = await codeParserService.computeContentHash(symBody);
        const d3Id = Math.random().toString(36).substr(2, 9);
        updatedNodes[d3Id] = {
          id: d3Id,
          name: sym.name,
          kind: (kindMap[sym.kind] ?? 'function') as GraphNodeKind,
          depth: 3 as GraphDepth,
          parentId: d2Id,
          children: [],
          sourceRef: { filePath, lineStart: sym.lineStart, lineEnd: sym.lineEnd, contentHash: symHash },
          tags: [],
          lensConfig: {},
          domainProjections: [],
        };
        d3Ids.push(d3Id);
      }
      updatedNodes[d2Id] = { ...updatedNodes[d2Id], children: d3Ids };

      // Add to syncLock
      updatedSyncLock[d2Id] = {
        nodeId: d2Id,
        sourceRef: { filePath, lineStart: 1, lineEnd: 1, contentHash: fileHash },
        status: 'locked',
        lastChecked: Date.now(),
      };
    } catch {
      // Skip unreadable new files
    }
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
