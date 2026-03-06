/**
 * Analyzes a codebase via an IFileSystemProvider to build a structured
 * CodebaseAnalysis suitable for diagram generation.
 *
 * The provider abstraction allows the same analysis pipeline to run against:
 *  - the current working tree (LocalFileSystemProvider)
 *  - any historical Git commit  (GitFileSystemProvider)
 */

import { AnalyzedFile, CodebaseModule, CodebaseAnalysis, ScanConfig, ScannedEntity } from '../types';
import { IFileSystemProvider, FileProviderEntry, getLanguage, CODE_EXTENSIONS } from './IFileSystemProvider';
import { codeParserService } from './codeParserService';

const ENTRY_POINT_NAMES = new Set([
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'main.ts', 'main.tsx', 'main.js', 'main.jsx', 'main.py',
  'app.ts', 'app.tsx', 'app.js', 'app.jsx', 'app.py',
  'App.ts', 'App.tsx', 'App.js', 'App.jsx',
  'server.ts', 'server.js', 'server.py',
  'mod.rs', 'lib.rs', 'main.rs',
  'setup.py', '__main__.py',
  'main.cpp', 'main.cc', 'main.c',
]);

function matchesGlob(path: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(path);
}

function shouldIncludeFile(filePath: string, config?: ScanConfig): boolean {
  if (!config) return true;

  if (config.includePaths.length > 0) {
    const included = config.includePaths.some(p => matchesGlob(filePath, p));
    if (!included) return false;
  }

  if (config.excludePaths.length > 0) {
    const excluded = config.excludePaths.some(p => matchesGlob(filePath, p));
    if (excluded) return false;
  }

  return true;
}

function isCodeFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf('.'));
  return CODE_EXTENSIONS.has(ext.toLowerCase());
}

/** Recursively list all code files via the provider */
async function listAllFiles(
  provider: IFileSystemProvider,
  basePath: string = '',
  config?: ScanConfig
): Promise<string[]> {
  const entries: FileProviderEntry[] = await provider.listDirectory(basePath);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.kind === 'directory') {
      const subFiles = await listAllFiles(provider, entry.path, config);
      files.push(...subFiles);
    } else if (isCodeFile(entry.name)) {
      if (shouldIncludeFile(entry.path, config)) {
        files.push(entry.path);
      }
    }
  }

  return files;
}

/** Resolve a relative import path to an actual file in the codebase */
function resolveImportPath(importSource: string, currentFile: string, allFiles: string[]): string | null {
  if (!importSource.startsWith('.')) return null;

  const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
  const parts = importSource.split('/');
  let resolved = currentDir;

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolved = resolved.substring(0, resolved.lastIndexOf('/'));
    } else {
      resolved = resolved ? `${resolved}/${part}` : part;
    }
  }

  // Try exact match, then with extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', ''];
  const indexFiles = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (allFiles.includes(candidate)) return candidate;
  }

  // Try as directory with index file
  for (const idx of indexFiles) {
    const candidate = resolved + idx;
    if (allFiles.includes(candidate)) return candidate;
  }

  return null;
}

/** Get the top-level module (directory) for a file path */
function getModuleName(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length === 1) return '(root)';
  return parts[0];
}

/** Group analyzed files into modules by top-level directory */
function groupIntoModules(files: AnalyzedFile[], allFilePaths: string[]): CodebaseModule[] {
  const moduleMap = new Map<string, AnalyzedFile[]>();

  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    if (!moduleMap.has(moduleName)) {
      moduleMap.set(moduleName, []);
    }
    moduleMap.get(moduleName)!.push(file);
  }

  const modules: CodebaseModule[] = [];

  for (const [name, moduleFiles] of moduleMap) {
    // Compute cross-module dependencies by analyzing imports
    const depSet = new Set<string>();

    for (const file of moduleFiles) {
      for (const imp of file.imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImportPath(imp.source, file.filePath, allFilePaths);
        if (resolved) {
          const depModule = getModuleName(resolved);
          if (depModule !== name) {
            depSet.add(depModule);
          }
        }
      }
    }

    modules.push({
      name,
      path: name === '(root)' ? '' : name,
      files: moduleFiles,
      dependencies: Array.from(depSet),
    });
  }

  // Sort by name, root first
  modules.sort((a, b) => {
    if (a.name === '(root)') return -1;
    if (b.name === '(root)') return 1;
    return a.name.localeCompare(b.name);
  });

  return modules;
}

export const codebaseAnalyzerService = {
  /**
   * Analyse un codebase complet via un IFileSystemProvider.
   *
   * @param provider   Accès aux fichiers — peut être local (LocalFileSystemProvider)
   *                   ou historique (GitFileSystemProvider) sans modifier cette fonction.
   * @param scanConfig Filtres include/exclude optionnels.
   * @param onProgress Callback de progression (filesScanned, totalFiles).
   */
  async analyzeCodebase(
    provider: IFileSystemProvider,
    scanConfig?: ScanConfig,
    onProgress?: (filesScanned: number, totalFiles: number) => void
  ): Promise<CodebaseAnalysis> {
    // 1. List all code files
    const allFilePaths = await listAllFiles(provider, '', scanConfig);

    // 2. Analyze each file
    const analyzedFiles: AnalyzedFile[] = [];
    const externalDeps = new Set<string>();
    const entryPoints: string[] = [];
    let totalSymbols = 0;

    for (let i = 0; i < allFilePaths.length; i++) {
      const filePath = allFilePaths[i];
      onProgress?.(i + 1, allFilePaths.length);

      try {
        const content = await provider.readFile(filePath);
        // Use the shared utility — not a provider method (amélioration #1)
        const language = getLanguage(filePath);
        const symbols = codeParserService.extractSymbols(content, language);
        const imports = codeParserService.extractImports(content, language);
        const exportedSymbols = codeParserService.extractExports(content, language);

        // Track external dependencies
        for (const imp of imports) {
          if (imp.isExternal) {
            // Normalize: @scope/pkg → @scope/pkg, lodash/merge → lodash
            const pkgName = imp.source.startsWith('@')
              ? imp.source.split('/').slice(0, 2).join('/')
              : imp.source.split('/')[0];
            externalDeps.add(pkgName);
          }
        }

        // Convert CodeSymbol[] to ScannedEntity[] for consistency
        const scannedSymbols: ScannedEntity[] = symbols.map(s => ({
          name: s.name,
          kind: s.kind,
          filePath,
          lineStart: s.lineStart,
          lineEnd: s.lineEnd,
          repoId: '',
        }));

        totalSymbols += symbols.length;

        analyzedFiles.push({
          filePath,
          language,
          symbols: scannedSymbols || [],
          imports: imports || [],
          exportedSymbols: exportedSymbols || [],
          size: content.length,
        });

        // Detect entry points
        const fileName = filePath.split('/').pop() || '';
        if (ENTRY_POINT_NAMES.has(fileName)) {
          entryPoints.push(filePath);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // 3. Group into modules
    const modules = groupIntoModules(analyzedFiles, allFilePaths);

    return {
      modules,
      externalDeps: Array.from(externalDeps).sort(),
      entryPoints,
      totalFiles: analyzedFiles.length,
      totalSymbols,
    };
  },
};
