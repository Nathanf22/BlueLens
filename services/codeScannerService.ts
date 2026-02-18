// TODO(DELETE): SCAN FEATURE — This entire file is marked for removal.
// The diagram↔code divergence scan is superseded by the CodeGraph system
// which provides richer, structured code analysis. Remove this file along
// with useScanHandlers.ts, ScanResultsPanel.tsx, and all related wiring in
// App.tsx, ModalManager, WorkspaceView, PreviewToolbar, and types.ts.
// See KNOWN_ISSUES.md for context.

/**
 * On-demand code scanning and divergence detection.
 * Recursively walks a repo directory, extracts symbols, and compares with diagram nodes.
 */

import { ScannedEntity, DiagramNodeInfo, ScanResult, ScanMatch, SyncSuggestion, ScanConfig } from '../types';
import { fileSystemService } from './fileSystemService';
import { codeParserService } from './codeParserService';

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);

function matchesGlob(path: string, pattern: string): boolean {
  // Simple glob matching: supports *, ** and basic patterns
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(`^${regexStr}$`).test(path);
}

function matchesAnyGlob(path: string, patterns: string[]): boolean {
  return patterns.some(p => matchesGlob(path, p));
}

function matchesSymbolPattern(name: string, patterns: string[]): boolean {
  return patterns.some(p => {
    if (p.endsWith('*')) {
      return name.startsWith(p.slice(0, -1));
    }
    if (p.startsWith('*')) {
      return name.endsWith(p.slice(1));
    }
    return name === p;
  });
}

async function collectFiles(
  handle: FileSystemDirectoryHandle,
  basePath: string = '',
  scanConfig?: ScanConfig
): Promise<{ path: string; content: string; language: string }[]> {
  const files: { path: string; content: string; language: string }[] = [];
  const entries = await fileSystemService.listDirectory(handle, basePath);

  for (const entry of entries) {
    if (entry.kind === 'directory') {
      // Skip excluded directories
      if (scanConfig?.excludePaths && matchesAnyGlob(entry.path + '/', scanConfig.excludePaths)) {
        continue;
      }
      const subFiles = await collectFiles(handle, entry.path, scanConfig);
      files.push(...subFiles);
    } else {
      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        // Apply include/exclude path filters
        if (scanConfig?.includePaths && scanConfig.includePaths.length > 0) {
          if (!matchesAnyGlob(entry.path, scanConfig.includePaths)) continue;
        }
        if (scanConfig?.excludePaths && matchesAnyGlob(entry.path, scanConfig.excludePaths)) {
          continue;
        }

        try {
          const content = await fileSystemService.readFile(handle, entry.path);
          const language = fileSystemService.getLanguage(entry.name);
          files.push({ path: entry.path, content, language });
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  return files;
}

function scanFiles(
  files: { path: string; content: string; language: string }[],
  repoId: string,
  scanConfig?: ScanConfig
): ScannedEntity[] {
  const entities: ScannedEntity[] = [];

  for (const file of files) {
    const symbols = codeParserService.extractSymbols(file.content, file.language);
    for (const sym of symbols) {
      // Apply ignore patterns to symbol names
      if (scanConfig?.ignorePatterns && matchesSymbolPattern(sym.name, scanConfig.ignorePatterns)) {
        continue;
      }
      entities.push({
        name: sym.name,
        kind: sym.kind,
        filePath: file.path,
        lineStart: sym.lineStart,
        lineEnd: sym.lineEnd,
        repoId,
      });
    }
  }

  return entities;
}

function normalizeForComparison(str: string): string {
  return str.toLowerCase().replace(/[_\-\s]/g, '');
}

function compareEntitiesWithDiagram(
  entities: ScannedEntity[],
  nodes: DiagramNodeInfo[]
): { matches: ScanMatch[]; missingInDiagram: ScannedEntity[]; missingInCode: DiagramNodeInfo[]; suggestions: SyncSuggestion[] } {
  const matches: ScanMatch[] = [];
  const matchedEntityIndices = new Set<number>();
  const matchedNodeIds = new Set<string>();

  // Pass 1: exact name match (case-insensitive)
  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const normalizedEntity = normalizeForComparison(entity.name);

    for (const node of nodes) {
      if (matchedNodeIds.has(node.nodeId)) continue;
      const normalizedLabel = normalizeForComparison(node.label);

      if (normalizedEntity === normalizedLabel) {
        matches.push({ nodeId: node.nodeId, nodeLabel: node.label, entity, confidence: 'exact' });
        matchedEntityIndices.add(ei);
        matchedNodeIds.add(node.nodeId);
        break;
      }
    }
  }

  // Pass 2: fuzzy substring match for remaining
  for (let ei = 0; ei < entities.length; ei++) {
    if (matchedEntityIndices.has(ei)) continue;
    const entity = entities[ei];
    const normalizedEntity = normalizeForComparison(entity.name);

    for (const node of nodes) {
      if (matchedNodeIds.has(node.nodeId)) continue;
      const normalizedLabel = normalizeForComparison(node.label);

      if (
        normalizedLabel.includes(normalizedEntity) ||
        normalizedEntity.includes(normalizedLabel)
      ) {
        matches.push({ nodeId: node.nodeId, nodeLabel: node.label, entity, confidence: 'fuzzy' });
        matchedEntityIndices.add(ei);
        matchedNodeIds.add(node.nodeId);
        break;
      }
    }
  }

  const missingInDiagram = entities.filter((_, i) => !matchedEntityIndices.has(i));
  const missingInCode = nodes.filter(n => !matchedNodeIds.has(n.nodeId));

  // Build typed suggestions
  const suggestions: SyncSuggestion[] = [];

  for (const entity of missingInDiagram) {
    suggestions.push({
      type: 'add_component',
      label: `Add "${entity.name}"`,
      description: `${entity.kind} found in ${entity.filePath} is not represented in the diagram`,
      entity,
      confidence: 'exact',
    });
  }

  for (const node of missingInCode) {
    suggestions.push({
      type: 'mark_obsolete',
      label: `Mark "${node.label}" obsolete`,
      description: `Diagram node "${node.label}" has no matching symbol in code`,
      nodeInfo: node,
      confidence: 'heuristic',
    });
  }

  // Check fuzzy matches for potential relationship updates
  for (const match of matches) {
    if (match.confidence === 'fuzzy') {
      suggestions.push({
        type: 'update_relationship',
        label: `Rename "${match.nodeLabel}" to "${match.entity.name}"`,
        description: `Fuzzy match: diagram node "${match.nodeLabel}" may correspond to code symbol "${match.entity.name}"`,
        entity: match.entity,
        nodeInfo: { nodeId: match.nodeId, label: match.nodeLabel },
        confidence: 'fuzzy',
      });
    }
  }

  return { matches, missingInDiagram, missingInCode, suggestions };
}

export const codeScannerService = {
  async fullScan(
    repoId: string,
    repoName: string,
    diagramId: string,
    diagramNodes: DiagramNodeInfo[],
    scanConfig?: ScanConfig
  ): Promise<ScanResult> {
    const handle = fileSystemService.getHandle(repoId);
    if (!handle) {
      throw new Error('Repository is disconnected. Please reopen it from the Repo Manager.');
    }

    const files = await collectFiles(handle, '', scanConfig);
    const entities = scanFiles(files, repoId, scanConfig);
    const { matches, missingInDiagram, missingInCode, suggestions } = compareEntitiesWithDiagram(entities, diagramNodes);

    return {
      repoId,
      repoName,
      scannedAt: Date.now(),
      diagramId,
      entities,
      matches,
      missingInDiagram,
      missingInCode,
      suggestions,
    };
  },
};
