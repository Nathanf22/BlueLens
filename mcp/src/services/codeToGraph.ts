// Node.js adaptation of bluelens' codeToGraphParserService.
// Replaces fileSystemService (browser File System Access API) with NodeFileSystemProvider.
import type {
  CodeGraph, GraphNode, GraphNodeKind, CodebaseAnalysis, ScannedEntity,
} from '../../../types.js';
import { codeGraphModelService } from '../../../services/codeGraphModelService.js';
import { codeParserService } from '../../../services/codeParserService.js';
import type { IFileSystemProvider } from '../../../services/IFileSystemProvider.js';

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', ''];
const INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function resolveImportToFile(importSource: string, currentFile: string, allFiles: string[]): string | null {
  if (!importSource.startsWith('.') && !importSource.startsWith('@/')) return null;

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
  } else {
    basePath = importSource.slice(2);
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    if (allFiles.includes(basePath + ext)) return basePath + ext;
  }
  for (const idx of INDEX_SUFFIXES) {
    if (allFiles.includes(basePath + idx)) return basePath + idx;
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
  provider?: IFileSystemProvider,
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<CodeGraph> {
  let graph = codeGraphModelService.createEmptyGraph(workspaceId, repoId, repoName);
  const rootId = graph.rootNodeId;
  const totalFiles = analysis.modules.reduce((sum, m) => sum + m.files.length, 0);

  const moduleIdMap = new Map<string, string>();
  const fileIdMap = new Map<string, string>();

  // D1: Modules
  for (const mod of analysis.modules) {
    const result = codeGraphModelService.addNode(graph, {
      name: mod.name,
      description: mod.description,
      kind: 'package',
      depth: 1,
      parentId: rootId,
      children: [],
      sourceRef: null,
      tags: [],
      lensConfig: {},
      domainProjections: [],
    });
    graph = result.graph;
    moduleIdMap.set(mod.name, result.nodeId);
  }

  // D2: Files + D3: Symbols
  let fileIdx = 0;
  for (const mod of analysis.modules) {
    const moduleNodeId = moduleIdMap.get(mod.name)!;

    for (const file of mod.files) {
      fileIdx++;
      onProgress?.(`Parsing ${file.filePath}`, fileIdx, totalFiles);

      let contentHash = '';
      if (provider) {
        try {
          const content = await provider.readFile(file.filePath);
          contentHash = await codeParserService.computeContentHash(content);
        } catch { /* skip */ }
      }

      const fileResult = codeGraphModelService.addNode(graph, {
        name: file.filePath.split('/').pop() ?? file.filePath,
        kind: 'module',
        depth: 2,
        parentId: moduleNodeId,
        children: [],
        sourceRef: contentHash
          ? { filePath: file.filePath, lineStart: 1, lineEnd: Math.max(...file.symbols.map(s => s.lineEnd), 1), contentHash }
          : null,
        tags: [file.language],
        lensConfig: {},
        domainProjections: [],
      });
      graph = fileResult.graph;
      fileIdMap.set(file.filePath, fileResult.nodeId);

      for (const symbol of file.symbols) {
        const symResult = codeGraphModelService.addNode(graph, {
          name: symbol.name,
          kind: symbolKindToNodeKind(symbol.kind),
          depth: 3,
          parentId: fileResult.nodeId,
          children: [],
          sourceRef: contentHash
            ? { filePath: file.filePath, lineStart: symbol.lineStart, lineEnd: symbol.lineEnd, contentHash }
            : null,
          tags: [],
          lensConfig: {},
          domainProjections: [],
        });
        graph = symResult.graph;
      }
    }
  }

  // Relations: file-level depends_on
  const allFiles = analysis.modules.flatMap(m => m.files.map(f => f.filePath));
  for (const mod of analysis.modules) {
    for (const file of mod.files) {
      const sourceFileId = fileIdMap.get(file.filePath);
      if (!sourceFileId) continue;
      for (const imp of file.imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImportToFile(imp.source, file.filePath, allFiles);
        if (!resolved) continue;
        const targetFileId = fileIdMap.get(resolved);
        if (!targetFileId || targetFileId === sourceFileId) continue;
        const relResult = codeGraphModelService.addRelation(graph, sourceFileId, targetFileId, 'depends_on');
        graph = relResult.graph;
      }
    }
  }

  // Relations: module-level depends_on
  for (const mod of analysis.modules) {
    const sourceModId = moduleIdMap.get(mod.name);
    if (!sourceModId) continue;
    for (const dep of mod.dependencies) {
      const targetModId = moduleIdMap.get(dep);
      if (!targetModId || targetModId === sourceModId) continue;
      const relResult = codeGraphModelService.addRelation(graph, sourceModId, targetModId, 'depends_on');
      graph = relResult.graph;
    }
  }

  return graph;
}
