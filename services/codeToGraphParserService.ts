/**
 * Transforms a CodebaseAnalysis (from codebaseAnalyzerService) into a CodeGraph.
 *
 * Depth hierarchy:
 *   D0: system root (repo)
 *   D1: package/module (top-level directory)
 *   D2: module/file
 *   D3: class/function/interface/variable
 */

import {
  CodeGraph, GraphNode, GraphDepth, GraphNodeKind,
  CodebaseAnalysis, CodebaseModule, AnalyzedFile, ScannedEntity,
  SyncLockEntry, SourceReference, CodeGraphConfig, ScanConfig,
} from '../types';
import type { LogEntryFn } from './codeGraphAgentService';
import { codeGraphModelService } from './codeGraphModelService';
import { codeParserService } from './codeParserService';
import { fileSystemService } from './fileSystemService';
import { DiffResult } from './ArchitectureDiff';

const generateId = () => Math.random().toString(36).substr(2, 9);

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', ''];
const INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/**
 * Resolve an import specifier to an actual file path.
 * Handles relative (`./`, `../`) and alias (`@/`) imports.
 */
function resolveImportToFile(
  importSource: string,
  currentFile: string,
  allFiles: string[],
): string | null {
  let basePath: string;

  if (importSource.startsWith('.')) {
    const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
    const parts = importSource.split('/');
    let resolved = currentDir;
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        const idx = resolved.lastIndexOf('/');
        resolved = idx >= 0 ? resolved.substring(0, idx) : '';
      } else {
        resolved = resolved ? `${resolved}/${part}` : part;
      }
    }
    basePath = resolved;
  } else if (importSource.startsWith('@/')) {
    basePath = importSource.slice(2);
  } else {
    return null;
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = basePath + ext;
    if (allFiles.includes(candidate)) return candidate;
  }

  for (const idx of INDEX_SUFFIXES) {
    const candidate = basePath + idx;
    if (allFiles.includes(candidate)) return candidate;
  }

  return null;
}

function symbolKindToNodeKind(kind: ScannedEntity['kind']): GraphNodeKind {
  switch (kind) {
    case 'class': return 'class';
    case 'function': return 'function';
    case 'interface': return 'interface';
    case 'variable': return 'variable';
    default: return 'function';
  }
}

export async function parseCodebaseToGraph(
  analysis: CodebaseAnalysis,
  repoId: string,
  repoName: string,
  workspaceId: string,
  handle?: FileSystemDirectoryHandle,
  config?: CodeGraphConfig,
  onProgress?: (message: string, current: number, total: number) => void,
  onLogEntry?: LogEntryFn,
  diffResult?: DiffResult,
): Promise<CodeGraph> {
  let graph = codeGraphModelService.createEmptyGraph(workspaceId, repoId, repoName);
  const rootId = graph.rootNodeId;
  const totalFiles = analysis.modules.reduce((sum, m) => sum + m.files.length, 0);

  // Maps for cross-referencing
  const moduleIdMap = new Map<string, string>();   // moduleName → nodeId
  const fileIdMap = new Map<string, string>();      // filePath → nodeId
  const symbolIdMap = new Map<string, string>();    // "filePath:symbolName" → nodeId

  // D1: Modules/packages
  onProgress?.('Creating modules', 0, totalFiles);
  onLogEntry?.('parse', `Creating ${analysis.modules.length} modules`);
  for (const mod of analysis.modules) {
    const nodeId = generateId();
    moduleIdMap.set(mod.name, nodeId);

    const tags = [];
    if (diffResult) {
      if (diffResult.added.includes(mod.path)) tags.push('diff:added');
      else if (diffResult.modified.includes(mod.path)) tags.push('diff:modified');
    }

    const node: GraphNode = {
      id: nodeId,
      name: mod.name,
      description: mod.description,
      kind: 'package',
      depth: 1,
      parentId: rootId,
      children: [],
      sourceRef: null,
      tags,
      lensConfig: {},
      domainProjections: [],
    };

    const result = codeGraphModelService.addNode(graph, node);
    graph = result.graph;

    // D1 → D0 containment
    const containResult = codeGraphModelService.addRelation(graph, rootId, nodeId, 'contains');
    graph = containResult.graph;
  }

  // D2: Files
  let fileCounter = 0;
  for (const mod of analysis.modules) {
    const moduleNodeId = moduleIdMap.get(mod.name)!;

    for (const file of mod.files) {
      fileCounter++;
      onProgress?.('Processing files', fileCounter, totalFiles);
      if (fileCounter % 10 === 0 || fileCounter === totalFiles) {
        onLogEntry?.('parse', `Processing files (${fileCounter}/${totalFiles})`, file.filePath.split('/').pop());
      }
      const fileNodeId = generateId();
      fileIdMap.set(file.filePath, fileNodeId);

      // Compute hash if handle available
      let contentHash = '';
      if (handle) {
        try {
          const content = await fileSystemService.readFile(handle, file.filePath);
          contentHash = await codeParserService.computeContentHash(content);
        } catch { /* skip */ }
      }

      // Always populate sourceRef so "View Code" works regardless of whether
      // a FS handle was available (GitHub repos have no handle, hence no contentHash).
      const sourceRef: SourceReference = {
        filePath: file.filePath,
        lineStart: 1,
        lineEnd: file.size > 0 ? 9999 : 1,
        contentHash, // empty string when no handle; sync service ignores empty-hash entries
      };

      const tags = [file.language];
      if (diffResult) {
        if (diffResult.added.includes(file.filePath)) tags.push('diff:added');
        else if (diffResult.modified.includes(file.filePath)) tags.push('diff:modified');
      }

      const node: GraphNode = {
        id: fileNodeId,
        name: file.filePath.split('/').pop() || file.filePath,
        kind: 'module',
        depth: 2,
        parentId: moduleNodeId,
        children: [],
        sourceRef,
        tags,
        lensConfig: {},
        domainProjections: [],
      };

      const result = codeGraphModelService.addNode(graph, node);
      graph = result.graph;

      // D2 → D1 containment
      const containResult = codeGraphModelService.addRelation(graph, moduleNodeId, fileNodeId, 'contains');
      graph = containResult.graph;

      // SyncLock only when we have a real hash (local repos with a connected handle)
      if (contentHash) {
        graph.syncLock[fileNodeId] = {
          nodeId: fileNodeId,
          sourceRef,
          status: 'locked',
          lastChecked: Date.now(),
        };
      }

      // D3: Symbols
      for (const sym of file.symbols) {
        const symNodeId = generateId();
        const symKey = `${file.filePath}:${sym.name}`;
        symbolIdMap.set(symKey, symNodeId);

        const symSourceRef: SourceReference = {
          filePath: file.filePath,
          lineStart: sym.lineStart,
          lineEnd: sym.lineEnd,
          contentHash: '', // Symbol-level hash computed only during sync
        };

        const symTags = [sym.kind];
        const fileDiffTag = tags.find(t => t.startsWith('diff:'));
        if (fileDiffTag) {
          symTags.push(fileDiffTag);
        }

        const symNode: GraphNode = {
          id: symNodeId,
          name: sym.name,
          kind: symbolKindToNodeKind(sym.kind as any),
          depth: 3,
          parentId: fileNodeId,
          children: [],
          sourceRef: symSourceRef,
          tags: symTags,
          lensConfig: {},
          domainProjections: [],
        };

        const symResult = codeGraphModelService.addNode(graph, symNode);
        graph = symResult.graph;

        // D3 → D2 containment
        const symContainResult = codeGraphModelService.addRelation(graph, fileNodeId, symNodeId, 'contains');
        graph = symContainResult.graph;
      }
    }
  }

  // Relations from imports: file-level depends_on
  onLogEntry?.('resolve', `Resolving dependencies (${totalFiles} files)`);
  const allFilePaths = Array.from(fileIdMap.keys());
  let importCounter = 0;
  for (const mod of analysis.modules) {
    for (const file of mod.files) {
      importCounter++;
      onProgress?.('Resolving dependencies', importCounter, totalFiles);
      const fileNodeId = fileIdMap.get(file.filePath);
      if (!fileNodeId) continue;

      for (const imp of file.imports) {
        if (imp.isExternal && !imp.source.startsWith('@/')) continue;

        const resolved = resolveImportToFile(imp.source, file.filePath, allFilePaths);
        if (!resolved) continue;

        const targetNodeId = fileIdMap.get(resolved);
        if (targetNodeId && targetNodeId !== fileNodeId) {
          const depResult = codeGraphModelService.addRelation(graph, fileNodeId, targetNodeId, 'depends_on', imp.name);
          graph = depResult.graph;
        }
      }
    }
  }

  // Relations from class hierarchy
  if (handle) {
    onLogEntry?.('hierarchy', `Analyzing class hierarchy (${totalFiles} files)`);
    let hierarchyCounter = 0;
    for (const mod of analysis.modules) {
      for (const file of mod.files) {
        hierarchyCounter++;
        onProgress?.('Analyzing class hierarchy', hierarchyCounter, totalFiles);
        try {
          const content = await fileSystemService.readFile(handle, file.filePath);
          const language = fileSystemService.getLanguage(file.filePath);
          const hierarchy = codeParserService.extractClassHierarchy(content, language);

          for (const entry of hierarchy) {
            const sourceKey = `${file.filePath}:${entry.name}`;
            const sourceId = symbolIdMap.get(sourceKey);
            if (!sourceId) continue;

            if (entry.extends) {
              // Find target across all files
              for (const [key, targetId] of symbolIdMap) {
                if (key.endsWith(`:${entry.extends}`)) {
                  const inhResult = codeGraphModelService.addRelation(graph, sourceId, targetId, 'inherits');
                  graph = inhResult.graph;
                  break;
                }
              }
            }

            for (const impl of entry.implements) {
              for (const [key, targetId] of symbolIdMap) {
                if (key.endsWith(`:${impl}`)) {
                  const implResult = codeGraphModelService.addRelation(graph, sourceId, targetId, 'implements');
                  graph = implResult.graph;
                  break;
                }
              }
            }
          }

          // Call references
          const allSymbolNames = file.symbols.map(s => s.name);
          const calls = codeParserService.extractCallReferences(content, language, allSymbolNames);
          for (const call of calls) {
            const callerKey = `${file.filePath}:${call.caller}`;
            const callerId = symbolIdMap.get(callerKey);
            // Look for callee across all files
            for (const [key, calleeId] of symbolIdMap) {
              if (key.endsWith(`:${call.callee}`) && calleeId !== callerId) {
                const callResult = codeGraphModelService.addRelation(graph, callerId!, calleeId, 'calls');
                graph = callResult.graph;
                break;
              }
            }
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  // Module-level depends_on from CodebaseModule.dependencies
  for (const mod of analysis.modules) {
    const sourceModId = moduleIdMap.get(mod.name);
    if (!sourceModId) continue;

    for (const depName of mod.dependencies) {
      const targetModId = moduleIdMap.get(depName);
      if (targetModId) {
        const depResult = codeGraphModelService.addRelation(graph, sourceModId, targetModId, 'depends_on');
        graph = depResult.graph;
      }
    }
  }

  // Handle phantom removed nodes
  if (diffResult) {
    onLogEntry?.('parse', `Adding ${diffResult.removed.length} removed items`);
    for (const removedPath of diffResult.removed) {
      // Very simple heuristic: if it looks like a module path (shallow)
      const isModuleLevel = !removedPath.includes('/') || removedPath.split('/').length <= 2;
      const nodeId = generateId();
      const name = (removedPath.split('/').pop() || removedPath) + ' (REMOVED)';

      if (isModuleLevel) {
        const node: GraphNode = {
          id: nodeId, name, kind: 'package', depth: 1, parentId: rootId,
          children: [], sourceRef: null, tags: ['diff:removed'], lensConfig: {}, domainProjections: [],
        };
        const result = codeGraphModelService.addNode(graph, node);
        graph = result.graph;
        const containResult = codeGraphModelService.addRelation(graph, rootId, nodeId, 'contains');
        graph = containResult.graph;
      } else {
        // Try to place in the parent module if the module still exists
        // E.g., if removedPath is "src/components/Button.tsx", try to find a module that contains "src/components"
        // This is a rough estimation since we don't have the old architecture. We place it in root if we can't find a parent.
        let parentId = rootId;
        for (const mod of analysis.modules) {
          if (removedPath.startsWith(mod.path + '/')) {
            parentId = moduleIdMap.get(mod.name) || rootId;
            break;
          }
        }

        const node: GraphNode = {
          id: nodeId, name, kind: 'module', depth: 2, parentId,
          children: [], sourceRef: null, tags: ['diff:removed'], lensConfig: {}, domainProjections: [],
        };
        const result = codeGraphModelService.addNode(graph, node);
        graph = result.graph;
        const containResult = codeGraphModelService.addRelation(graph, parentId, nodeId, 'contains');
        graph = containResult.graph;
      }
    }
  }

  // Post-processing: Bubble up diff tags so parent modules get colored even if AI grouping changed their paths
  if (diffResult) {
    const propagateDiffTags = (nodeId: string): boolean => {
      const node = graph.nodes[nodeId];
      if (!node) return false;

      let hasDiffDescendant = false;
      for (const childId of node.children) {
        if (propagateDiffTags(childId)) {
          hasDiffDescendant = true;
        }
      }

      const hasDirectDiff = node.tags.some(t => t.startsWith('diff:'));
      if (hasDiffDescendant && !hasDirectDiff) {
        node.tags.push('diff:modified');
      }

      return hasDirectDiff || hasDiffDescendant;
    };

    // Start propagation from root's children, since root typically doesn't need a tag
    for (const childId of graph.nodes[rootId].children) {
      propagateDiffTags(childId);
    }
  }

  return graph;
}

export const codeToGraphParserService = {
  parseCodebaseToGraph,
};
