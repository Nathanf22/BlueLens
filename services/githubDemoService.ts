/**
 * GitHub-backed demo graph for BlueLens.
 *
 * Fetches the real Nathanf22/BlueLens repository via GitHub REST API and builds
 * a live CodeGraph from it — no local File System access required.
 *
 * "View Code" on any node opens the file via GitHub raw URL.
 */

import { CodeGraph, CodebaseAnalysis, AnalyzedFile, ScannedEntity, FileImport } from '../types';
import { codeParserService } from './codeParserService';
import { codeToGraphParserService } from './codeToGraphParserService';
import { groupByFunctionalHeuristics } from './codeGraphHeuristicGrouper';

export const DEMO_OWNER = 'Nathanf22';
export const DEMO_REPO = 'BlueLens';
export const DEMO_BRANCH = 'main';
export const DEMO_REPO_ID = '__github_bluelens_demo__';
export const DEMO_RAW_BASE = `https://raw.githubusercontent.com/${DEMO_OWNER}/${DEMO_REPO}/${DEMO_BRANCH}`;

const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx']);

const ENTRY_POINT_NAMES = new Set([
  'index.ts', 'index.tsx', 'App.tsx', 'App.ts',
  'main.ts', 'main.tsx', 'main.js',
]);

export type DemoProgressCallback = (step: string, current: number, total: number) => void;

interface GithubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

interface GithubTreeResponse {
  tree: GithubTreeItem[];
  truncated: boolean;
}

function getLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  return 'plaintext';
}

function isExternalImport(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('@/');
}

function getModuleName(filePath: string): string {
  const parts = filePath.split('/');
  return parts.length === 1 ? '(root)' : parts[0];
}

function buildAnalysis(analyzedFiles: AnalyzedFile[], entryPoints: string[], externalDeps: Set<string>): CodebaseAnalysis {
  const allFilePaths = analyzedFiles.map(f => f.filePath);
  const moduleMap = new Map<string, AnalyzedFile[]>();

  for (const file of analyzedFiles) {
    const mod = getModuleName(file.filePath);
    if (!moduleMap.has(mod)) moduleMap.set(mod, []);
    moduleMap.get(mod)!.push(file);
  }

  const modules = Array.from(moduleMap.entries()).map(([name, files]) => {
    const depSet = new Set<string>();
    for (const file of files) {
      for (const imp of file.imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImport(imp.source, file.filePath, allFilePaths);
        if (resolved) {
          const depMod = getModuleName(resolved);
          if (depMod !== name) depSet.add(depMod);
        }
      }
    }
    return { name, path: name === '(root)' ? '' : name, files, dependencies: Array.from(depSet) };
  });

  modules.sort((a, b) => {
    if (a.name === '(root)') return -1;
    if (b.name === '(root)') return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    modules,
    externalDeps: Array.from(externalDeps).sort(),
    entryPoints,
    totalFiles: analyzedFiles.length,
    totalSymbols: analyzedFiles.reduce((sum, f) => sum + f.symbols.length, 0),
  };
}

function resolveImport(source: string, currentFile: string, allFiles: string[]): string | null {
  if (!source.startsWith('.') && !source.startsWith('@/')) return null;

  let basePath: string;
  if (source.startsWith('@/')) {
    basePath = source.slice(2);
  } else {
    const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
    const parts = source.split('/');
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
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
  const indexFiles = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  for (const ext of extensions) {
    if (allFiles.includes(basePath + ext)) return basePath + ext;
  }
  for (const idx of indexFiles) {
    if (allFiles.includes(basePath + idx)) return basePath + idx;
  }
  return null;
}

export async function loadGithubDemoGraph(
  workspaceId: string,
  githubToken?: string,
  onProgress?: DemoProgressCallback,
): Promise<CodeGraph> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (githubToken) headers['Authorization'] = `token ${githubToken}`;

  // 1. Fetch file tree
  onProgress?.('Fetching repository structure', 0, 1);
  const treeUrl = `https://api.github.com/repos/${DEMO_OWNER}/${DEMO_REPO}/git/trees/${DEMO_BRANCH}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });

  if (treeRes.status === 403 || treeRes.status === 429) {
    throw new Error('GitHub API rate limit exceeded. Please wait a minute and try again.');
  }
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch repository tree: ${treeRes.statusText}`);
  }

  const treeData: GithubTreeResponse = await treeRes.json();

  // 2. Filter to relevant source files
  const sourceFiles = treeData.tree.filter(item => {
    if (item.type !== 'blob') return false;
    const ext = item.path.substring(item.path.lastIndexOf('.'));
    if (!INCLUDED_EXTENSIONS.has(ext)) return false;
    if (item.path.startsWith('node_modules/')) return false;
    if (item.path.endsWith('.d.ts')) return false;
    return true;
  });

  // 3. Fetch each file and analyze
  const analyzedFiles: AnalyzedFile[] = [];
  const externalDeps = new Set<string>();
  const entryPoints: string[] = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const item = sourceFiles[i];
    onProgress?.('Fetching files', i + 1, sourceFiles.length);

    const rawUrl = `${DEMO_RAW_BASE}/${item.path}`;
    let content = '';
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) continue;
      content = await res.text();
    } catch {
      continue;
    }

    const language = getLanguage(item.path);
    const symbols = codeParserService.extractSymbols(content, language);
    const imports = codeParserService.extractImports(content, language);
    const exportedSymbols = codeParserService.extractExports(content, language);

    for (const imp of imports) {
      if (imp.isExternal) {
        const pkgName = imp.source.startsWith('@')
          ? imp.source.split('/').slice(0, 2).join('/')
          : imp.source.split('/')[0];
        externalDeps.add(pkgName);
      }
    }

    const scannedSymbols: ScannedEntity[] = symbols.map(s => ({
      name: s.name,
      kind: s.kind,
      filePath: item.path,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      repoId: DEMO_REPO_ID,
    }));

    analyzedFiles.push({
      filePath: item.path,
      language,
      symbols: scannedSymbols,
      imports,
      exportedSymbols,
      size: content.length,
    });

    const fileName = item.path.split('/').pop() || '';
    if (ENTRY_POINT_NAMES.has(fileName)) entryPoints.push(item.path);
  }

  // 4. Build CodebaseAnalysis and apply heuristic grouping
  onProgress?.('Building graph', 0, 1);
  const rawAnalysis = buildAnalysis(analyzedFiles, entryPoints, externalDeps);
  const analysis = groupByFunctionalHeuristics(rawAnalysis);

  // 5. Parse to CodeGraph (no FileSystemDirectoryHandle — GitHub raw for View Code)
  const graph = await codeToGraphParserService.parseCodebaseToGraph(
    analysis,
    DEMO_REPO_ID,
    `${DEMO_OWNER}/${DEMO_REPO}`,
    workspaceId,
    undefined,
    undefined,
    onProgress,
  );

  return graph;
}

export const githubDemoService = {
  loadGithubDemoGraph,
};
