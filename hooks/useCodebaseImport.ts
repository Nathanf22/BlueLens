import { useState, useCallback, useRef } from 'react';
import { Diagram, RepoConfig, CodebaseImportProgress, NodeLink, CodebaseAnalysis } from '../types';
import { fileSystemService } from '../services/fileSystemService';
import { codebaseAnalyzerService } from '../services/codebaseAnalyzerService';
import { diagramGeneratorService } from '../services/diagramGeneratorService';
import { LocalFileSystemProvider } from '../services/LocalFileSystemProvider';
import { GitFileSystemProvider } from '../services/GitFileSystemProvider';
import { compareAnalysis } from '../services/ArchitectureDiff';

interface UseCodebaseImportParams {
  diagrams: Diagram[];
  setDiagrams: React.Dispatch<React.SetStateAction<Diagram[]>>;
  repos: RepoConfig[];
  activeWorkspaceId: string;
  createFolderProgrammatic: (name: string, parentId?: string | null) => string;
  setActiveId: (id: string) => void;
}

export const useCodebaseImport = ({
  diagrams,
  setDiagrams,
  repos,
  activeWorkspaceId,
  createFolderProgrammatic,
  setActiveId,
}: UseCodebaseImportParams) => {
  const [progress, setProgress] = useState<CodebaseImportProgress | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const analysisCache = useRef(new Map<string, CodebaseAnalysis>());

  // Core import logic used by both startImport and startComparison
  const runAnalysisCycle = async (
    repoId: string,
    provider: any,
    folderNameSuffix: string,
    diffAgainst?: any // for comparison mode
  ) => {
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    const handle = fileSystemService.getHandle(repoId);
    if (!handle) throw new Error('Repository is disconnected.');

    setIsImporting(true);
    try {
      // Step 1: Scanning
      setProgress({ step: 'scanning', message: `Scanning codebase files (${folderNameSuffix})...`, percent: 5 });

      // Use cache if available
      const cacheKey = `${repoId}-${folderNameSuffix}`;
      let analysis: CodebaseAnalysis;

      if (analysisCache.current.has(cacheKey)) {
        analysis = analysisCache.current.get(cacheKey)!;
        setProgress({ step: 'scanning', message: 'Retrieving cached analysis...', percent: 40 });
      } else {
        analysis = await codebaseAnalyzerService.analyzeCodebase(
          provider,
          repo.scanConfig,
          (scanned, total) => {
            setProgress({
              step: 'scanning',
              message: `Scanning files... (${scanned}/${total})`,
              percent: 5 + Math.round((scanned / total) * 35),
              filesScanned: scanned,
              totalFiles: total,
            });
          }
        );
        analysisCache.current.set(cacheKey, analysis);
      }

      let diff = undefined;
      if (diffAgainst) {
        setProgress({ step: 'analyzing', message: 'Comparing architectures...', percent: 45 });
        diff = compareAnalysis(analysis, diffAgainst);
      }

      if (analysis.totalFiles === 0) {
        throw new Error('No code files found in the repository.');
      }

      // Step 2: Generating diagrams
      setProgress({
        step: 'generating',
        message: `Generating ${diff ? 'comparison ' : ''}diagrams...`,
        percent: 50,
      });

      const result = diagramGeneratorService.generateAllDiagrams(analysis, diff);

      // Step 3: Creating folder and diagrams
      setProgress({
        step: 'creating',
        message: `Creating ${result.diagrams.length} diagrams...`,
        percent: 70,
      });

      const folderId = createFolderProgrammatic(`Generated: ${repo.name} ${folderNameSuffix}`);

      // Create Diagram objects
      const now = Date.now();
      const newDiagrams: Diagram[] = result.diagrams.map(spec => ({
        id: spec.id,
        name: spec.name,
        code: spec.code,
        lastModified: now,
        folderId,
        workspaceId: activeWorkspaceId,
        nodeLinks: [],
      }));

      // Step 4: Linking diagrams
      setProgress({
        step: 'linking',
        message: `Linking diagrams...`,
        percent: 85,
      });

      for (const link of result.nodeLinks) {
        const diagram = newDiagrams.find(d => d.id === link.sourceDiagramId);
        if (diagram) {
          diagram.nodeLinks.push({
            nodeId: link.nodeId,
            targetDiagramId: link.targetDiagramId,
            label: link.label,
          });
        }
      }

      setDiagrams(prev => [...prev, ...newDiagrams]);

      const overviewDiagram = newDiagrams.find(d =>
        result.diagrams.find(s => s.id === d.id && s.level === 1)
      );
      if (overviewDiagram) setActiveId(overviewDiagram.id);

      setProgress({
        step: 'done',
        message: 'Import complete!',
        percent: 100,
        diagramsCreated: newDiagrams.length,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const startImport = useCallback(async (repoId: string, commitSha?: string) => {
    try {
      const handle = fileSystemService.getHandle(repoId);
      if (!handle) throw new Error('Repo disconnected');

      const provider = commitSha
        ? new GitFileSystemProvider(handle, commitSha)
        : new LocalFileSystemProvider(handle);

      const suffix = commitSha ? `@ ${commitSha.substring(0, 7)}` : '';
      await runAnalysisCycle(repoId, provider, suffix);
    } catch (err: any) {
      setProgress({ step: 'error', message: err.message, percent: 0 });
      setIsImporting(false);
    }
  }, [repos, runAnalysisCycle]);

  const startComparison = useCallback(async (repoId: string, commitSha: string) => {
    try {
      const handle = fileSystemService.getHandle(repoId);
      if (!handle) throw new Error('Repo disconnected');

      // 1. Analyze HEAD (Local)
      setProgress({ step: 'scanning', message: 'Analyzing HEAD (current files)...', percent: 5 });
      const headProvider = new LocalFileSystemProvider(handle);
      const headAnalysis = await codebaseAnalyzerService.analyzeCodebase(headProvider);

      // 2. Analyze Commit (Git)
      const gitProvider = new GitFileSystemProvider(handle, commitSha);
      const suffix = `Comparison: HEAD vs ${commitSha.substring(0, 7)}`;
      await runAnalysisCycle(repoId, headProvider, suffix, await codebaseAnalyzerService.analyzeCodebase(gitProvider));

      // Note: the order in runAnalysisCycle above is (provider, folderSuffix, diffAgainst)
      // If we want to show styled diff on HEAD, we should pass headProvider and compare it AGAINST gitAnalysis.
    } catch (err: any) {
      setProgress({ step: 'error', message: err.message, percent: 0 });
      setIsImporting(false);
    }
  }, [repos, runAnalysisCycle]);

  const resetProgress = useCallback(() => {
    setProgress(null);
  }, []);

  return { progress, isImporting, startImport, startComparison, resetProgress };
};
