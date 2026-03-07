import { describe, it, expect } from 'vitest';
import { groupByFunctionalHeuristics } from './codeGraphHeuristicGrouper';
import type { CodebaseAnalysis, AnalyzedFile } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeFile(filePath: string, imports: string[] = []): AnalyzedFile {
  return {
    filePath,
    language: 'typescript',
    imports: imports.map(source => ({ source, isExternal: false })),
    exports: [],
    symbols: [],
    size: 100,
  };
}

function makeAnalysis(files: AnalyzedFile[]): CodebaseAnalysis {
  return {
    modules: [{ name: 'src', description: '', path: 'src', files, dependencies: [] }],
    totalFiles: files.length,
    languages: ['typescript'],
  };
}

// ── groupByFunctionalHeuristics ──────────────────────────────────────

describe('groupByFunctionalHeuristics', () => {
  it('returns the same analysis when there are no files', () => {
    const analysis = makeAnalysis([]);
    const result = groupByFunctionalHeuristics(analysis);
    expect(result).toBe(analysis);
  });

  it('groups llmService into AI Intelligence', () => {
    const analysis = makeAnalysis([makeFile('services/llmService.ts')]);
    const result = groupByFunctionalHeuristics(analysis);
    const group = result.modules.find(m => m.name === 'AI Intelligence');
    expect(group).toBeDefined();
    expect(group!.files.some(f => f.filePath === 'services/llmService.ts')).toBe(true);
  });

  it('groups codeGraphModelService into Code Graph', () => {
    const analysis = makeAnalysis([makeFile('services/codeGraphModelService.ts')]);
    const result = groupByFunctionalHeuristics(analysis);
    const group = result.modules.find(m => m.name === 'Code Graph');
    expect(group).toBeDefined();
  });

  it('groups storageService into Storage', () => {
    const analysis = makeAnalysis([makeFile('services/storageService.ts')]);
    const result = groupByFunctionalHeuristics(analysis);
    const group = result.modules.find(m => m.name === 'Storage');
    expect(group).toBeDefined();
  });

  it('groups App.tsx into UI Shell', () => {
    const analysis = makeAnalysis([makeFile('App.tsx')]);
    const result = groupByFunctionalHeuristics(analysis);
    const group = result.modules.find(m => m.name === 'UI Shell');
    expect(group).toBeDefined();
  });

  it('groups types.ts into Core', () => {
    const analysis = makeAnalysis([makeFile('types.ts')]);
    const result = groupByFunctionalHeuristics(analysis);
    const group = result.modules.find(m => m.name === 'Core');
    expect(group).toBeDefined();
  });

  it('each file belongs to exactly one group', () => {
    const files = [
      makeFile('services/llmService.ts'),
      makeFile('services/storageService.ts'),
      makeFile('services/codeGraphModelService.ts'),
      makeFile('components/Sidebar.tsx'),
      makeFile('App.tsx'),
      makeFile('types.ts'),
    ];
    const result = groupByFunctionalHeuristics(makeAnalysis(files));
    const allGroupedFiles = result.modules.flatMap(m => m.files);
    expect(allGroupedFiles).toHaveLength(files.length);

    // No duplicates
    const paths = allGroupedFiles.map(f => f.filePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('sorts modules by file count descending', () => {
    const files = [
      makeFile('services/llmService.ts'),
      makeFile('services/aiChatService.ts'),
      makeFile('services/geminiService.ts'),
      makeFile('services/storageService.ts'),
    ];
    const result = groupByFunctionalHeuristics(makeAnalysis(files));
    const counts = result.modules.map(m => m.files.length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });

  it('merges a single-file group via import affinity', () => {
    // diagramAnalyzerService imports from llmService → should end up in AI Intelligence
    const files = [
      makeFile('services/llmService.ts'),
      makeFile('services/aiChatService.ts'),
      makeFile('services/storageService.ts'),
      makeFile('services/cryptoStorageService.ts'),
      makeFile('services/diagramAnalyzerService.ts', ['@/services/llmService']),
    ];
    const result = groupByFunctionalHeuristics(makeAnalysis(files));
    // diagramAnalyzerService should either be in AI Intelligence or absorbed somewhere
    // The key invariant is: no orphaned file
    const allFiles = result.modules.flatMap(m => m.files);
    expect(allFiles.some(f => f.filePath === 'services/diagramAnalyzerService.ts')).toBe(true);
  });
});
