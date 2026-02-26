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
import type { LogEntryFn } from './codeGraphAgentService';

export const DEMO_OWNER = 'Nathanf22';
export const DEMO_REPO = 'BlueLens';
export const DEMO_BRANCH = 'main';
export const DEMO_REPO_ID = '__github_bluelens_demo__';

// Routes through Vite's proxy to avoid browser extensions injecting bad auth headers.
// In dev: vite dev server proxies /proxy/github-* → api.github.com / raw.githubusercontent.com
// In preview: same proxy is configured under vite.config.ts `preview.proxy`
const GITHUB_API_BASE = '/proxy/github-api';
const GITHUB_RAW_BASE = `/proxy/github-raw/${DEMO_OWNER}/${DEMO_REPO}/${DEMO_BRANCH}`;

// Also export for use in App.tsx View Code handler
export const DEMO_RAW_BASE = GITHUB_RAW_BASE;

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
  onProgress?: DemoProgressCallback,
  onLogEntry?: LogEntryFn,
): Promise<CodeGraph> {
  // Requests go through Vite's local proxy so the browser never talks directly
  // to api.github.com — this bypasses browser extensions that inject invalid
  // Authorization headers (causing 401 errors).
  const treeUrl = `${GITHUB_API_BASE}/repos/${DEMO_OWNER}/${DEMO_REPO}/git/trees/${DEMO_BRANCH}?recursive=1`;

  // 1. Fetch file tree
  onProgress?.('Fetching repository structure', 0, 1);
  onLogEntry?.('scan', `Fetching ${DEMO_OWNER}/${DEMO_REPO} file tree…`);

  let treeRes: Response;
  try {
    treeRes = await fetch(treeUrl);
  } catch (e: any) {
    throw new Error(`Network error: could not reach GitHub API. (${e?.message ?? e})`);
  }

  if (treeRes.status === 403 || treeRes.status === 429) {
    throw new Error('GitHub API rate limit exceeded (60 req/hour). Please wait a minute and try again.');
  }
  if (!treeRes.ok) {
    let detail = `HTTP ${treeRes.status}`;
    try {
      const body = await treeRes.json();
      if (body?.message) detail += ` — ${body.message}`;
    } catch { /* ignore */ }
    throw new Error(`Failed to fetch repository tree: ${detail}`);
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

  onLogEntry?.('scan', `Found ${sourceFiles.length} source files (.ts/.tsx)`);

  // 3. Fetch each file and analyze
  const analyzedFiles: AnalyzedFile[] = [];
  const externalDeps = new Set<string>();
  const entryPoints: string[] = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const item = sourceFiles[i];
    onProgress?.('Fetching files', i + 1, sourceFiles.length);
    if (i % 10 === 0 || i === sourceFiles.length - 1) {
      onLogEntry?.('scan', `Fetching files (${i + 1}/${sourceFiles.length})`, item.path);
    }

    const rawUrl = `${GITHUB_RAW_BASE}/${item.path}`;
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

  onLogEntry?.('scan', `Scan complete: ${analyzedFiles.length} files, ${analyzedFiles.reduce((s, f) => s + f.symbols.length, 0)} symbols`);

  // 4. Build CodebaseAnalysis and apply heuristic grouping
  onProgress?.('Building graph', 0, 1);
  onLogEntry?.('info', 'Grouping files by functional heuristics');
  const rawAnalysis = buildAnalysis(analyzedFiles, entryPoints, externalDeps);
  const analysis = groupByFunctionalHeuristics(rawAnalysis);
  onLogEntry?.('info', `Grouped into ${analysis.modules.length} modules`);

  // 5. Parse to CodeGraph
  const graph = await codeToGraphParserService.parseCodebaseToGraph(
    analysis,
    DEMO_REPO_ID,
    `${DEMO_OWNER}/${DEMO_REPO}`,
    workspaceId,
    undefined,
    undefined,
    onProgress,
    onLogEntry,
  );

  onLogEntry?.('info', `Demo graph ready — ${Object.keys(graph.nodes).length} nodes`);
  return graph;
}

export const githubDemoService = {
  loadGithubDemoGraph,
};
