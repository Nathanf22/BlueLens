import { useState, useCallback } from 'react';
import { ScanResult, DiagramNodeInfo, Diagram, LLMSettings, RepoConfig, SyncMode, SyncStatus, SyncSuggestion } from '../types';
import { codeScannerService } from '../services/codeScannerService';
import { llmService } from '../services/llmService';
import { cleanMermaidResponse } from '../services/llmService';

export const useScanHandlers = (
  activeDiagram: Diagram | undefined,
  updateActiveDiagram: (updates: Partial<Diagram>) => void,
  llmSettings: LLMSettings,
  workspaceRepos: RepoConfig[]
) => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('manual');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('unknown');

  const getDiagramNodes = useCallback((): DiagramNodeInfo[] => {
    const svgElement = document.querySelector('.mermaid-svg-container svg') as SVGElement | null;
    if (!svgElement) return [];

    const nodeElements = svgElement.querySelectorAll<SVGGElement>('.node');
    const nodes: DiagramNodeInfo[] = [];

    nodeElements.forEach(el => {
      const svgId = el.id || '';
      let nodeId = svgId;
      const match1 = svgId.match(/flowchart-([^-]+)-/);
      if (match1) nodeId = match1[1];
      else {
        const match2 = svgId.match(/node-(.+)/);
        if (match2) nodeId = match2[1];
      }

      let label = '';
      const nodeLabel = el.querySelector('.nodeLabel');
      if (nodeLabel) label = nodeLabel.textContent?.trim() || '';
      if (!label) {
        const textEl = el.querySelector('text');
        if (textEl) label = textEl.textContent?.trim() || '';
      }

      if (label) {
        nodes.push({ nodeId, label });
      }
    });

    return nodes;
  }, []);

  const computeSyncStatus = useCallback((result: ScanResult): SyncStatus => {
    if (result.missingInDiagram.length === 0 && result.missingInCode.length === 0) {
      return 'synced';
    }
    if (result.missingInDiagram.length > 0 && result.missingInCode.length > 0) {
      return 'conflicts';
    }
    return 'suggestions';
  }, []);

  const addMissingToDiagram = useCallback(async (entityNames: string[]) => {
    if (!activeDiagram || entityNames.length === 0) return;

    const currentCode = activeDiagram.code;
    const prompt = `Add the following entities as new nodes to this Mermaid diagram. Connect them logically to existing nodes where it makes sense.\n\nEntities to add: ${entityNames.join(', ')}\n\nCurrent diagram:\n\`\`\`mermaid\n${currentCode}\n\`\`\`\n\nReturn the complete updated diagram in a mermaid code block.`;

    try {
      const activeConfig = llmSettings.providers[llmSettings.activeProvider];
      if (activeConfig?.apiKey) {
        const response = await llmService.sendMessage(
          [{ role: 'user', content: prompt }],
          'You are a Mermaid.js diagram expert. Return only the complete updated diagram in a mermaid code block.',
          llmSettings
        );
        const cleaned = cleanMermaidResponse(response.content);
        if (cleaned) {
          updateActiveDiagram({ code: cleaned });
          return;
        }
      }
    } catch {
      // Fall through to manual append
    }

    // Fallback: append nodes manually
    const newNodes = entityNames.map(name => {
      const id = name.replace(/[^a-zA-Z0-9]/g, '');
      return `    ${id}[${name}]`;
    }).join('\n');

    updateActiveDiagram({ code: currentCode + '\n' + newNodes });
  }, [activeDiagram, updateActiveDiagram, llmSettings]);

  const applySuggestion = useCallback(async (suggestion: SyncSuggestion) => {
    if (!activeDiagram) return;

    switch (suggestion.type) {
      case 'add_component':
        if (suggestion.entity) {
          await addMissingToDiagram([suggestion.entity.name]);
        }
        break;
      case 'mark_obsolete':
        // Add a style/comment to mark the node as potentially obsolete
        if (suggestion.nodeInfo) {
          const code = activeDiagram.code;
          const obsoleteComment = `\n    %% OBSOLETE? ${suggestion.nodeInfo.label} - not found in code`;
          updateActiveDiagram({ code: code + obsoleteComment });
        }
        break;
      case 'update_relationship':
        // Rename node label in diagram code
        if (suggestion.nodeInfo && suggestion.entity) {
          const code = activeDiagram.code;
          const oldLabel = suggestion.nodeInfo.label;
          const newLabel = suggestion.entity.name;
          const updated = code.replace(
            new RegExp(`\\[${oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`),
            `[${newLabel}]`
          );
          if (updated !== code) {
            updateActiveDiagram({ code: updated });
          }
        }
        break;
    }
  }, [activeDiagram, updateActiveDiagram, addMissingToDiagram]);

  const applyAllSuggestions = useCallback(async (suggestions: SyncSuggestion[]) => {
    // Apply add_component suggestions in batch
    const additions = suggestions.filter(s => s.type === 'add_component' && s.entity);
    if (additions.length > 0) {
      await addMissingToDiagram(additions.map(s => s.entity!.name));
    }

    // Apply other suggestions sequentially
    for (const s of suggestions) {
      if (s.type !== 'add_component') {
        await applySuggestion(s);
      }
    }
  }, [addMissingToDiagram, applySuggestion]);

  const runScan = useCallback(async (repoId: string) => {
    if (!activeDiagram) return;

    const repo = workspaceRepos.find(r => r.id === repoId);
    if (!repo) {
      setScanError('Repository not found');
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      const diagramNodes = getDiagramNodes();
      const result = await codeScannerService.fullScan(
        repoId,
        repo.name,
        activeDiagram.id,
        diagramNodes,
        repo.scanConfig
      );
      setScanResult(result);

      const status = computeSyncStatus(result);
      setSyncStatus(status);

      // Auto-apply in semi-auto mode: apply add_component suggestions only
      if (syncMode === 'semi-auto' && result.suggestions.length > 0) {
        const addSuggestions = result.suggestions.filter(s => s.type === 'add_component');
        if (addSuggestions.length > 0) {
          await addMissingToDiagram(addSuggestions.map(s => s.entity!.name));
        }
      }

      // Auto mode: apply all additions, mark obsolete for review
      if (syncMode === 'auto' && result.suggestions.length > 0) {
        const addSuggestions = result.suggestions.filter(s => s.type === 'add_component');
        if (addSuggestions.length > 0) {
          await addMissingToDiagram(addSuggestions.map(s => s.entity!.name));
        }
      }
    } catch (err: any) {
      setScanError(err.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [activeDiagram, workspaceRepos, getDiagramNodes, syncMode, computeSyncStatus, addMissingToDiagram]);

  const clearScanResult = useCallback(() => {
    setScanResult(null);
    setScanError(null);
  }, []);

  return {
    scanResult,
    isScanning,
    scanError,
    runScan,
    addMissingToDiagram,
    clearScanResult,
    syncMode,
    setSyncMode,
    syncStatus,
    applySuggestion,
    applyAllSuggestions,
  };
};
