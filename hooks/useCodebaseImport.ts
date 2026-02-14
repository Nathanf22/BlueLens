import { useState, useCallback } from 'react';
import { Diagram, RepoConfig, CodebaseImportProgress, NodeLink } from '../types';
import { fileSystemService } from '../services/fileSystemService';
import { codebaseAnalyzerService } from '../services/codebaseAnalyzerService';
import { diagramGeneratorService } from '../services/diagramGeneratorService';

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

  const startImport = useCallback(async (repoId: string) => {
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    const handle = fileSystemService.getHandle(repoId);
    if (!handle) {
      setProgress({
        step: 'error',
        message: 'Repository is disconnected. Please reopen it first.',
        percent: 0,
      });
      return;
    }

    setIsImporting(true);

    try {
      // Step 1: Scanning
      setProgress({ step: 'scanning', message: 'Scanning codebase files...', percent: 5 });

      const analysis = await codebaseAnalyzerService.analyzeCodebase(
        handle,
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

      if (analysis.totalFiles === 0) {
        setProgress({
          step: 'error',
          message: 'No code files found in the repository.',
          percent: 0,
        });
        setIsImporting(false);
        return;
      }

      // Step 2: Generating diagrams
      setProgress({
        step: 'generating',
        message: `Generating diagrams from ${analysis.totalFiles} files, ${analysis.totalSymbols} symbols...`,
        percent: 45,
      });

      const result = diagramGeneratorService.generateAllDiagrams(analysis);

      // Step 3: Creating folder and diagrams
      setProgress({
        step: 'creating',
        message: `Creating ${result.diagrams.length} diagrams...`,
        percent: 65,
      });

      const folderId = createFolderProgrammatic(`Generated: ${repo.name}`);

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

      // Step 4: Linking diagrams via NodeLinks
      setProgress({
        step: 'linking',
        message: `Creating ${result.nodeLinks.length} navigation links...`,
        percent: 85,
      });

      // Apply nodeLinks to source diagrams
      for (const link of result.nodeLinks) {
        const diagram = newDiagrams.find(d => d.id === link.sourceDiagramId);
        if (diagram) {
          const nodeLink: NodeLink = {
            nodeId: link.nodeId,
            targetDiagramId: link.targetDiagramId,
            label: link.label,
          };
          diagram.nodeLinks.push(nodeLink);
        }
      }

      // Add all new diagrams to state
      setDiagrams(prev => [...prev, ...newDiagrams]);

      // Navigate to the system overview
      const overviewDiagram = newDiagrams.find(d =>
        result.diagrams.find(s => s.id === d.id && s.level === 1)
      );
      if (overviewDiagram) {
        setActiveId(overviewDiagram.id);
      }

      setProgress({
        step: 'done',
        message: 'Import complete!',
        percent: 100,
        diagramsCreated: newDiagrams.length,
      });
    } catch (err: any) {
      setProgress({
        step: 'error',
        message: err.message || 'An error occurred during import.',
        percent: 0,
      });
    } finally {
      setIsImporting(false);
    }
  }, [repos, activeWorkspaceId, createFolderProgrammatic, setDiagrams, setActiveId]);

  const resetProgress = useCallback(() => {
    setProgress(null);
  }, []);

  return { progress, isImporting, startImport, resetProgress };
};
