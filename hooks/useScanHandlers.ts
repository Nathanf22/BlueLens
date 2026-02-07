import { useState, useCallback } from 'react';
import { ScanResult, DiagramNodeInfo, Diagram, LLMSettings, RepoConfig } from '../types';
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

  const getDiagramNodes = useCallback((): DiagramNodeInfo[] => {
    // Parse nodes from the rendered SVG in the DOM
    const svgElement = document.querySelector('#mermaid-preview svg') as SVGElement | null;
    if (!svgElement) return [];

    const nodeElements = svgElement.querySelectorAll<SVGGElement>('.node');
    const nodes: DiagramNodeInfo[] = [];

    nodeElements.forEach(el => {
      const svgId = el.id || '';
      // Extract mermaid node ID
      let nodeId = svgId;
      const match1 = svgId.match(/flowchart-([^-]+)-/);
      if (match1) nodeId = match1[1];
      else {
        const match2 = svgId.match(/node-(.+)/);
        if (match2) nodeId = match2[1];
      }

      // Get label
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
        diagramNodes
      );
      setScanResult(result);
    } catch (err: any) {
      setScanError(err.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [activeDiagram, workspaceRepos, getDiagramNodes]);

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
    const newNodes = entityNames.map((name, i) => {
      const id = name.replace(/[^a-zA-Z0-9]/g, '');
      return `    ${id}[${name}]`;
    }).join('\n');

    updateActiveDiagram({ code: currentCode + '\n' + newNodes });
  }, [activeDiagram, updateActiveDiagram, llmSettings]);

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
  };
};
