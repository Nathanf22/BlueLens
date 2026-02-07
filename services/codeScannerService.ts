/**
 * On-demand code scanning and divergence detection.
 * Recursively walks a repo directory, extracts symbols, and compares with diagram nodes.
 */

import { ScannedEntity, DiagramNodeInfo, ScanResult, ScanMatch } from '../types';
import { fileSystemService } from './fileSystemService';
import { codeParserService } from './codeParserService';

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);

async function collectFiles(
  handle: FileSystemDirectoryHandle,
  basePath: string = ''
): Promise<{ path: string; content: string; language: string }[]> {
  const files: { path: string; content: string; language: string }[] = [];
  const entries = await fileSystemService.listDirectory(handle, basePath);

  for (const entry of entries) {
    if (entry.kind === 'directory') {
      const subFiles = await collectFiles(handle, entry.path);
      files.push(...subFiles);
    } else {
      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
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
  repoId: string
): ScannedEntity[] {
  const entities: ScannedEntity[] = [];

  for (const file of files) {
    const symbols = codeParserService.extractSymbols(file.content, file.language);
    for (const sym of symbols) {
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
): { matches: ScanMatch[]; missingInDiagram: ScannedEntity[]; missingInCode: DiagramNodeInfo[] } {
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

  return { matches, missingInDiagram, missingInCode };
}

export const codeScannerService = {
  async fullScan(
    repoId: string,
    repoName: string,
    diagramId: string,
    diagramNodes: DiagramNodeInfo[]
  ): Promise<ScanResult> {
    const handle = fileSystemService.getHandle(repoId);
    if (!handle) {
      throw new Error('Repository is disconnected. Please reopen it from the Repo Manager.');
    }

    const files = await collectFiles(handle);
    const entities = scanFiles(files, repoId);
    const { matches, missingInDiagram, missingInCode } = compareEntitiesWithDiagram(entities, diagramNodes);

    return {
      repoId,
      repoName,
      scannedAt: Date.now(),
      diagramId,
      entities,
      matches,
      missingInDiagram,
      missingInCode,
    };
  },
};
